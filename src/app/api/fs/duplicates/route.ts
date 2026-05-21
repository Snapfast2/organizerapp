import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

interface FileInfo {
  path: string;
  size: number;
}

async function walk(dir: string, fileList: FileInfo[] = []) {
  try {
    const files = await fs.readdir(dir, { withFileTypes: true });
    for (const file of files) {
      if (file.name === 'System Volume Information' || file.name === '$RECYCLE.BIN' || file.name.startsWith('.git')) continue;
      
      const res = path.resolve(dir, file.name);
      if (file.isDirectory()) {
        await walk(res, fileList);
      } else {
        try {
          const stat = await fs.stat(res);
          // Only care about files > 0 bytes
          if (stat.size > 0) {
            fileList.push({ path: res, size: stat.size });
          }
        } catch { }
      }
    }
  } catch { }
  return fileList;
}

// Read first chunk (e.g. 8KB) to quickly weed out different files with same size
async function getQuickHash(filePath: string): Promise<string> {
  const fd = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(8192);
    const { bytesRead } = await fd.read(buffer, 0, 8192, 0);
    return crypto.createHash('sha256').update(buffer.subarray(0, bytesRead)).digest('hex');
  } finally {
    await fd.close();
  }
}

// Full file hash for true verification
function getFullHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = require('fs').createReadStream(filePath);
    stream.on('data', (data: Buffer) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export async function GET(request: NextRequest) {
  const dirPath = request.nextUrl.searchParams.get('path');
  if (!dirPath) return NextResponse.json({ error: 'path required' }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const normalized = path.normalize(dirPath);
        
        sendEvent({ type: 'progress', message: 'Escaneando archivos...', processed: 0, total: 0 });
        
        // Scan directory (we could stream this if we wanted, but fs.readdir is fairly fast)
        let scannedCount = 0;
        const allFiles: FileInfo[] = [];
        
        async function walkStream(dir: string) {
          try {
            const files = await fs.readdir(dir, { withFileTypes: true });
            for (const file of files) {
              if (file.name === 'System Volume Information' || file.name === '$RECYCLE.BIN' || file.name.startsWith('.git')) continue;
              
              const res = path.resolve(dir, file.name);
              if (file.isDirectory()) {
                await walkStream(res);
              } else {
                try {
                  const stat = await fs.stat(res);
                  if (stat.size > 0) {
                    allFiles.push({ path: res, size: stat.size });
                    scannedCount++;
                    if (scannedCount % 500 === 0) {
                      sendEvent({ type: 'progress', message: `Escaneando archivos...`, processed: scannedCount, total: 0 });
                    }
                  }
                } catch { }
              }
            }
          } catch { }
        }
        
        await walkStream(normalized);

        // 1. Group by size
        sendEvent({ type: 'progress', message: 'Agrupando por tamaño...', processed: 0, total: allFiles.length });
        const bySize = new Map<number, string[]>();
        for (const f of allFiles) {
          const group = bySize.get(f.size) || [];
          group.push(f.path);
          bySize.set(f.size, group);
        }

        const potentialDuplicates = Array.from(bySize.values()).filter(group => group.length > 1);
        const totalPotential = potentialDuplicates.reduce((acc, g) => acc + g.length, 0);

        const exactDuplicates: { hash: string; files: { path: string; size: number }[] }[] = [];

        // 2. Hash comparison
        let processedHashes = 0;
        
        for (const group of potentialDuplicates) {
          const byQuickHash = new Map<string, string[]>();
          for (const filePath of group) {
            try {
              const qHash = await getQuickHash(filePath);
              const qGroup = byQuickHash.get(qHash) || [];
              qGroup.push(filePath);
              byQuickHash.set(qHash, qGroup);
            } catch {}
            processedHashes++;
            if (processedHashes % 10 === 0) {
               sendEvent({ type: 'progress', message: 'Analizando contenido (Quick Hash)...', processed: processedHashes, total: totalPotential });
            }
          }

          const quickPotential = Array.from(byQuickHash.values()).filter(g => g.length > 1);

          for (const qGroup of quickPotential) {
            const byFullHash = new Map<string, string[]>();
            for (const filePath of qGroup) {
              try {
                const fHash = await getFullHash(filePath);
                const fGroup = byFullHash.get(fHash) || [];
                fGroup.push(filePath);
                byFullHash.set(fHash, fGroup);
              } catch {}
            }

            for (const [hash, files] of byFullHash.entries()) {
              if (files.length > 1) {
                const stat = await fs.stat(files[0]);
                exactDuplicates.push({
                  hash,
                  files: files.map(p => ({ path: p, size: stat.size }))
                });
              }
            }
          }
        }

        sendEvent({ type: 'result', duplicates: exactDuplicates });
      } catch (error: any) {
        sendEvent({ type: 'error', message: error.message });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
