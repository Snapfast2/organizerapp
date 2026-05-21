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

  try {
    const normalized = path.normalize(dirPath);
    const allFiles = await walk(normalized);

    // 1. Group by size
    const bySize = new Map<number, string[]>();
    for (const f of allFiles) {
      const group = bySize.get(f.size) || [];
      group.push(f.path);
      bySize.set(f.size, group);
    }

    // Keep only groups with > 1 file
    const potentialDuplicates = Array.from(bySize.values()).filter(group => group.length > 1);

    const exactDuplicates: { hash: string; files: { path: string; size: number }[] }[] = [];

    // 2. Hash comparison
    for (const group of potentialDuplicates) {
      // Group by quick hash first (first 8KB) to save IO
      const byQuickHash = new Map<string, string[]>();
      for (const filePath of group) {
        try {
          const qHash = await getQuickHash(filePath);
          const qGroup = byQuickHash.get(qHash) || [];
          qGroup.push(filePath);
          byQuickHash.set(qHash, qGroup);
        } catch {}
      }

      const quickPotential = Array.from(byQuickHash.values()).filter(g => g.length > 1);

      // Now do full hash for those that passed quick hash
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

        // Add verified duplicates to results
        for (const [hash, files] of byFullHash.entries()) {
          if (files.length > 1) {
            // Get size from the first file
            const stat = await fs.stat(files[0]);
            exactDuplicates.push({
              hash,
              files: files.map(p => ({ path: p, size: stat.size }))
            });
          }
        }
      }
    }

    // Return the duplicates
    return NextResponse.json({ duplicates: exactDuplicates });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
