import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';

const MIME_TYPES: Record<string, string> = {
  // Images
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
  bmp: 'image/bmp', ico: 'image/x-icon', tiff: 'image/tiff',
  tif: 'image/tiff', heic: 'image/heic',
  // Videos
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  avi: 'video/x-msvideo', mkv: 'video/x-matroska',
  wmv: 'video/x-ms-wmv', flv: 'video/x-flv', m4v: 'video/x-m4v',
  // Audio
  mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac',
  aac: 'audio/aac', ogg: 'audio/ogg', m4a: 'audio/x-m4a',
  // PDF
  pdf: 'application/pdf',
};

/** Convert a Node.js Readable into a Web ReadableStream (no RAM buffering) */
function nodeToWebStream(nodeStream: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      nodeStream.on('end', () => controller.close());
      nodeStream.on('error', (err) => controller.error(err));
    },
    cancel() {
      (nodeStream as Readable).destroy();
    },
  });
}

export async function GET(request: NextRequest) {
  const filePath = request.nextUrl.searchParams.get('path');
  if (!filePath) return NextResponse.json({ error: 'path required' }, { status: 400 });

  const normalized = path.normalize(filePath);
  const ext = path.extname(normalized).replace('.', '').toLowerCase();
  const mimeType = MIME_TYPES[ext];

  if (!mimeType) return NextResponse.json({ error: 'Unsupported file type' }, { status: 415 });

  try {
    const stat = fs.statSync(normalized);
    const fileSize = stat.size;
    const isVideo = mimeType.startsWith('video/');
    const rangeHeader = request.headers.get('range');

    // ── Range request (video seeking / partial content) ──────────────
    if (rangeHeader && isVideo) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      // Default chunk: 2 MB — enough for smooth playback without hogging RAM
      const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 2 * 1024 * 1024, fileSize - 1);
      const chunkSize = end - start + 1;

      const nodeStream = fs.createReadStream(normalized, { start, end });
      return new NextResponse(nodeToWebStream(nodeStream), {
        status: 206,
        headers: {
          'Content-Type': mimeType,
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunkSize),
          'Cache-Control': 'private, max-age=0',
        },
      });
    }

    // ── Full file (images, audio, first video request without Range) ──
    const nodeStream = fs.createReadStream(normalized);
    return new NextResponse(nodeToWebStream(nodeStream), {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(fileSize),
        'Accept-Ranges': 'bytes',
        // Cache images aggressively; don't cache video (browser handles range internally)
        'Cache-Control': isVideo ? 'private, max-age=0' : 'private, max-age=300',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
