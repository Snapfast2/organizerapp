import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(req: Request) {
  try {
    const { targetPath } = await req.json();
    if (!targetPath || !fs.existsSync(targetPath)) {
      return NextResponse.json({ error: 'Ruta inválida' }, { status: 400 });
    }

    const basename = path.basename(targetPath);
    const safeName = basename.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const zipName = `${safeName}_${Date.now()}.zip`;
    const zipPath = path.join(os.tmpdir(), zipName);
    const parentDir = path.dirname(targetPath);

    // En Windows 10+, tar.exe soporta creación de .zip
    // Usamos -C implícitamente ejecutando el comando desde el parentDir
    const cmd = `tar.exe -a -c -f "${zipPath}" "${basename}"`;

    await execAsync(cmd, { cwd: parentDir });

    return NextResponse.json({ success: true, zipPath, zipName });
  } catch (error: any) {
    console.error('Error compressing file:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
