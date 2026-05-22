import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import sharp from 'sharp';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string; numpages: number }>;

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2-vision:11b';

const IMAGE_EXTS = new Set(['jpg','jpeg','png','gif','webp','bmp','tiff','tif','heic','ico']);
const VIDEO_EXTS = new Set(['mp4','mov','avi','mkv','webm','wmv','flv','m4v']);
const BINARY_DESIGN_EXTS = new Set(['psd','psb','ai','indd','xd','fig','sketch','blend','obj','fbx']);

const MAX_PX = 1024; // Max image dimension sent to Ollama

// ─── Prompts ─────────────────────────────────────────────────────────────────

const IMAGE_PROMPT = `Look carefully at this image. What is the most important thing you see?
Respond ONLY with a JSON object — no extra text.

Correct examples:
- Photo of mountains at sunset → {"tags": ["montaña", "atardecer", "naturaleza"], "description": "Montañas con cielo rojizo al atardecer"}
- 3D game creature → {"tags": ["criatura", "videojuego", "3d"], "description": "Criatura 3D con armadura y ojo rojo grande"}
- Logo with text → {"tags": ["logo", "tipografia"], "description": "Logotipo con texto dorado sobre fondo oscuro"}
- Portrait photo → {"tags": ["retrato", "persona"], "description": "Foto de una mujer con cabello claro"}

Now describe THIS image:
{"tags": [MAXIMUM 3 tags, most important only, in Spanish], "description": "one sentence in Spanish about what you see"}`;

const VIDEO_FRAME_PROMPT = `This is a frame extracted from a video file. What is shown?
Respond ONLY with a JSON object — no extra text.

Examples:
- Gaming footage → {"tags": ["videojuego", "gameplay"], "description": "Escena de videojuego con personaje en acción"}
- Tutorial video → {"tags": ["tutorial", "pantalla"], "description": "Captura de pantalla de tutorial en computadora"}
- Nature video → {"tags": ["naturaleza", "paisaje"], "description": "Video de paisaje natural con vegetación verde"}

Describe THIS video frame:
{"tags": [MAXIMUM 3 tags in Spanish], "description": "one sentence in Spanish"}`;

const buildDocPrompt = (filename: string, text: string) =>
  `Read this document content carefully.
Respond ONLY with a JSON object — no extra text.

Examples:
- Invoice/receipt → {"tags": ["factura", "finanzas"], "description": "Factura de compra con datos de pago"}
- Legal contract → {"tags": ["contrato", "legal"], "description": "Contrato legal con términos y condiciones"}
- Academic paper → {"tags": ["investigacion", "academico"], "description": "Artículo académico sobre biología molecular"}
- Certificate → {"tags": ["certificado", "diploma"], "description": "Certificado de finalización de curso"}

Document: ${filename}
Content (first 1500 chars):
${text.substring(0, 1500)}

Respond with MAXIMUM 3 tags in Spanish about the document's actual topic:
{"tags": [...], "description": "..."}`;

const buildFilenamePrompt = (name: string, ext: string) =>
  `Based ONLY on this filename, suggest tags in Spanish.
Respond ONLY with JSON — no extra text.

Examples:
- "wedding_photos_2024.zip" → {"tags": ["fotos", "evento"], "description": "Archivo comprimido de fotos de boda"}
- "project_report_final.docx" → {"tags": ["reporte", "documento"], "description": "Reporte de proyecto en documento Word"}
- "song_remix.mp3" → {"tags": ["musica", "audio"], "description": "Archivo de música o remix de audio"}

Filename: ${name}
Extension: .${ext}

{"tags": [1-3 tags in Spanish], "description": "one sentence in Spanish"}`;

// ─── Utilities ────────────────────────────────────────────────────────────────

async function resizeToBase64(filePath: string): Promise<string> {
  const resized = await sharp(filePath)
    .resize({ width: MAX_PX, height: MAX_PX, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return resized.toString('base64');
}

/** Try to extract a video frame using ffmpeg (if installed) */
async function extractVideoFrame(videoPath: string): Promise<string | null> {
  try {
    const tmpFrame = videoPath + '_frame_tmp.jpg';
    // Seek to 3s or 10% of video, extract 1 frame
    execSync(
      `ffmpeg -ss 3 -i "${videoPath}" -frames:v 1 -q:v 2 "${tmpFrame}" -y`,
      { timeout: 15000, stdio: 'pipe' }
    );
    if (!fs.existsSync(tmpFrame)) return null;
    const base64 = await resizeToBase64(tmpFrame);
    fs.unlinkSync(tmpFrame);
    return base64;
  } catch {
    return null; // ffmpeg not available or failed
  }
}

/** Parse JSON from free-form model response */
function extractJSON(text: string): { tags: string[]; description: string } | null {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  // Try direct parse
  try {
    const p = JSON.parse(cleaned);
    if (Array.isArray(p.tags)) return { tags: p.tags.slice(0, 3), description: p.description || '' };
  } catch { /* fall through */ }
  // Regex: first {...} block
  const m = cleaned.match(/\{[\s\S]*?\}/);
  if (m) {
    try {
      const p = JSON.parse(m[0]);
      if (Array.isArray(p.tags)) return { tags: p.tags.slice(0, 3), description: p.description || '' };
    } catch { /* fall through */ }
  }
  return null;
}

function cleanTags(tags: string[]): string[] {
  return tags
    .map(t => String(t).toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-záéíóúüñ0-9-]/gi, ''))
    .filter(t => t.length > 1 && t !== 'tag' && t !== 'tags' && !t.startsWith('tag'));
}

