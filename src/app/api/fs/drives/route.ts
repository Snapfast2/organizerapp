import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import path from 'path';

const execFileAsync = promisify(execFile);

export async function GET() {
  const home = os.homedir();
  const quickAccess = [
    { name: 'Escritorio', path: path.join(home, 'Desktop') },
    { name: 'Descargas', path: path.join(home, 'Downloads') },
    { name: 'Documentos', path: path.join(home, 'Documents') },
    { name: 'Imágenes', path: path.join(home, 'Pictures') },
    { name: 'Videos', path: path.join(home, 'Videos') },
    { name: 'Música', path: path.join(home, 'Music') },
  ];

  try {
    // Use PowerShell Get-PSDrive — works on all Windows versions including 11 24H2+
    // wmic was deprecated and removed in Windows 11 24H2
    const { stdout } = await execFileAsync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      'Get-PSDrive -PSProvider FileSystem | Select-Object -ExpandProperty Root'
    ]);
    const drives = stdout
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && /^[A-Z]:\\/i.test(line));

    return NextResponse.json({ drives: drives.length ? drives : ['C:\\'], quickAccess });
  } catch {
    return NextResponse.json({ drives: ['C:\\', 'D:\\'], quickAccess });
  }
}
