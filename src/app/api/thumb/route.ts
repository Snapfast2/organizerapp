import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
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

// ── FFmpeg binary location ────────────────────────────────────────────────────
// Try PATH first (works if user has ffmpeg globally installed / after reboot),
// then fall back to the WinGet installation path.
const FFMPEG_CANDIDATES = [
  'ffmpeg',
  path.join(
    os.homedir(),
    'AppData/Local/Microsoft/WinGet/Packages',
    'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe',
    'ffmpeg-8.1.1-full_build/bin/ffmpeg.exe',
  ),
];

let _ffmpegBin: string | null = null;
async function getFFmpegBin(): Promise<string | null> {
  if (_ffmpegBin !== null) return _ffmpegBin;
  for (const candidate of FFMPEG_CANDIDATES) {
    try {
      await execFileAsync(candidate, ['-version']);
      _ffmpegBin = candidate;
      return _ffmpegBin;
    } catch {
      // try next
    }
  }
  _ffmpegBin = ''; // mark as "not found" so we don't retry every request
  return null;
}

// ── Disk cache ────────────────────────────────────────────────────────────────
// Thumbnails are written to %TEMP%\fileorg-thumbs\ as JPEG files.
// Cache key = sha-like hash derived from path + mtime + size (no crypto needed).
const THUMB_DIR = path.join(os.tmpdir(), 'fileorg-thumbs');
fs.mkdirSync(THUMB_DIR, { recursive: true });

function cacheKey(filePath: string, mtime: number, size: number): string {
  // Simple but collision-resistant: encode path chars + mtime + size
  const safe = filePath.replace(/[^a-zA-Z0-9]/g, '_').slice(-60);
  return `${safe}_${mtime}_${size}.jpg`;
}

// In-flight deduplication: prevent two simultaneous requests for the same thumb
const inFlight = new Map<string, Promise<string | null>>();

async function generateThumb(
  filePath: string,
  cacheFile: string,
  ffmpeg: string,
): Promise<string | null> {
  try {
    // ── Step 1: get duration via ffprobe so we can seek to 10% ──
    let seekSecs = 5; // safe default
    try {
      const ffprobe = ffmpeg.replace('ffmpeg.exe', 'ffprobe.exe').replace(/ffmpeg$/, 'ffprobe');
      const { stdout } = await execFileAsync(ffprobe, [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath,
      ], { timeout: 5_000 });
      const duration = parseFloat(stdout.trim());
      if (isFinite(duration) && duration > 0) {
        seekSecs = Math.max(0, duration * 0.1); // 10% in
      }
    } catch { /* ffprobe unavailable — use default 5s */ }

    // ── Step 2: extract the frame ────────────────────────────────
    // -ss BEFORE -i = fast keyframe seek (input seeking)
    await execFileAsync(ffmpeg, [
      '-ss', String(seekSecs),
      '-i', filePath,
      '-vframes', '1',
      '-vf', 'scale=320:-2', // 320px wide — sharp on retina/HiDPI at the new card size
      '-f', 'image2',
      '-q:v', '3',           // 1=best, 31=worst. 3 is high quality ~10-15 KB
      '-y',
      cacheFile,
    ], { timeout: 15_000 });

    return fs.existsSync(cacheFile) ? cacheFile : null;
  } catch {
    return null;
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────
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

  const key = cacheKey(normalized, stat.mtimeMs, stat.size);
  const cacheFile = path.join(THUMB_DIR, key);

  // ── Cache hit — stream from disk, no RAM buffer ────────────────────────────
  if (fs.existsSync(cacheFile)) {
    const { size } = fs.statSync(cacheFile);
    return new NextResponse(nodeToWebStream(fs.createReadStream(cacheFile)), {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(size),
        'Cache-Control': 'private, max-age=86400, immutable',
        'X-Thumb-Source': 'disk-cache',
      },
    });
  }

  // ── FFmpeg available? ──────────────────────────────────────────────────────
  const ffmpeg = await getFFmpegBin();
  if (!ffmpeg) {
    return NextResponse.json({ error: 'ffmpeg not available' }, { status: 503 });
  }

  // ── Deduplicate concurrent requests for the same file ─────────────────────
  if (!inFlight.has(key)) {
    const p = generateThumb(normalized, cacheFile, ffmpeg).finally(() =>
      inFlight.delete(key),
    );
    inFlight.set(key, p);
  }

  const result = await inFlight.get(key)!;
  if (!result) {
    return NextResponse.json({ error: 'thumbnail generation failed' }, { status: 500 });
  }

  return new NextResponse(nodeToWebStream(fs.createReadStream(result)), {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(fs.statSync(result).size),
      'Cache-Control': 'private, max-age=86400, immutable',
      'X-Thumb-Source': 'ffmpeg',
    },
  });
}
