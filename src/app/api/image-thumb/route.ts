import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import os from 'os';

// Disk cache for image thumbnails
const THUMB_DIR = path.join(os.tmpdir(), 'fileorg-image-thumbs');
fs.mkdirSync(THUMB_DIR, { recursive: true });

function cacheKey(filePath: string, mtime: number, size: number): string {
  const safe = filePath.replace(/[^a-zA-Z0-9]/g, '_').slice(-60);
  return `${safe}_${mtime}_${size}.webp`;
}

export async function GET(request: NextRequest) {
  const filePath = request.nextUrl.searchParams.get('path');
  if (!filePath) return NextResponse.json({ error: 'path required' }, { status: 400 });

  const normalized = path.normalize(filePath);

  let stat: fs.Stats;
  try {
    stat = fs.statSync(normalized);
  } catch {
    return NextResponse.json({ error: 'file not found' }, { status: 404 });
  }

  // Only thumbnail images up to a certain size or just any image
  const key = cacheKey(normalized, stat.mtimeMs, stat.size);
  const cacheFile = path.join(THUMB_DIR, key);

  if (fs.existsSync(cacheFile)) {
    const cachedBuffer = fs.readFileSync(cacheFile);
    return new NextResponse(new Uint8Array(cachedBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=86400, immutable',
        'X-Thumb-Source': 'disk-cache',
      },
    });
  }

  try {
    // Generate webp thumbnail
    const buffer = await sharp(normalized)
      .resize({ width: 320, height: 320, fit: 'cover', withoutEnlargement: true })
      .webp({ quality: 60 })
      .toBuffer();
    
    // Save to cache asynchronously
    fs.promises.writeFile(cacheFile, buffer).catch(() => {});

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=86400, immutable',
        'X-Thumb-Source': 'sharp',
      },
    });
  } catch (err: any) {
    // If sharp fails (maybe not a valid image), fallback to original file
    try {
      const origBuffer = fs.readFileSync(normalized);
      return new NextResponse(new Uint8Array(origBuffer), {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=86400, immutable',
        },
      });
    } catch {
      return NextResponse.json({ error: 'failed to generate thumb' }, { status: 500 });
    }
  }
}
