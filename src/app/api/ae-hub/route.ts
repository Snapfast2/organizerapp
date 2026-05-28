import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import util from 'util';

const execFileAsync = util.promisify(execFile);

const AE_PROJECTS_DB_PATH = path.join(process.cwd(), 'ae-projects.json');
const AE_LINKS_DB_PATH = path.join(process.cwd(), 'ae-links.json');

interface RecentProject {
  path: string;
  name: string;
  lastOpened: string;
  size?: number;
  dependencyCount?: number;
  exists?: boolean;
  colorLabel?: string; // AE-style color label: 'none'|'red'|'yellow'|'green'|'blue'|'purple'|'pink'
  projectFolder?: string; // Root folder of the project (contains .aep + Assets/ Renders/ etc.)
}

// Extension → Assets subfolder mapping
const EXT_TO_FOLDER: Record<string, string> = {
  png: 'Images', jpg: 'Images', jpeg: 'Images', webp: 'Images', tif: 'Images',
  tiff: 'Images', exr: 'Images', nef: 'Images', dpx: 'Images', psd: 'Images',
  gif: 'Images',
  mp4: 'Video', mov: 'Video', avi: 'Video', mkv: 'Video', webm: 'Video',
  mxf: 'Video', m4v: 'Video', '3gp': 'Video',
  mp3: 'Audio', wav: 'Audio', aac: 'Audio', flac: 'Audio', aif: 'Audio',
  aiff: 'Audio', ogg: 'Audio', m4a: 'Audio',
  ai: 'Vector', svg: 'Vector', eps: 'Vector',
  ttf: 'Fonts', otf: 'Fonts',
  c4d: 'Other', jsx: 'Other', jsxbin: 'Other', txt: 'Other', json: 'Other',
};

function getAssetSubfolder(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  return EXT_TO_FOLDER[ext] || 'Other';
}

