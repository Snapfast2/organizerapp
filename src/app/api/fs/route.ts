import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { FileEntry, DirectoryListing } from '@/lib/types';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  let dirPath = searchParams.get('path') || 'C:\\';

  try {
    // Normalize path
    dirPath = path.normalize(dirPath);

    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: 'Not a directory' }, { status: 400 });
    }

    const rawEntries = await fs.readdir(dirPath, { withFileTypes: true });

    // Concurrently fetch stats for all entries
    const entriesPromise = rawEntries.map(async (entry) => {
      try {
        const fullPath = path.join(dirPath, entry.name);
        const ext = entry.isDirectory() ? '' : path.extname(entry.name).replace('.', '').toLowerCase();
        
        let size = 0;
        let modified = new Date().toISOString();
        let created = new Date().toISOString();
        
        // Only stat files (directories don't need size for our simple listing)
        if (!entry.isDirectory()) {
          const entryStat = await fs.stat(fullPath);
          size = entryStat.size;
          modified = entryStat.mtime.toISOString();
          created = entryStat.birthtime?.toISOString() || modified;
        } else {
          // For directories we can quickly try to get modified date if needed, or just stat it
          const entryStat = await fs.stat(fullPath);
          modified = entryStat.mtime.toISOString();
          created = entryStat.birthtime?.toISOString() || modified;
        }

        return {
          name: entry.name,
          path: fullPath,
          isDir: entry.isDirectory(),
          size,
          modified,
          created,
          ext,
        } as FileEntry;
      } catch {
        return null; // Skip if access denied
      }
    });

    const resolvedEntries = await Promise.all(entriesPromise);
    const entries = resolvedEntries.filter((e): e is FileEntry => e !== null);

    // Sort: directories first, then files
    entries.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });

    const parentPath = dirPath !== path.parse(dirPath).root
      ? path.dirname(dirPath)
      : null;

    const result: DirectoryListing = {
      path: dirPath,
      parent: parentPath,
      entries,
    };

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to read directory', path: dirPath, parent: null, entries: [] },
      { status: 500 }
    );
  }
}
