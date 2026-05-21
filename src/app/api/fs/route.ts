import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { FileEntry, DirectoryListing } from '@/lib/types';

// Limit parallel stat calls to avoid overwhelming the filesystem
async function statWithConcurrency<T>(
  items: T[],
  worker: (item: T) => Promise<FileEntry | null>,
  limit = 32
): Promise<(FileEntry | null)[]> {
  const results: (FileEntry | null)[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    const batchResults = await Promise.all(batch.map(worker));
    results.push(...batchResults);
  }
  return results;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  let dirPath = searchParams.get('path') || 'C:\\';

  try {
    dirPath = path.normalize(dirPath);

    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: 'Not a directory' }, { status: 400 });
    }

    const rawEntries = await fs.readdir(dirPath, { withFileTypes: true });

    const entries = (await statWithConcurrency(rawEntries, async (entry) => {
      try {
        const fullPath = path.join(dirPath, entry.name);
        const ext = entry.isDirectory() ? '' : path.extname(entry.name).replace('.', '').toLowerCase();
        
        const entryStat = await fs.stat(fullPath);
        return {
          name: entry.name,
          path: fullPath,
          isDir: entry.isDirectory(),
          size: entry.isDirectory() ? 0 : entryStat.size,
          modified: entryStat.mtime.toISOString(),
          created: entryStat.birthtime?.toISOString() || entryStat.mtime.toISOString(),
          ext,
        } as FileEntry;
      } catch {
        return null;
      }
    })).filter((e): e is FileEntry => e !== null);

    // Sort: directories first, then by name
    entries.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });

    const parentPath = dirPath !== path.parse(dirPath).root
      ? path.dirname(dirPath)
      : null;

    const result: DirectoryListing = { path: dirPath, parent: parentPath, entries };

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to read directory', path: dirPath, parent: null, entries: [] },
      { status: 500 }
    );
  }
}
