import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const AE_DB_PATH = path.join(process.cwd(), 'ae-links.json');

function getDb(): Record<string, string[]> {
  try {
    if (fs.existsSync(AE_DB_PATH)) {
      return JSON.parse(fs.readFileSync(AE_DB_PATH, 'utf-8'));
    }
  } catch {}
  return {};
}

function saveDb(db: Record<string, string[]>) {
  fs.writeFileSync(AE_DB_PATH, JSON.stringify(db, null, 2));
}

function findAepFiles(dir: string, files: string[] = [], depth = 0) {
  if (depth > 6) return files;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        findAepFiles(fullPath, files, depth + 1);
      } else if (entry.name.toLowerCase().endsWith('.aep')) {
        files.push(fullPath);
      }
    }
  } catch {}
  return files;
}

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
      // Remove any weird trailing characters that might have matched
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

export async function POST(request: NextRequest) {
  try {
    const { dirPath } = await request.json();
    if (!dirPath) return NextResponse.json({ error: 'Falta dirPath' }, { status: 400 });

    const aepFiles = findAepFiles(dirPath);
    const db = getDb();
    let scanned = 0;
    let linksFound = 0;

    for (const aep of aepFiles) {
      const dependencies = extractPathsFromAEP(aep);
      scanned++;
      for (const dep of dependencies) {
        if (!db[dep]) db[dep] = [];
        if (!db[dep].includes(aep)) {
          db[dep].push(aep);
          linksFound++;
        }
      }
    }

    saveDb(db);

    return NextResponse.json({ success: true, scanned, linksFound, aepFilesFound: aepFiles.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
