import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import path from 'path';

const execAsync = promisify(exec);

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
    const { stdout } = await execAsync('wmic logicaldisk get name');
    const drives = stdout
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && line !== 'Name')
      .map(drive => drive + '\\');
    
    return NextResponse.json({ drives, quickAccess });
  } catch (error) {
    return NextResponse.json({ drives: ['C:\\', 'D:\\'], quickAccess });
  }
}
