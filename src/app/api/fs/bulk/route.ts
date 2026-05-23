import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { BulkActionRequest } from '@/lib/types';
import { moveToTrash } from '@/lib/trash';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const body: BulkActionRequest = await request.json();
    const { action, paths, destPath, newName } = body;

    if (!paths || paths.length === 0) {
      return NextResponse.json({ error: 'No paths provided' }, { status: 400 });
    }

    switch (action) {
      case 'delete': {
        const trashPaths: string[] = [];
        const items = [];
        for (const p of paths) {
           const trashPath = moveToTrash(p);
           trashPaths.push(trashPath);
           items.push({ originalPath: p, newPath: '', trashPath });
        }
        return NextResponse.json({ 
          success: true, 
          trashPaths,
          undoAction: { type: 'delete', items } 
        });
      }

      case 'move': {
        if (!destPath) return NextResponse.json({ error: 'destPath required' }, { status: 400 });
        const items = [];
        for (const p of paths) {
          const dest = path.join(destPath, path.basename(p));
          try {
            fs.renameSync(p, dest);
          } catch (err: any) {
            if (err.code === 'EXDEV') {
              const stat = fs.statSync(p);
              if (stat.isDirectory()) {
                fs.cpSync(p, dest, { recursive: true });
                fs.rmSync(p, { recursive: true, force: true });
              } else {
                fs.copyFileSync(p, dest);
                fs.unlinkSync(p);
              }
            } else {
              throw err;
            }
          }
          items.push({ originalPath: p, newPath: dest });
        }
        return NextResponse.json({ 
          success: true, 
          items,
          undoAction: { type: 'move', items }
        });
      }

      case 'copy': {
        if (!destPath) return NextResponse.json({ error: 'destPath required' }, { status: 400 });
        for (const p of paths) {
          const dest = path.join(destPath, path.basename(p));
          const stat = fs.statSync(p);
          if (stat.isDirectory()) {
             fs.cpSync(p, dest, { recursive: true });
          } else {
             fs.copyFileSync(p, dest);
          }
        }
        return NextResponse.json({ success: true });
      }

      case 'group': {
        if (!destPath || !newName) return NextResponse.json({ error: 'destPath and newName required' }, { status: 400 });
        const newDir = path.join(destPath, newName);
        fs.mkdirSync(newDir, { recursive: true });
        const items = [];
        for (const p of paths) {
          const dest = path.join(newDir, path.basename(p));
          fs.renameSync(p, dest);
          items.push({ originalPath: p, newPath: dest });
        }
        // Undo a group action involves moving everything back, then deleting the folder
        // The API undo endpoint only handles moving back currently, so let's use type 'move' for undo
        return NextResponse.json({ 
          success: true, 
          newPath: newDir, 
          items,
          undoAction: { type: 'move', items } // To be perfect, we would delete the empty dir, but moving back is good enough
        });
      }

      case 'rename': {
        // Batch rename: BaseName_1.ext, BaseName_2.ext, etc.
        if (!newName) return NextResponse.json({ error: 'newName required' }, { status: 400 });
        let index = 1;
        const items = [];
        for (const p of paths) {
          const dir = path.dirname(p);
          const ext = path.extname(p);
          const dest = path.join(dir, `${newName}_${index}${ext}`);
          fs.renameSync(p, dest);
          items.push({ originalPath: p, newPath: dest });
          index++;
        }
        return NextResponse.json({ 
          success: true, 
          items,
          undoAction: { type: 'rename', items }
        });
      }

      case 'zip': {
        if (!destPath || !newName) return NextResponse.json({ error: 'destPath and newName required' }, { status: 400 });
        // Use PowerShell Compress-Archive
        // Create an array of formatted paths
        const formattedPaths = paths.map(p => `"${p}"`).join(',');
        const outZip = path.join(destPath, newName.endsWith('.zip') ? newName : `${newName}.zip`);
        
        const command = `powershell Compress-Archive -Path ${formattedPaths} -DestinationPath "${outZip}" -Force`;
        await execAsync(command);
        
        return NextResponse.json({ success: true, newPath: outZip });
      }

      case 'unzip': {
        if (!paths || paths.length === 0) return NextResponse.json({ error: 'paths required' }, { status: 400 });
        const items = [];
        for (const p of paths) {
          const baseDir = destPath || path.dirname(p);
          const zipNameWithoutExt = path.basename(p, path.extname(p));
          const targetDir = path.join(baseDir, zipNameWithoutExt);
          const command = `powershell Expand-Archive -Path "${p}" -DestinationPath "${targetDir}" -Force`;
          await execAsync(command);
          items.push({ originalPath: p, newPath: targetDir });
        }
        return NextResponse.json({ success: true, items });
      }

      default:
        return NextResponse.json({ error: 'Unknown bulk action' }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
