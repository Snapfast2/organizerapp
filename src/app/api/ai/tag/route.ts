import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2-vision:11b';

const IMAGE_EXTS = new Set(['jpg','jpeg','png','gif','webp','bmp','tiff','tif','heic','ico']);
const VIDEO_EXTS = new Set(['mp4','mov','avi','mkv','webm','wmv','flv','m4v']);

// Max image size to send: 1200px on longest side, JPEG quality 75
// We use sharp if available, otherwise fall back to raw buffer (but cap at 8 MB)
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB cap before resizing warning

const TAG_PROMPT = `Respond ONLY with a valid JSON object, no extra text before or after.
Format: {"tags": ["tag1", "tag2", "tag3"], "description": "brief description in Spanish"}

Rules:
- 2 to 6 tags in Spanish, one word each (or hyphenated: "al-aire-libre")
- description max 15 words in Spanish
- tags should be useful for file search and organization
- describe: content type, main objects, dominant colors if relevant, scene/environment

IMPORTANT: Your entire response must be ONLY the JSON object. Start with { and end with }.`;

const FILENAME_PROMPT = (name: string, sizeKb: number, ext: string) =>
  `Respond ONLY with a valid JSON object, no extra text.
Format: {"tags": ["tag1", "tag2", "tag3"], "description": "brief description in Spanish"}

Analyze this file and suggest tags in Spanish for organization:
- Filename: ${name}
- Size: ${sizeKb} KB
- Extension: .${ext}

Infer useful tags from the filename and metadata. Tags must be in Spanish.
Start with { and end with }.`;

async function callOllama(payload: object, timeoutMs = 90000): Promise<{ tags: string[]; description: string }> {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: '',
      stream: false,
      format: 'json', // Force JSON output mode
      options: { temperature: 0.1 }, // Low temp = more predictable JSON
      ...payload,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = await res.json();
  const text: string = data.response || '';

  // Try to extract JSON — first attempt direct parse, then regex
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*?\}/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch { /* fall through */ }
    }
  }

  if (!parsed || !Array.isArray(parsed.tags)) {
    throw new Error('No JSON in response');
  }

  return {
    tags: parsed.tags.slice(0, 6).map((t: string) => String(t).toLowerCase().trim()),
    description: String(parsed.description || '').substring(0, 100),
  };
}

function getImageBase64Capped(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  // If very large, warn but still try (Ollama handles large base64)
  if (buffer.length > MAX_IMAGE_BYTES) {
    console.warn(`Large image: ${buffer.length} bytes — may be slow`);
  }
  return buffer.toString('base64');
}

export async function POST(request: NextRequest) {
  try {
    const { filePath } = await request.json();
    if (!filePath) return NextResponse.json({ error: 'filePath required' }, { status: 400 });

    const normalized = path.normalize(filePath);
    if (!fs.existsSync(normalized)) {
      return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 });
    }

    const ext = path.extname(normalized).replace('.', '').toLowerCase();
    const name = path.basename(normalized);
    const stat = fs.statSync(normalized);
    const sizeKb = Math.round(stat.size / 1024);

    // ── Images ──────────────────────────────────────────────────────────────────
    if (IMAGE_EXTS.has(ext)) {
      const base64 = getImageBase64Capped(normalized);

      // Increase timeout for large images (>2MB → 120s, otherwise 90s)
      const timeoutMs = stat.size > 2 * 1024 * 1024 ? 120000 : 90000;

      const result = await callOllama({
        prompt: TAG_PROMPT,
        images: [base64],
        system: 'You are a file organization assistant. Always respond with valid JSON only.',
      }, timeoutMs);

      return NextResponse.json({ success: true, ...result, type: 'image' });
    }

    // ── Videos — filename-based analysis with vision model ──────────────────────
    if (VIDEO_EXTS.has(ext)) {
      // Use vision model with text-only prompt (no image) — it handles text well too
      const result = await callOllama({
        prompt: FILENAME_PROMPT(name, sizeKb, ext),
      });
      return NextResponse.json({ success: true, ...result, type: 'video' });
    }

    // ── PSD / binary files — filename-based ─────────────────────────────────────
    const binaryExts = new Set(['psd', 'psb', 'ai', 'indd', 'xd', 'fig', 'sketch']);
    if (binaryExts.has(ext)) {
      const result = await callOllama({
        prompt: FILENAME_PROMPT(name, sizeKb, ext),
      });
      return NextResponse.json({ success: true, ...result, type: 'design' });
    }

    // ── Text / PDF / other readable files ───────────────────────────────────────
    let textContent = '';
    try {
      const raw = fs.readFileSync(normalized, { encoding: 'utf-8' });
      textContent = raw.substring(0, 2000);
    } catch {
      textContent = ''; // Binary — fall back to filename
    }

    const prompt = textContent
      ? `Respond ONLY with a valid JSON object.
Format: {"tags": ["tag1", "tag2", "tag3"], "description": "brief description in Spanish"}

Analyze this document content and suggest Spanish tags for organization.
Document: ${name}
Content preview:
${textContent}

Start with { and end with }.`
      : FILENAME_PROMPT(name, sizeKb, ext);

    const result = await callOllama({ prompt });
    return NextResponse.json({ success: true, ...result, type: 'text' });

  } catch (err: any) {
    console.error('AI tag error:', err);
    return NextResponse.json(
      { error: err.message || 'Error al procesar con IA' },
      { status: 500 }
    );
  }
}
