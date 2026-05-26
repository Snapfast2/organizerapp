import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

const AE_PROJECTS_DB_PATH = path.join(process.cwd(), 'ae-projects.json');
const AE_LINKS_DB_PATH = path.join(process.cwd(), 'ae-links.json');

interface RecentProject {
  path: string;
  name: string;
  lastOpened: string;
  size?: number;
  dependencyCount?: number;
  exists?: boolean;
}

interface VisualGroup {
  id: string;
  name: string;
  projectPaths: string[];
}

interface HubDb {
  recentProjects: RecentProject[];
  groups: VisualGroup[];
}

function getProjectsDb(): HubDb {
  try {
    if (fs.existsSync(AE_PROJECTS_DB_PATH)) {
      const data = JSON.parse(fs.readFileSync(AE_PROJECTS_DB_PATH, 'utf-8'));
      return {
        recentProjects: data.recentProjects || [],
        groups: data.groups || []
      };
    }
  } catch {}
  return { recentProjects: [], groups: [] };
}

function saveProjectsDb(db: HubDb) {
  fs.writeFileSync(AE_PROJECTS_DB_PATH, JSON.stringify(db, null, 2));
}

function getLinksDb(): Record<string, string[]> {
  try {
    if (fs.existsSync(AE_LINKS_DB_PATH)) {
      return JSON.parse(fs.readFileSync(AE_LINKS_DB_PATH, 'utf-8'));
    }
  } catch {}
  return {};
}

function getDependencyCount(aepPath: string, aeLinksDb: Record<string, string[]>): number {
  let count = 0;
  const normalizedAep = path.normalize(aepPath).toLowerCase();
  for (const assetPath in aeLinksDb) {
    const projects = aeLinksDb[assetPath] || [];
    if (projects.some(p => path.normalize(p).toLowerCase() === normalizedAep)) {
      count++;
    }
  }
  return count;
}

