import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { ORGANIZE_RULES } from '@/lib/file-types';
import { OrganizePreview } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { sourcePath, preview = true, execute = false } = await request.json();
    const normalPath = path.normalize(sourcePath);

    const entries = fs.readdirSync(normalPath, { withFileTypes: true });
    const moves: OrganizePreview['moves'] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) continue;
      const ext = path.extname(entry.name).replace('.', '').toLowerCase();

      let targetFolder: string | null = null;
      for (const [folder, exts] of Object.entries(ORGANIZE_RULES)) {
        if (exts.includes(ext)) {
          targetFolder = folder;
          break;
        }
      }

      if (targetFolder) {
        const from = path.join(normalPath, entry.name);
        const to = path.join(normalPath, targetFolder, entry.name);
        moves.push({ from, to, name: entry.name });
      }
    }

    if (!preview && execute) {
      for (const move of moves) {
        const destDir = path.dirname(move.to);
        fs.mkdirSync(destDir, { recursive: true });
        fs.renameSync(move.from, move.to);
      }
      return NextResponse.json({ success: true, moved: moves.length });
    }

    return NextResponse.json({ moves, sourcePath: normalPath } as OrganizePreview);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
