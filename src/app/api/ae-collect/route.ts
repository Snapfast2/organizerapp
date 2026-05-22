import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

function extractPathsFromAEP(aepPath: string): string[] {
  try {
    const buffer = fs.readFileSync(aepPath);
    const str8 = buffer.toString('utf8');
    const str16 = buffer.toString('utf16le');
    
    // Windows paths: C:\... or \\Network\...
    const regex = /(?:[A-Za-z]:\\|\\\\)[^\0\r\n\t*?"<>|]+/g;
    
    const matches8 = str8.match(regex) || [];
    const matches16 = str16.match(regex) || [];
    
    const allMatches = new Set([...matches8, ...matches16]);
    const validPaths: string[] = [];
    
    for (let m of allMatches) {
      m = m.trim();
      m = m.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
      if (m.length < 5) continue;
      
      const cleanPath = path.normalize(m);
      if (path.extname(cleanPath)) {
        try {
          if (fs.existsSync(cleanPath) && fs.statSync(cleanPath).isFile()) {
            validPaths.push(cleanPath);
          }
        } catch { /* ignore fs errors */ }
      }
    }
    
    return validPaths;
  } catch {
    return [];
  }
}

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { aepPath } = await request.json();
    if (!aepPath || !fs.existsSync(aepPath)) {
      return NextResponse.json({ error: 'Ruta inválida o archivo no existe' }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          send({ type: 'info', message: 'Analizando proyecto...' });
          
          const deps = extractPathsFromAEP(aepPath);
          const parsedPath = path.parse(aepPath);
          const destDirName = `${parsedPath.name}_Empaquetado`;
          const destDirPath = path.join(parsedPath.dir, destDirName);
          const footageDirPath = path.join(destDirPath, '(Footage)');

          if (!fs.existsSync(destDirPath)) fs.mkdirSync(destDirPath, { recursive: true });
          if (!fs.existsSync(footageDirPath)) fs.mkdirSync(footageDirPath, { recursive: true });

          const fileNames = deps.map(d => path.basename(d));
          send({ type: 'start', total: deps.length, files: fileNames });
          
          send({ type: 'info', message: 'Copiando archivo de proyecto...' });
          fs.copyFileSync(aepPath, path.join(destDirPath, parsedPath.base));

          send({ type: 'progress', copied: 0, total: deps.length, currentFile: '' });

          let copied = 0;
          let bytesTotal = 0;

          for (const dep of deps) {
            if (!fs.existsSync(dep)) {
              copied++;
              continue;
            }

            const depStats = fs.statSync(dep);
            const depName = path.basename(dep);
            let finalName = depName;
            let destPath = path.join(footageDirPath, finalName);
            
            // Handle collisions
            let counter = 1;
            while (fs.existsSync(destPath)) {
              const ext = path.extname(depName);
              const nameNoExt = path.basename(depName, ext);
              finalName = `${nameNoExt}_${counter}${ext}`;
              destPath = path.join(footageDirPath, finalName);
              counter++;
            }

            send({ type: 'progress', copied, total: deps.length, currentFile: depName });
            
            await fs.promises.copyFile(dep, destPath);
            
            copied++;
            bytesTotal += depStats.size;
            send({ type: 'progress', copied, total: deps.length, currentFile: depName });
          }

          send({ type: 'done', totalFiles: copied, totalBytes: bytesTotal, destPath: destDirPath });
          controller.close();
        } catch (err: any) {
          send({ type: 'error', message: err.message });
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