export async function GET() {
  try {
    const db = getProjectsDb();
    const linksDb = getLinksDb();

    // Validate existence of files and fetch size & dependency counts
    const validatedRecent = db.recentProjects.map(proj => {
      let fileExists = false;
      let fileSize = 0;
      try {
        if (fs.existsSync(proj.path)) {
          fileExists = true;
          fileSize = fs.statSync(proj.path).size;
        }
      } catch {}

      return {
        ...proj,
        size: fileSize,
        exists: fileExists,
        dependencyCount: getDependencyCount(proj.path, linksDb)
      };
    });

    return NextResponse.json({
      recentProjects: validatedRecent,
      groups: db.groups
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    const db = getProjectsDb();

    switch (action) {
      case 'add-recent': {
        const { filePath } = body;
        if (!filePath) return NextResponse.json({ error: 'Falta filePath' }, { status: 400 });

        const normPath = path.normalize(filePath);
        db.recentProjects = db.recentProjects.filter(p => path.normalize(p.path) !== normPath);
        db.recentProjects.unshift({
          path: normPath,
          name: path.basename(normPath),
          lastOpened: new Date().toISOString()
        });

        // Limit to 20
        if (db.recentProjects.length > 20) {
          db.recentProjects = db.recentProjects.slice(0, 20);
        }

        saveProjectsDb(db);
        return NextResponse.json({ success: true });
      }

      case 'remove-recent': {
        const { filePath } = body;
        if (!filePath) return NextResponse.json({ error: 'Falta filePath' }, { status: 400 });

        const normPath = path.normalize(filePath);
        db.recentProjects = db.recentProjects.filter(p => path.normalize(p.path) !== normPath);
        
        // Also remove from any groups
        db.groups.forEach(g => {
          g.projectPaths = g.projectPaths.filter(p => path.normalize(p) !== normPath);
        });

        saveProjectsDb(db);
        return NextResponse.json({ success: true });
      }

      case 'create-project': {
        const { name, directory } = body;
        if (!name) return NextResponse.json({ error: 'Falta nombre' }, { status: 400 });

        const targetDir = directory || 'E:\\Motion';
        
        // Ensure directory exists
        try {
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }
        } catch (e: any) {
          return NextResponse.json({ error: `No se pudo crear la carpeta: ${e.message}` }, { status: 500 });
        }

        const cleanName = name.endsWith('.aep') ? name : `${name}.aep`;
        const fullPath = path.join(targetDir, cleanName);

        // Find AE Path
        let aePath = '';
        try {
          const { stdout: regOut } = await execAsync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\AfterFX.exe" /ve');
          const match = regOut.match(/REG_SZ\s+(.+)$/im);
          if (match) {
            aePath = match[1].trim();
          }
        } catch {
          // Fallback to common path
          const fallback = 'C:\\Program Files\\Adobe\\Adobe After Effects 2024\\Support Files\\AfterFX.exe';
          if (fs.existsSync(fallback)) {
            aePath = fallback;
          }
        }

        if (!aePath) {
          return NextResponse.json({ error: 'No se encontró la instalación de After Effects' }, { status: 404 });
        }

        // Generate JSX Script
        const scriptContent = `
          try {
            app.newProject();
            var myFile = new File("${fullPath.replace(/\\/g, '/')}");
            app.project.save(myFile);
          } catch(e) {
            // silent error
          }
        `;

        const tempJsx = path.join(require('os').tmpdir(), `ae_create_${Date.now()}.jsx`);
        fs.writeFileSync(tempJsx, scriptContent);
        
        const evalScript = `$.evalFile('${tempJsx.replace(/\\/g, '/')}');`;

        // Run After Effects asynchronously so we don't block the API
        exec(`"${aePath}" -s "${evalScript}"`, (err) => {
          if (err) console.error("Error al abrir AE con el proyecto nuevo:", err);
        });

        // Add to recent projects
        db.recentProjects = db.recentProjects.filter(p => path.normalize(p.path) !== path.normalize(fullPath));
        db.recentProjects.unshift({
          path: fullPath,
          name: cleanName,
          lastOpened: new Date().toISOString()
        });

        saveProjectsDb(db);

        return NextResponse.json({ success: true, path: fullPath });
      }

      case 'create-group': {
        const { name } = body;
        if (!name) return NextResponse.json({ error: 'Falta nombre del grupo' }, { status: 400 });

        const newGroup: VisualGroup = {
          id: `group-${Date.now()}`,
          name,
          projectPaths: []
        };

        db.groups.push(newGroup);
        saveProjectsDb(db);
        return NextResponse.json({ success: true, group: newGroup });
      }

      case 'rename-group': {
        const { groupId, newName } = body;
        if (!groupId || !newName) return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });

        const group = db.groups.find(g => g.id === groupId);
        if (!group) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 });

        group.name = newName;
        saveProjectsDb(db);
        return NextResponse.json({ success: true });
      }

      case 'delete-group': {
        const { groupId } = body;
        if (!groupId) return NextResponse.json({ error: 'Falta groupId' }, { status: 400 });

        db.groups = db.groups.filter(g => g.id !== groupId);
        saveProjectsDb(db);
        return NextResponse.json({ success: true });
      }

      case 'add-to-group': {
        const { groupId, filePath } = body;
        if (!groupId || !filePath) return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });

        const group = db.groups.find(g => g.id === groupId);
        if (!group) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 });

        const normPath = path.normalize(filePath);
        // Remove from any other group if you want strict 1-to-1 grouping,
        // or just let it exist in one group. Let's do unique group membership
        // to keep it simple, or multiple groups? The user said "organizar los proyectos por proyecto por ejemplo End Game"
        // meaning each project belongs to a group. Let's remove it from any existing groups first.
        db.groups.forEach(g => {
          g.projectPaths = g.projectPaths.filter(p => path.normalize(p) !== normPath);
        });

        if (!group.projectPaths.some(p => path.normalize(p) === normPath)) {
          group.projectPaths.push(normPath);
        }

        saveProjectsDb(db);
        return NextResponse.json({ success: true });
      }

      case 'remove-from-group': {
        const { groupId, filePath } = body;
        if (!groupId || !filePath) return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });

        const group = db.groups.find(g => g.id === groupId);
        if (!group) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 });

        const normPath = path.normalize(filePath);
        group.projectPaths = group.projectPaths.filter(p => path.normalize(p) !== normPath);

        saveProjectsDb(db);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
