import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const PAYLOAD_FILE    = path.join(process.cwd(), 'figma-payload.json');
const TEMP_ASSETS_DIR = path.join(process.cwd(), '.ae-projects', 'figma-assets');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: cors });
}

// ── Streaming session state (in-memory, single-user local tool) ───────────────
// The plugin sends groups one-at-a-time so the plugin memory stays bounded.
// We accumulate processed groups here (base64 replaced with disk paths) and
// write the final payload.json only when 'finalize' is received.
let session: {
  documentName: string;
  total: number;
  groups: any[];
} | null = null;

// ── Save a single group's layer PNGs to disk; return the group with imagePaths ─
async function saveGroupImages(group: any): Promise<any> {
  const safeName = (group.name || 'group').replace(/[^a-z0-9]/gi, '_');

  // Save flat layers.
  const layers = group.layers ?? [];
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    if (layer.pngBase64) {
      const layerName = (layer.name || 'layer').replace(/[^a-z0-9]/gi, '_');
      const filePath  = path.join(TEMP_ASSETS_DIR, `${safeName}_${layerName}_${i}.png`);
      await fs.writeFile(filePath, Buffer.from(layer.pngBase64, 'base64'));
      layer.imagePath = filePath.replace(/\\/g, '/');
      delete layer.pngBase64;
    }
  }

  // Save layers inside each precomp group.
  const precomps = group.precomps ?? [];
  for (let pi = 0; pi < precomps.length; pi++) {
    const pc       = precomps[pi];
    const pcSafe   = (pc.name || `pc${pi}`).replace(/[^a-z0-9]/gi, '_');
    const subLayers = pc.layers ?? [];
    for (let si = 0; si < subLayers.length; si++) {
      const sl = subLayers[si];
      if (sl.pngBase64) {
        const slName   = (sl.name || 'layer').replace(/[^a-z0-9]/gi, '_');
        const filePath = path.join(TEMP_ASSETS_DIR, `pc_${pcSafe}_${slName}_${si}.png`);
        await fs.writeFile(filePath, Buffer.from(sl.pngBase64, 'base64'));
        sl.imagePath = filePath.replace(/\\/g, '/');
        delete sl.pngBase64;
      }
    }
  }

  return group;
}

// ── POST: receive export from Figma plugin ────────────────────────────────────
export async function POST(req: Request) {
  try {
    const data = await req.json();
    await fs.mkdir(TEMP_ASSETS_DIR, { recursive: true });

    // ── Streaming protocol ──────────────────────────────────────────────────
    if (data.action === 'start') {
      // Begin new export session — discard any previous unfinished session.
      session = {
        documentName: data.documentName ?? 'Figma',
        total: data.total ?? 0,
        groups: [],
      };
      return NextResponse.json({ success: true, started: true }, { headers: cors });
    }

    if (data.action === 'group') {
      // Save this group's images immediately and append to session.
      if (!session) {
        return NextResponse.json({ error: 'No active session' }, { status: 400, headers: cors });
      }
      const processed = await saveGroupImages(data.group);
      session.groups.push(processed);
      return NextResponse.json({ success: true, groupIndex: session.groups.length }, { headers: cors });
    }

    if (data.action === 'finalize') {
      // All groups received — write the payload file.
      if (!session) {
        return NextResponse.json({ error: 'No active session' }, { status: 400, headers: cors });
      }
      const payload = {
        timestamp: Date.now(),
        documentName: session.documentName,
        groups: session.groups,
      };
      await fs.writeFile(PAYLOAD_FILE, JSON.stringify(payload, null, 2), 'utf-8');
      session = null;
      return NextResponse.json({ success: true, finalized: true }, { headers: cors });
    }

    // ── Legacy: single POST with all groups (backward compatibility) ────────
    if (data?.groups && Array.isArray(data.groups)) {
      for (const group of data.groups) {
        await saveGroupImages(group);
      }
      await fs.writeFile(PAYLOAD_FILE, JSON.stringify(data, null, 2), 'utf-8');
      return NextResponse.json({ success: true }, { headers: cors });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400, headers: cors });
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
