import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';

export async function POST(request: NextRequest) {
  try {
    const { filePath } = await request.json();
    if (!filePath) return NextResponse.json({ error: 'Falta filePath' }, { status: 400 });

    const normalPath = path.normalize(filePath);

    if (!fs.existsSync(normalPath)) {
      return NextResponse.json({ error: 'El archivo no existe' }, { status: 404 });
    }

    // Use execFile instead of exec to avoid shell injection via filePath.
    // explorer.exe /select,<path> highlights the file in Explorer.
    // Note: /select, and the path must be a single argument string on Windows.
    execFile('explorer.exe', [`/select,${normalPath}`], (error) => {
      if (error) console.error('Error opening folder:', error);
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
