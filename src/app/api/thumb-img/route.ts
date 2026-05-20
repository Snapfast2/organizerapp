import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import { Readable } from 'stream';

function nodeToWebStream(nodeStream: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      nodeStream.on('end', () => controller.close());
      nodeStream.on('error', (err) => controller.error(err));
    },
    cancel() { (nodeStream as Readable).destroy(); },
  });
}

// ── Disk cache ────────────────────────────────────────────────────────────────
const THUMB_DIR = path.join(os.tmpdir(), 'fileorg-thumbs-img');
fs.mkdirSync(THUMB_DIR, { recursive: true });

function cacheKey(filePath: string, mtime: number, size: number): string {
  const safe = filePath.replace(/[^a-zA-Z0-9]/g, '_').slice(-60);
  return `${safe}_${mtime}_${size}.webp`;
}

const inFlight = new Map<string, Promise<string | null>>();

async function generateThumb(filePath: string, cacheFile: string): Promise<string | null> {
  try {
    await sharp(filePath)
      .resize({ width: 320, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(cacheFile);
    return cacheFile;
  } catch (error) {
    console.error('Sharp error:', error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const filePath = request.nextUrl.searchParams.get('path');
  if (!filePath) return NextResponse.json({ error: 'path required' }, { status: 400 });

  const normalized = path.normalize(filePath);

  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(normalized);
  } catch {
    return NextResponse.json({ error: 'file not found' }, { status: 404 });
  }

  const key = cacheKey(normalized, stat.mtimeMs, stat.size);
  const cacheFile = path.join(THUMB_DIR, key);

  // ── Cache hit ─────────────────────────────────────────────────────────────
  if (fs.existsSync(cacheFile)) {
    const { size } = await fs.promises.stat(cacheFile);
    return new NextResponse(nodeToWebStream(fs.createReadStream(cacheFile)), {
      status: 200,
      headers: {
        'Content-Type': 'image/webp',
        'Content-Length': String(size),
        'Cache-Control': 'public, max-age=86400, immutable',
        'X-Thumb-Source': 'disk-cache',
      },
    });
  }

  // ── Deduplicate concurrent requests ───────────────────────────────────────
  if (!inFlight.has(key)) {
    const p = generateThumb(normalized, cacheFile).finally(() => inFlight.delete(key));
    inFlight.set(key, p);
  }

  const result = await inFlight.get(key)!;
  if (!result) {
    return NextResponse.json({ error: 'thumbnail generation failed' }, { status: 500 });
  }

  const size = (await fs.promises.stat(result)).size;
  return new NextResponse(nodeToWebStream(fs.createReadStream(result)), {
    status: 200,
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(size),
      'Cache-Control': 'public, max-age=86400, immutable',
      'X-Thumb-Source': 'sharp',
    },
  });
}
