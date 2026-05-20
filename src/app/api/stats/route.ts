import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { FileEntry, DiskStats } from '@/lib/types';

function walkDir(
  dirPath: string,
  allFiles: FileEntry[],
  depth = 0
) {
  if (depth > 4 || allFiles.length > 5000) return;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (allFiles.length > 5000) break;
      try {
        const fullPath = path.join(dirPath, entry.name);
        const stat = fs.statSync(fullPath);
        const ext = entry.isDirectory() ? '' : path.extname(entry.name).replace('.', '').toLowerCase();
        allFiles.push({
          name: entry.name,
          path: fullPath,
          isDir: entry.isDirectory(),
          size: entry.isDirectory() ? 0 : stat.size,
          created: stat.birthtime.toISOString(),
          modified: stat.mtime.toISOString(),
          ext,
        });
        if (entry.isDirectory()) {
          walkDir(fullPath, allFiles, depth + 1);
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const dirPath = path.normalize(searchParams.get('path') || 'C:\\Users');

  const allFiles: FileEntry[] = [];
  walkDir(dirPath, allFiles);

  const files = allFiles.filter(f => !f.isDir);
  const dirs = allFiles.filter(f => f.isDir);

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  const topFiles = [...files]
    .sort((a, b) => b.size - a.size)
    .slice(0, 10);

  const byType: Record<string, { count: number; size: number }> = {};
  for (const file of files) {
    const key = file.ext || 'sin extensión';
    if (!byType[key]) byType[key] = { count: 0, size: 0 };
    byType[key].count++;
    byType[key].size += file.size;
  }

  const stats: DiskStats = {
    path: dirPath,
    totalSize,
    fileCount: files.length,
    dirCount: dirs.length,
    topFiles,
    byType,
  };

  return NextResponse.json(stats);
}
