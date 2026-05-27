import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { ActionRequest } from '@/lib/types';
import { moveToTrash, restoreFromTrash } from '@/lib/trash';

// Atomic JSON write — write to tmp then rename to avoid partial-write corruption
function atomicWriteJson(filePath: string, data: unknown) {
  const content = JSON.stringify(data, null, 2);
  const tmpPath = path.join(os.tmpdir(), `moo-${Date.now()}.tmp.json`);
  fs.writeFileSync(tmpPath, content, 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

export async function POST(request: NextRequest) {
  try {
    const body: ActionRequest = await request.json();
    const { action, path: srcPath, newPath, newName } = body;

    switch (action) {
      case 'open': {
        // Open file with default application — use execFile to avoid shell injection
        if (process.platform === 'win32') {
          // cmd /c start is the safe way to open files on Windows without shell injection
          execFile('cmd', ['/c', 'start', '', srcPath]);
        } else if (process.platform === 'darwin') {
          execFile('open', [srcPath]);
        } else {
          execFile('xdg-open', [srcPath]);
        }

        // If it's an After Effects project, register it in recent projects
        if (srcPath.toLowerCase().endsWith('.aep')) {
          try {
            const AE_PROJECTS_DB_PATH = path.join(process.cwd(), 'ae-projects.json');
            let db: any = { recentProjects: [], groups: [] };
            if (fs.existsSync(AE_PROJECTS_DB_PATH)) {
              try { db = JSON.parse(fs.readFileSync(AE_PROJECTS_DB_PATH, 'utf-8')); } catch {}
            }
            if (!db.recentProjects) db.recentProjects = [];
            if (!db.groups) db.groups = [];

            const normPath = path.normalize(srcPath);
            db.recentProjects = db.recentProjects.filter((p: any) => path.normalize(p.path) !== normPath);
            db.recentProjects.unshift({
              path: normPath,
              name: path.basename(normPath),
              lastOpened: new Date().toISOString()
            });
            if (db.recentProjects.length > 20) db.recentProjects = db.recentProjects.slice(0, 20);
            atomicWriteJson(AE_PROJECTS_DB_PATH, db);
          } catch (e) {
            console.error('Error adding recent project from open action:', e);
          }
        }

        return NextResponse.json({ success: true });
      }

      case 'open-location': {
        // Open file location in native explorer — use execFile to avoid shell injection
        if (process.platform === 'win32') {
          execFile('explorer.exe', ['/select,', srcPath]);
        } else if (process.platform === 'darwin') {
          execFile('open', ['-R', srcPath]);
        } else {
          execFile('xdg-open', [path.dirname(srcPath)]);
        }
        return NextResponse.json({ success: true });
      }

      case 'rename': {
        if (!newName) return NextResponse.json({ error: 'newName required' }, { status: 400 });
        // Strip path separators to prevent path traversal (e.g. newName = "../../evil")
        const safeName = path.basename(newName);
        if (!safeName || safeName !== newName) {
          return NextResponse.json({ error: 'Nombre de archivo inválido' }, { status: 400 });
        }
        const dir = path.dirname(srcPath);
        const dest = path.join(dir, safeName);
        fs.renameSync(srcPath, dest);
        return NextResponse.json({
          success: true,
          newPath: dest,
          undoAction: { type: 'rename', items: [{ originalPath: srcPath, newPath: dest }] }
        });
      }

      case 'delete': {
        const trashPath = moveToTrash(srcPath);
        return NextResponse.json({
          success: true,
          trashPath,
          undoAction: { type: 'delete', items: [{ originalPath: srcPath, newPath: '', trashPath }] }
        });
      }

      case 'mkdir': {
        if (!newName) return NextResponse.json({ error: 'newName required' }, { status: 400 });
        const safeDirName = path.basename(newName);
        if (!safeDirName) return NextResponse.json({ error: 'Nombre de carpeta inválido' }, { status: 400 });
        const newDir = path.join(srcPath, safeDirName);
        fs.mkdirSync(newDir, { recursive: true });
        return NextResponse.json({
          success: true,
          newPath: newDir,
          undoAction: { type: 'mkdir', items: [{ originalPath: '', newPath: newDir }] }
        });
      }

      case 'move': {
        if (!newPath) return NextResponse.json({ error: 'newPath required' }, { status: 400 });
        const dest = path.join(newPath, path.basename(srcPath));
        fs.renameSync(srcPath, dest);
        return NextResponse.json({
          success: true,
          newPath: dest,
          undoAction: { type: 'move', items: [{ originalPath: srcPath, newPath: dest }] }
        });
      }

      case 'copy': {
        if (!newPath) return NextResponse.json({ error: 'newPath required' }, { status: 400 });
        const dest = path.join(newPath, path.basename(srcPath));
        fs.copyFileSync(srcPath, dest);
        return NextResponse.json({ success: true, newPath: dest });
      }

      case 'open-trash': {
        if (process.platform === 'win32') {
          execFile('explorer.exe', ['shell:RecycleBinFolder']);
        }
        return NextResponse.json({ success: true });
      }

      case 'undo': {
        const { undoAction } = body as any;
        if (undoAction.type === 'delete') {
          for (const item of undoAction.items) {
            try { restoreFromTrash(item.trashPath, item.originalPath); } catch {}
          }
        } else if (undoAction.type === 'move' || undoAction.type === 'rename') {
          for (const item of undoAction.items) {
            try { fs.renameSync(item.newPath, item.originalPath); } catch {}
          }
        } else if (undoAction.type === 'mkdir') {
          for (const item of undoAction.items) {
            try { fs.rmSync(item.newPath, { recursive: true, force: true }); } catch {}
          }
        }
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
