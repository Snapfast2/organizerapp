import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const AE_DB_PATH = path.join(process.cwd(), 'ae-links.json');
    if (fs.existsSync(AE_DB_PATH)) {
      const data = JSON.parse(fs.readFileSync(AE_DB_PATH, 'utf-8'));
      return NextResponse.json(data);
    }
    return NextResponse.json({});
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
