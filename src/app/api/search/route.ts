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
    
    // Load metadata for this directory
    let metadata: Record<string, { color?: string; tags?: string[] }> = {};
    try {
      const metaContent = fs.readFileSync(path.join(dirPath, '.fileorg.json'), 'utf8');
      metadata = JSON.parse(metaContent);
    } catch { /* no metadata */ }

    const queryLower = query.toLowerCase();

    for (const entry of entries) {
      if (results.length >= 200) break;
      if (entry.name === '.fileorg.json') continue; // Skip metadata file

      try {
        const fullPath = path.join(dirPath, entry.name);
        const ext = entry.isDirectory() ? '' : path.extname(entry.name).replace('.', '').toLowerCase();
        const nameLower = entry.name.toLowerCase();
        
        // Get tags for this specific file
        const fileTags = metadata[entry.name]?.tags || [];
        const tagsString = fileTags.join(' ').toLowerCase();

        // Match name OR tags
        const matchesQuery = !query || nameLower.includes(queryLower) || tagsString.includes(queryLower);
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
            tags: fileTags,
            color: metadata[entry.name]?.color
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
  const query = searchParams.get('q') || searchParams.get('query') || '';
  const typeFilter = searchParams.get('type') || 'all';

  const results: FileEntry[] = [];
  searchDir(path.normalize(searchPath), query, typeFilter, results);

  return NextResponse.json({
    entries: results,
    query,
    searchPath,
  });
}
