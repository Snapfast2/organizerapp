import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { ActionRequest } from '@/lib/types';
import { moveToTrash, restoreFromTrash } from '@/lib/trash';

export async function POST(request: NextRequest) {
  try {
    const body: ActionRequest = await request.json();
    const { action, path: srcPath, newPath, newName } = body;

    switch (action) {
      case 'open': {
        // Open file with default application
        const command = process.platform === 'win32' ? `start "" "${srcPath}"` :
                        process.platform === 'darwin' ? `open "${srcPath}"` :
                        `xdg-open "${srcPath}"`;
        exec(command);
        return NextResponse.json({ success: true });
      }

      case 'open-location': {
        // Open file location in native explorer
        const command = process.platform === 'win32' ? `explorer.exe /select,"${srcPath}"` :
                        process.platform === 'darwin' ? `open -R "${srcPath}"` :
                        `xdg-open "${path.dirname(srcPath)}"`;
        exec(command);
        return NextResponse.json({ success: true });
      }

      case 'rename': {
        if (!newName) return NextResponse.json({ error: 'newName required' }, { status: 400 });
        const dir = path.dirname(srcPath);
        const dest = path.join(dir, newName);
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
        const newDir = path.join(srcPath, newName);
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
        return NextResponse.json({ success: true, newPath: dest }); // copy can't easily be undone safely, omit undoAction
      }

      case 'open-trash': {
        if (process.platform === 'win32') {
          exec('explorer.exe shell:RecycleBinFolder');
        }
        return NextResponse.json({ success: true });
      }

      case 'undo': {
        const { undoAction } = body as any;
        if (undoAction.type === 'delete') {
          for (const item of undoAction.items) {
            try { restoreFromTrash(item.trashPath, item.originalPath); } catch (e) {}
          }
        } else if (undoAction.type === 'move' || undoAction.type === 'rename') {
          for (const item of undoAction.items) {
            try { fs.renameSync(item.newPath, item.originalPath); } catch (e) {}
          }
        } else if (undoAction.type === 'mkdir') {
          for (const item of undoAction.items) {
            try { fs.rmSync(item.newPath, { recursive: true, force: true }); } catch (e) {}
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
