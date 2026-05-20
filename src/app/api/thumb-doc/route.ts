import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Readable } from 'stream';

const execFileAsync = promisify(execFile);

// ── Disk cache ────────────────────────────────────────────────────────────────
const THUMB_DIR = path.join(os.tmpdir(), 'fileorg-thumbs-doc');
fs.mkdirSync(THUMB_DIR, { recursive: true });

function cacheKey(filePath: string, mtime: number, size: number, ext: string): string {
  const safe = filePath.replace(/[^a-zA-Z0-9]/g, '_').slice(-60);
  return `${safe}_${mtime}_${size}_${ext}.jpg`;
}

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

function streamCached(cacheFile: string, source: string): NextResponse {
  const { size } = fs.statSync(cacheFile);
  return new NextResponse(nodeToWebStream(fs.createReadStream(cacheFile)), {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(size),
      'Cache-Control': 'private, max-age=86400, immutable',
      'X-Thumb-Source': source,
    },
  });
}

// ── ImageMagick binary ────────────────────────────────────────────────────────
const MAGICK_CANDIDATES = [
  'magick',
  'C:\\Program Files\\ImageMagick-7.1.2-Q16-HDRI\\magick.exe',
  'C:\\Program Files\\ImageMagick-7.1.2-Q16\\magick.exe',
];

let _magickBin: string | null = null;
async function getMagick(): Promise<string | null> {
  if (_magickBin !== null) return _magickBin || null;
  for (const candidate of MAGICK_CANDIDATES) {
    try {
      await execFileAsync(candidate, ['-version'], { timeout: 5_000 });
      _magickBin = candidate;
      return _magickBin;
    } catch { /* try next */ }
  }
  _magickBin = '';
  return null;
}

// ── PDF thumbnail via @hyzyla/pdfium + sharp ─────────────────────────────────
async function pdfThumb(filePath: string, outFile: string): Promise<boolean> {
  let doc: any = null;
  try {
    const { PDFiumLibrary } = await import('@hyzyla/pdfium');
    const sharp = (await import('sharp')).default;

    const pdfium = await PDFiumLibrary.init();
    const buf = fs.readFileSync(filePath);
    doc = await pdfium.loadDocument(buf);

    const page = doc.getPage(0); // first page
    const scale = 1.5;            // render at 1.5× for sharpness
    const { originalWidth, originalHeight } = page.getOriginalSize();
    const bitmap = await page.render({
      width: Math.floor(originalWidth * scale),
      height: Math.floor(originalHeight * scale),
      scale,
    });

    // bitmap.data is BGRA buffer — convert to RGBA for sharp in-place
    const data = bitmap.data;
    for (let i = 0; i < data.length; i += 4) {
      const b = data[i];
      data[i] = data[i + 2]; // Swap B and R
      data[i + 2] = b;
    }

    // convert to JPEG via sharp
    await sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
      raw: { width: bitmap.width, height: bitmap.height, channels: 4 },
    })
      .flatten({ background: '#ffffff' }) // RGBA → RGB (white bg)
      .resize({ width: 320, withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toFile(outFile);

    return fs.existsSync(outFile);
  } catch (e) {
    console.error('[thumb-doc] pdfium error:', e);
    return false;
  } finally {
    if (doc) {
      try { doc.destroy(); } catch (err) { console.error('Error destroying document:', err); }
    }
  }
}

// ── PSD thumbnail via ImageMagick ─────────────────────────────────────────────
// Uses [0] to read the baked-in composite — fast and reliable for normal PSDs.
async function psdThumb(filePath: string, outFile: string, magick: string): Promise<boolean> {
  try {
    await execFileAsync(magick, [
      `${filePath}[0]`,    // [0] = composite layer baked in by Photoshop
      '-flatten',          // flatten any remaining layers
      '-colorspace', 'sRGB',
      '-resize', '320x320>',
      '-quality', '82',
      outFile,
    ], { timeout: 30_000 });
    return fs.existsSync(outFile);
  } catch (e) {
    console.error('[thumb-doc] imagemagick psd error:', e);
    return false;
  }
}

// ── In-flight deduplication ───────────────────────────────────────────────────
const inFlight = new Map<string, Promise<boolean>>();

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const filePath = request.nextUrl.searchParams.get('path');
  if (!filePath) return NextResponse.json({ error: 'path required' }, { status: 400 });

  const normalized = path.normalize(filePath);
  const ext = path.extname(normalized).toLowerCase().replace('.', '');

  if (!['pdf', 'psd', 'psb'].includes(ext)) {
    return NextResponse.json({ error: 'unsupported type' }, { status: 400 });
  }

  let stat: fs.Stats;
  try { stat = fs.statSync(normalized); }
  catch { return NextResponse.json({ error: 'file not found' }, { status: 404 }); }

  const key = cacheKey(normalized, stat.mtimeMs, stat.size, ext);
  const cacheFile = path.join(THUMB_DIR, key);

  // Cache hit
  if (fs.existsSync(cacheFile)) return streamCached(cacheFile, 'disk-cache');

  // Deduplicate concurrent requests
  if (!inFlight.has(key)) {
    let work: Promise<boolean>;

    if (ext === 'pdf') {
      work = pdfThumb(normalized, cacheFile);
    } else {
      // PSD / PSB
      const magick = await getMagick();
      if (!magick) return NextResponse.json({ error: 'ImageMagick not found' }, { status: 503 });
      work = psdThumb(normalized, cacheFile, magick);
    }

    inFlight.set(key, work.finally(() => inFlight.delete(key)));
  }

  const ok = await inFlight.get(key)!;
  if (!ok) return NextResponse.json({ error: 'thumbnail generation failed' }, { status: 500 });

  return streamCached(cacheFile, ext === 'pdf' ? 'pdfium' : 'imagemagick');
}
