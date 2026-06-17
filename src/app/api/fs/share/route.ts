import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

// Encuentra la carpeta raíz de Google Drive en Windows
function findGoogleDrivePath(): string | null {
  const candidates = [
    'G:\\My Drive',
    'H:\\My Drive',
    'I:\\My Drive',
    'F:\\My Drive',
    path.join(process.env.USERPROFILE || '', 'Google Drive', 'My Drive'),
    path.join(process.env.USERPROFILE || '', 'My Drive'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const { zipPath, fileName } = await req.json();

    if (!zipPath || !fs.existsSync(zipPath)) {
      return NextResponse.json({ error: 'Archivo zip no encontrado' }, { status: 400 });
    }

    const shareFolder = 'G:\\Shared drives\\3D Assets\\Video - End Game\\Share';
    if (!fs.existsSync(shareFolder)) {
      fs.mkdirSync(shareFolder, { recursive: true });
    }

    const destPath = path.join(shareFolder, fileName);

    // Copiar el zip a Google Drive (sincronización automática empieza de inmediato)
    fs.copyFileSync(zipPath, destPath);

    // Limpiar el temporal
    try { fs.unlinkSync(zipPath); } catch (e) {}

    // Abrir la carpeta en el Explorador de Windows para que el usuario comparta
    execAsync(`explorer.exe "${shareFolder}"`).catch(() => {});

    return NextResponse.json({
      success: true,
      localPath: destPath,
      shareFolder,
      message: 'Archivo copiado a Google Drive. Está sincronizando ahora.'
    });

  } catch (error: any) {
    console.error('Error sharing to Google Drive:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
