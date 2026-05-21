import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const { path: filePath, color, tags } = await request.json();
    if (!filePath) return NextResponse.json({ error: 'path required' }, { status: 400 });

    const dirPath = path.dirname(filePath);
    const fileName = path.basename(filePath);
    const metaPath = path.join(dirPath, '.fileorg.json');

    let metadata: Record<string, { color?: string; tags?: string[] }> = {};
    try {
      const metaContent = await fs.readFile(metaPath, 'utf8');
      metadata = JSON.parse(metaContent);
    } catch {
      // file doesn't exist yet, which is fine
    }

    if (!metadata[fileName]) {
      metadata[fileName] = {};
    }

    if (color !== undefined) {
      if (color === null || color === '') delete metadata[fileName].color;
      else metadata[fileName].color = color;
    }

    if (tags !== undefined) {
      if (tags === null || tags.length === 0) delete metadata[fileName].tags;
      else metadata[fileName].tags = tags;
    }

    // Clean up if object is empty
    if (Object.keys(metadata[fileName]).length === 0) {
      delete metadata[fileName];
    }

    // Determine if we should write or delete the meta file
    if (Object.keys(metadata).length === 0) {
      try { await fs.unlink(metaPath); } catch {}
    } else {
      // Write the file, optionally hiding it on Windows
      await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2), 'utf8');
      
      // Attempt to hide the file on Windows
      if (process.platform === 'win32') {
        const { exec } = require('child_process');
        exec(`attrib +h "${metaPath}"`, () => {});
      }
    }

    return NextResponse.json({ success: true, metadata: metadata[fileName] || null });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