function createProjectFolderStructure(projectFolder: string) {
  const subfolders = [
    'Assets/Images', 'Assets/Video', 'Assets/Audio',
    'Assets/Vector', 'Assets/Fonts', 'Assets/Other',
    'Renders', 'Exports'
  ];
  fs.mkdirSync(projectFolder, { recursive: true });
  for (const sub of subfolders) {
    fs.mkdirSync(path.join(projectFolder, sub), { recursive: true });
  }
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
  const content = JSON.stringify(db, null, 2);
  // Write to temp file first, then atomically rename to avoid corruption from concurrent writes
  const tmpPath = path.join(os.tmpdir(), `ae-projects-${Date.now()}.tmp.json`);
  fs.writeFileSync(tmpPath, content, 'utf-8');
  fs.renameSync(tmpPath, AE_PROJECTS_DB_PATH);
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

        // Strip chars dangerous in filesystem paths and JSX string literals
        const safeName = name
          .replace(/\.aep$/i, '')
          .replace(/["'\\/<>:|?*\x00-\x1f]/g, '')
          .trim();
        if (!safeName) return NextResponse.json({ error: 'Nombre de proyecto inválido' }, { status: 400 });

        const rootDir = directory || 'E:\\Motion';
        const projectFolder = path.join(rootDir, safeName);

        try {
          createProjectFolderStructure(projectFolder);
        } catch (e: any) {
          return NextResponse.json({ error: `No se pudo crear la carpeta: ${e.message}` }, { status: 500 });
        }

        const cleanName = `${safeName}.aep`;
        const fullPath = path.join(projectFolder, cleanName);

        // Find AE path via registry (execFile avoids shell injection)
        let aePath = '';
        try {
          const { stdout: regOut } = await execFileAsync('reg', [
            'query',
            'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\AfterFX.exe',
            '/ve'
          ]);
          const match = regOut.match(/REG_SZ\s+(.+)$/im);
          if (match) aePath = match[1].trim();
        } catch {
          const fallback = 'C:\\Program Files\\Adobe\\Adobe After Effects 2024\\Support Files\\AfterFX.exe';
          if (fs.existsSync(fallback)) aePath = fallback;
        }

        if (!aePath) {
          return NextResponse.json({ error: 'No se encontró la instalación de After Effects' }, { status: 404 });
        }

        // Copy the blank template instead of generating via script
        const templatePath = path.join(process.cwd(), 'public', 'blank.aep');
        try {
          fs.copyFileSync(templatePath, fullPath);
        } catch (e: any) {
          return NextResponse.json({ error: `No se pudo crear el archivo AEP: ${e.message}` }, { status: 500 });
        }

        // Open the newly created .aep file directly. 
        // If AE is closed, it launches and stays open. If AE is open, it just opens the file.
        execFile('cmd', ['/c', 'start', '""', fullPath], (err) => {
          if (err) console.error('Error al abrir proyecto en AE:', err);
        });

        db.recentProjects = db.recentProjects.filter(p => path.normalize(p.path) !== path.normalize(fullPath));
        db.recentProjects.unshift({
          path: fullPath,
          name: cleanName,
          lastOpened: new Date().toISOString(),
          projectFolder
        });
        if (db.recentProjects.length > 20) db.recentProjects = db.recentProjects.slice(0, 20);

        saveProjectsDb(db);
        return NextResponse.json({ success: true, path: fullPath, projectFolder });
      }

      // ── Register any .aep in the Hub at its current path (no moving) ──
      case 'register-project': {
        const { filePath: aepPath } = body;
        if (!aepPath) return NextResponse.json({ error: 'Falta filePath' }, { status: 400 });

        const normAepPath = path.normalize(aepPath);
        if (!fs.existsSync(normAepPath)) {
          return NextResponse.json({ error: 'El archivo .aep no existe' }, { status: 404 });
        }

        const aepName = path.basename(normAepPath);

        // Detect if the .aep is already in its own named folder
        const aepBase = path.basename(normAepPath, '.aep');
        const parentDir = path.dirname(normAepPath);
        const projectFolder = path.basename(parentDir) === aepBase ? parentDir : undefined;

        // Check if it's already in the Hub
        const already = db.recentProjects.find(
          p => path.normalize(p.path).toLowerCase() === normAepPath.toLowerCase()
        );
        if (already) {
          // Bump to top
          db.recentProjects = db.recentProjects.filter(
            p => path.normalize(p.path).toLowerCase() !== normAepPath.toLowerCase()
          );
          db.recentProjects.unshift({ ...already, lastOpened: new Date().toISOString(), projectFolder: already.projectFolder || projectFolder });
          saveProjectsDb(db);
          return NextResponse.json({ success: true, alreadyRegistered: true, path: normAepPath });
        }

        db.recentProjects.unshift({
          path: normAepPath,
          name: aepName,
          lastOpened: new Date().toISOString(),
          projectFolder,
        });
        if (db.recentProjects.length > 20) db.recentProjects = db.recentProjects.slice(0, 20);
        saveProjectsDb(db);

        return NextResponse.json({ success: true, path: normAepPath, projectFolder });
      }

      case 'migrate-project': {
        const { filePath: aepPath, targetDirectory } = body;
        if (!aepPath) return NextResponse.json({ error: 'Falta filePath' }, { status: 400 });

        const normAepPath = path.normalize(aepPath);
        if (!fs.existsSync(normAepPath)) {
          return NextResponse.json({ error: 'El archivo .aep no existe' }, { status: 404 });
        }

        const aepBaseName = path.basename(normAepPath, '.aep');
        // If targetDirectory is provided (e.g. E:\Motion), move there. Otherwise same dir.
        const destRoot = targetDirectory ? path.normalize(targetDirectory) : path.dirname(normAepPath);

        // Check if already inside its own folder — only relevant when NOT moving to a new dir
        if (!targetDirectory && path.basename(path.dirname(normAepPath)) === aepBaseName) {
          return NextResponse.json({ error: 'El proyecto ya tiene su propia carpeta' }, { status: 400 });
        }

        const projectFolder = path.join(destRoot, aepBaseName);
        const newAepPath = path.join(projectFolder, `${aepBaseName}.aep`);

        if (normAepPath.toLowerCase() === newAepPath.toLowerCase()) {
          return NextResponse.json({ error: 'El proyecto ya se encuentra organizado en este destino' }, { status: 400 });
        }

        // Create the folder structure
        try {
          createProjectFolderStructure(projectFolder);
        } catch (e: any) {
          return NextResponse.json({ error: `Error al crear estructura: ${e.message}` }, { status: 500 });
        }

        // Move the .aep into the new folder
        fs.copyFileSync(normAepPath, newAepPath);

        // Find all linked assets for this project
        const linksDb = getLinksDb();
        const oldToNew: Record<string, string> = {};
        const copiedAssets: string[] = [];
        const missingAssets: string[] = [];

        for (const [assetPath, projects] of Object.entries(linksDb)) {
          const linkedToThis = projects.some(
            p => path.normalize(p).toLowerCase() === normAepPath.toLowerCase()
          );
          if (!linkedToThis) continue;

          if (!fs.existsSync(assetPath)) {
            missingAssets.push(assetPath);
            continue;
          }

          const subfolder = getAssetSubfolder(assetPath);
          const destDir = path.join(projectFolder, 'Assets', subfolder);
          const destPath = path.join(destDir, path.basename(assetPath));

          // If destPath already exists, add a suffix to avoid collision
          const finalDest = fs.existsSync(destPath)
            ? path.join(destDir, `${path.basename(assetPath, path.extname(assetPath))}_copy${path.extname(assetPath)}`)
            : destPath;

          try {
            fs.copyFileSync(assetPath, finalDest);
            oldToNew[assetPath] = finalDest;
            copiedAssets.push(finalDest);
          } catch (copyErr) {
            missingAssets.push(assetPath);
          }
        }

        // Build a relinking ExtendScript if AE is available
        let relinkScript = '';
        if (Object.keys(oldToNew).length > 0) {
          const mapping = JSON.stringify(oldToNew).replace(/\\/g, '/');
          relinkScript = `
            try {
              var mapping = ${mapping.replace(/\\/g, '/')};
              var normMap = {};
              for (var k in mapping) {
                normMap[k.replace(/\\\\/g, '/')] = mapping[k].replace(/\\\\/g, '/');
              }
              for (var i = 1; i <= app.project.items.length; i++) {
                var item = app.project.items[i];
                if (item instanceof FootageItem && item.file) {
                  var fp = item.file.fsName.replace(/\\\\/g, '/');
                  if (normMap[fp]) {
                    var nf = new File(normMap[fp]);
                    if (nf.exists) {
                      item.replace(new ImportOptions(nf));
                    }
                  }
                }
              }
              app.project.save();
            } catch(e) {}
          `;
        }

        // Delete original .aep after copy
        try { fs.unlinkSync(normAepPath); } catch {}

        // Update DB
        const projectEntry = db.recentProjects.find(
          p => path.normalize(p.path).toLowerCase() === normAepPath.toLowerCase()
        );
        if (projectEntry) {
          projectEntry.path = newAepPath;
          projectEntry.name = `${aepBaseName}.aep`;
          projectEntry.projectFolder = projectFolder;
        } else {
          db.recentProjects.unshift({
            path: newAepPath,
            name: `${aepBaseName}.aep`,
            lastOpened: new Date().toISOString(),
            projectFolder
          });
        }
        // Update group references
        db.groups.forEach(g => {
          g.projectPaths = g.projectPaths.map(p =>
            path.normalize(p).toLowerCase() === normAepPath.toLowerCase() ? newAepPath : p
          );
        });
        saveProjectsDb(db);

        return NextResponse.json({
          success: true,
          newAepPath,
          projectFolder,
          copiedAssets: copiedAssets.length,
          missingAssets,
          relinkScript: relinkScript.trim() || null
        });
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

      case 'set-color-label': {
        const { filePath, colorLabel } = body;
        if (!filePath) return NextResponse.json({ error: 'Falta filePath' }, { status: 400 });

        const normPath = path.normalize(filePath);
        const project = db.recentProjects.find(p => path.normalize(p.path) === normPath);
        if (!project) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

        project.colorLabel = colorLabel || 'none';
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
