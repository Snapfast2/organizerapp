import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const PAYLOAD_FILE   = path.join(process.cwd(), 'figma-payload.json');
const TEMP_ASSETS_DIR = path.join(process.cwd(), '.ae-projects', 'figma-assets');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: cors });
}

// ── POST: receive export from Figma plugin ────────────────────────────────────
export async function POST(req: Request) {
  try {
    const data = await req.json();

    // data.groups is an array of GroupExport objects.
    // Each GroupExport has a .layers array where each layer has .pngBase64.
    if (data?.groups && Array.isArray(data.groups)) {
      await fs.mkdir(TEMP_ASSETS_DIR, { recursive: true });

      for (const group of data.groups) {
        const safeName = (group.name || 'group').replace(/[^a-z0-9]/gi, '_');
        for (let i = 0; i < (group.layers || []).length; i++) {
          const layer = group.layers[i];
          if (layer.pngBase64) {
            const layerName = (layer.name || 'layer').replace(/[^a-z0-9]/gi, '_');
            const filePath  = path.join(TEMP_ASSETS_DIR, `${safeName}_${layerName}_${i}.png`);
            await fs.writeFile(filePath, Buffer.from(layer.pngBase64, 'base64'));
            layer.imagePath = filePath.replace(/\\/g, '/');
            delete layer.pngBase64;
          }
        }
      }
    }

    await fs.writeFile(PAYLOAD_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return NextResponse.json({ success: true }, { headers: cors });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: cors });
  }
}

// ── GET: Companion polls this to see if there's a new export ─────────────────
export async function GET() {
  try {
    const raw  = await fs.readFile(PAYLOAD_FILE, 'utf-8');
    const data = JSON.parse(raw);
    return NextResponse.json({ data }, { headers: cors });
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return NextResponse.json({ data: null }, { headers: cors });
    }
    return NextResponse.json({ error: err.message }, { status: 500, headers: cors });
  }
}

// ── DELETE: Companion calls this after consuming the export ───────────────────
export async function DELETE() {
  try {
    await fs.unlink(PAYLOAD_FILE);
    return NextResponse.json({ success: true }, { headers: cors });
  } catch (err: any) {
    if (err.code === 'ENOENT') return NextResponse.json({ success: true }, { headers: cors });
    return NextResponse.json({ error: err.message }, { status: 500, headers: cors });
  }
}