// ─── Core Ollama caller ───────────────────────────────────────────────────────

async function callOllama(payload: Record<string, any>, timeoutMs = 75000): Promise<{ tags: string[]; description: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const hasImages = Array.isArray(payload.images) && payload.images.length > 0;

  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: '',
        stream: false,
        ...(hasImages ? {} : { format: 'json' }),
        options: { temperature: 0.1, num_predict: 256 },
        ...payload,
      }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
    const data = await res.json();
    const parsed = extractJSON(data.response || '');
    if (!parsed || parsed.tags.length === 0) throw new Error('No JSON in response');

    return {
      tags: cleanTags(parsed.tags),
      description: String(parsed.description || '').substring(0, 100),
    };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

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

    // ── Images ──────────────────────────────────────────────────────────────
    if (IMAGE_EXTS.has(ext)) {
      try {
        const base64 = await resizeToBase64(normalized);
        try {
          const result = await callOllama({ prompt: IMAGE_PROMPT, images: [base64] }, 60000);
          return NextResponse.json({ success: true, ...result, type: 'image' });
        } catch {
          // Retry with simpler prompt
          const result = await callOllama({
            prompt: `What is in this image? JSON only: {"tags": ["main_subject"], "description": "what you see in Spanish"}`,
            images: [base64],
          }, 45000);
          return NextResponse.json({ success: true, ...result, type: 'image-retry' });
        }
      } catch {
        // Fallback to filename
        const result = await callOllama({ prompt: buildFilenamePrompt(name, ext) }, 20000);
        return NextResponse.json({ success: true, ...result, type: 'image-fallback' });
      }
    }

    // ── Videos — extract frame if ffmpeg available ───────────────────────────
    if (VIDEO_EXTS.has(ext)) {
      const frameBase64 = await extractVideoFrame(normalized);
      if (frameBase64) {
        // Analyze actual video frame
        try {
          const result = await callOllama({ prompt: VIDEO_FRAME_PROMPT, images: [frameBase64] }, 60000);
          return NextResponse.json({ success: true, ...result, type: 'video-frame' });
        } catch { /* fall through to filename */ }
      }
      // No ffmpeg or frame failed — analyze by filename
      const result = await callOllama({ prompt: buildFilenamePrompt(name, ext) }, 20000);
      return NextResponse.json({ success: true, ...result, type: 'video-filename' });
    }

    // ── PDFs — extract real text ─────────────────────────────────────────────
    if (ext === 'pdf') {
      try {
        const buffer = fs.readFileSync(normalized);
        const pdfData = await pdfParse(buffer);
        const text = pdfData.text?.trim();
        if (text && text.length > 50) {
          const result = await callOllama({ prompt: buildDocPrompt(name, text) }, 45000);
          return NextResponse.json({ success: true, ...result, type: 'pdf' });
        }
      } catch { /* PDF parse failed */ }
      // Fallback: filename
      const result = await callOllama({ prompt: buildFilenamePrompt(name, ext) }, 20000);
      return NextResponse.json({ success: true, ...result, type: 'pdf-fallback' });
    }

    // ── Design/binary files ──────────────────────────────────────────────────
    if (BINARY_DESIGN_EXTS.has(ext)) {
      const result = await callOllama({ prompt: buildFilenamePrompt(name, ext) }, 20000);
      return NextResponse.json({ success: true, ...result, type: 'design' });
    }

    // ── Other text files ─────────────────────────────────────────────────────
    let textContent = '';
    try { textContent = fs.readFileSync(normalized, { encoding: 'utf-8' }).substring(0, 2000); } catch { /* binary */ }

    const prompt = textContent.length > 50
      ? buildDocPrompt(name, textContent)
      : buildFilenamePrompt(name, ext);

    const result = await callOllama({ prompt }, 30000);
    return NextResponse.json({ success: true, ...result, type: 'text' });

  } catch (err: any) {
    const isTimeout = err.name === 'AbortError' || String(err.message).includes('abort');
    return NextResponse.json(
      { error: isTimeout ? 'Tiempo de espera agotado (imagen muy grande)' : (err.message || 'Error de IA') },
      { status: 500 }
    );
  }
}
