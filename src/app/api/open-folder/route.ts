import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

export async function POST(request: NextRequest) {
  try {
    const { filePath } = await request.json();
    if (!filePath) return NextResponse.json({ error: 'Falta filePath' }, { status: 400 });

    const normalPath = path.normalize(filePath);
    
    // Security check: ensure path exists
    if (!fs.existsSync(normalPath)) {
      return NextResponse.json({ error: 'El archivo no existe' }, { status: 404 });
    }

    // Windows specific command to open explorer and select the file
    const command = `explorer.exe /select,"${normalPath}"`;
    
    exec(command, (error) => {
      if (error) {
        console.error('Error opening folder:', error);
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
