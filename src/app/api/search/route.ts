import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { FileEntry } from '@/lib/types';

function searchDir(
  dirPath: string,
  query: string,
  typeFilter: string,
  results: FileEntry[],
  depth = 0
) {
  if (depth > 5 || results.length >= 200) return;

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= 200) break;
      try {
        const fullPath = path.join(dirPath, entry.name);
        const ext = entry.isDirectory() ? '' : path.extname(entry.name).replace('.', '').toLowerCase();
        const nameLower = entry.name.toLowerCase();

        const matchesQuery = !query || nameLower.includes(query.toLowerCase());
        const matchesType = !typeFilter || typeFilter === 'all' || ext === typeFilter;

        if (matchesQuery && matchesType) {
          const stat = fs.statSync(fullPath);
          results.push({
            name: entry.name,
            path: fullPath,
            isDir: entry.isDirectory(),
            size: stat.size,
            created: stat.birthtime.toISOString(),
            modified: stat.mtime.toISOString(),
            ext,
          });
        }

        if (entry.isDirectory()) {
          searchDir(fullPath, query, typeFilter, results, depth + 1);
        }
      } catch {
        // skip
      }
    }
  } catch {
    // skip inaccessible dirs
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const searchPath = searchParams.get('path') || 'C:\\';
  const query = searchParams.get('query') || '';
  const typeFilter = searchParams.get('type') || 'all';

  const results: FileEntry[] = [];
  searchDir(path.normalize(searchPath), query, typeFilter, results);

  return NextResponse.json({
    entries: results,
    query,
    searchPath,
  });
}
