import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2-vision:11b';

const IMAGE_EXTS = new Set(['jpg','jpeg','png','gif','webp','bmp','tiff','tif','heic','ico']);
const VIDEO_EXTS = new Set(['mp4','mov','avi','mkv','webm','wmv','flv','m4v']);
const DESIGN_EXTS = new Set(['psd','psb','ai','indd','xd','fig','sketch','blend','obj','fbx']);

// Thumb cache dirs (same as /api/thumb and /api/thumb-img routes)
const VIDEO_THUMB_DIR = path.join(os.tmpdir(), 'fileorg-thumbs');
const IMG_THUMB_DIR   = path.join(os.tmpdir(), 'fileorg-thumbs-img');
const MAX_PX = 1024;

// ─── Predefined tag taxonomy ──────────────────────────────────────────────────
// The AI MUST choose from these categories when they match, and may add 1 extra
// specific tag if none of the categories fit well.
const TAG_TAXONOMY = [
  // Visual content types
  'ilustración', 'fotografía', 'render-3d', 'logo', 'tipografía', 'icono',
  'diseño-grafico', 'captura-pantalla', 'infografia', 'animacion',
  'sticker', 'mockup', 'textura', 'patron', 'fondo', 'efecto',
  'overlay', 'sprite', 'ui-ux', 'wireframe', 'banner', 'portada',

  // Subject matter
  'personaje', 'criatura', 'paisaje', 'arquitectura', 'retrato', 'producto',
  'comida', 'naturaleza', 'tecnologia', 'arte-digital',
  'espiritual', 'mistico', 'fantasia', 'abstracto', 'minimalista', 'retro',
  'animal', 'planta', 'vehiculo', 'ciudad', 'espacio', 'kawaii',

  // Study / learning
  'estudio', 'apuntes', 'resumen', 'ejercicio', 'tarea',
  'investigacion', 'curso', 'clase', 'examen',

  // Document types
  'contrato', 'factura', 'certificado', 'reporte', 'formulario', 'carta',
  'presentacion', 'manual', 'academico', 'legal',
  'acta', 'declaracion', 'constancia', 'presupuesto', 'cotizacion',
  'recibo', 'contabilidad', 'identidad', 'gobierno',

  // PSD / design project types
  'composicion', 'retoque', 'collage', 'fotomontaje', 'degradado', 'mascara',

  // Media types
  'videojuego', 'tutorial', 'vlog', 'clip', 'musica', 'efecto-visual',

  // Design tools / origin
  'photoshop', 'after-effects', 'blender', 'vector',

  // Workflow
  'borrador', 'final', 'referencia', 'recurso', 'plantilla',
];

const TAXONOMY_LIST = TAG_TAXONOMY.join(', ');

// ─── Prompts ──────────────────────────────────────────────────────────────────

const buildImagePrompt = (isDesign: boolean) =>
  `Look carefully at this ${isDesign ? 'design file preview' : 'image'} and describe exactly what you see.
Respond ONLY with a JSON object — no extra text, no markdown.

You have a predefined tag list. PREFER tags from this list when they match:
[${TAXONOMY_LIST}]

You may add 1 additional specific tag (in Spanish) if none of the above fit well.

Examples of correct responses:
- 3D game creature render → {"tags": ["render-3d", "criatura", "videojuego"], "description": "Criatura 3D con armadura y ojo rojo brillante"}
- Photoshop illustration → {"tags": ["ilustración", "diseño-grafico", "personaje"], "description": "Ilustración digital de mujer con cabello rojo"}
- Logo design → {"tags": ["logo", "tipografía"], "description": "Logotipo con texto dorado sobre fondo oscuro"}
- Nature photo → {"tags": ["fotografía", "naturaleza", "paisaje"], "description": "Fotografía de montañas nevadas con cielo azul"}

Now analyze THIS image. Use 1 to 3 tags maximum (most important first):
{"tags": [...], "description": "one sentence in Spanish describing what you see"}`;

const buildVideoPrompt = () =>
  `This is a frame extracted from a video file. Describe what you see.
Respond ONLY with a JSON object — no extra text.

Prefer tags from this list:
[${TAXONOMY_LIST}]

Examples:
- Gaming footage → {"tags": ["videojuego", "clip"], "description": "Escena de videojuego con personaje en batalla"}
- Tutorial screen recording → {"tags": ["tutorial", "captura-pantalla"], "description": "Grabación de pantalla mostrando software de edición"}
- Nature/travel video → {"tags": ["fotografía", "naturaleza"], "description": "Video de paisaje natural con vegetación"}
- Motion graphics → {"tags": ["animacion", "efecto-visual"], "description": "Animación con efectos visuales y partículas"}

Use 1 to 3 tags maximum:
{"tags": [...], "description": "one sentence in Spanish"}`;

const buildDocPrompt = (filename: string, text: string) =>
  `Read this document content and classify it.
Respond ONLY with a JSON object — no extra text.

Prefer tags from this list:
[${TAXONOMY_LIST}]

Examples:
- Government certificate → {"tags": ["certificado", "legal"], "description": "Certificado oficial de la Contraloría General"}  
- Invoice → {"tags": ["factura", "finanzas"], "description": "Factura de compra con datos de pago"}
- Academic paper → {"tags": ["academico", "reporte"], "description": "Artículo de investigación sobre biología molecular"}

Document: ${filename}
Content preview: ${text.substring(0, 1500)}

Use 1 to 3 tags maximum:
{"tags": [...], "description": "one sentence in Spanish"}`;

const buildFilenamePrompt = (name: string, ext: string) =>
  `Based ONLY on this filename, suggest tags in Spanish.
Respond ONLY with JSON — no extra text.

Prefer tags from: [${TAXONOMY_LIST}]

Examples:
- "wedding_photos.zip" → {"tags": ["fotografía", "recurso"], "description": "Archivo comprimido con fotos de boda"}
- "logo_final_v3.psd" → {"tags": ["logo", "photoshop", "final"], "description": "Archivo Photoshop de logotipo versión final"}
- "tutorial_react.mp4" → {"tags": ["tutorial", "clip"], "description": "Video tutorial de programación en React"}

Filename: ${name}  Extension: .${ext}
{"tags": [...1-3 tags...], "description": "one sentence in Spanish"}`;

// ─── Thumbnail cache lookup ───────────────────────────────────────────────────

function cacheKeyVideo(filePath: string, mtime: number, size: number): string {
  const safe = filePath.replace(/[^a-zA-Z0-9]/g, '_').slice(-60);
  return path.join(VIDEO_THUMB_DIR, `${safe}_${mtime}_${size}.jpg`);
}

function cacheKeyImg(filePath: string, mtime: number, size: number): string {
  const safe = filePath.replace(/[^a-zA-Z0-9]/g, '_').slice(-60);
  return path.join(IMG_THUMB_DIR, `${safe}_${mtime}_${size}.webp`);
}

/** Get existing cached thumbnail for a file (generated by /api/thumb or /api/thumb-img) */
function getCachedThumb(filePath: string, isVideo: boolean): string | null {
  try {
    const stat = fs.statSync(filePath);
    const cached = isVideo
      ? cacheKeyVideo(filePath, stat.mtimeMs, stat.size)
      : cacheKeyImg(filePath, stat.mtimeMs, stat.size);
    return fs.existsSync(cached) ? cached : null;
  } catch { return null; }
}

// ─── FFmpeg lookup (same logic as /api/thumb) ────────────────────────────────
const FFMPEG_CANDIDATES = [
  'ffmpeg',
  path.join(os.homedir(), 'AppData/Local/Microsoft/WinGet/Packages',
    'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe',
    'ffmpeg-8.1.1-full_build/bin/ffmpeg.exe'),
];

let _ffmpegBin: string | null = null;
async function getFFmpegBin(): Promise<string | null> {
  if (_ffmpegBin !== null) return _ffmpegBin;
  for (const c of FFMPEG_CANDIDATES) {
    try { await execFileAsync(c, ['-version']); _ffmpegBin = c; return c; } catch { /* next */ }
  }
  _ffmpegBin = '';
  return null;
}

/** Extract a video frame fresh (if no cache exists) */
async function extractVideoFrame(videoPath: string, outPath: string): Promise<boolean> {
  const ffmpeg = await getFFmpegBin();
  if (!ffmpeg) return false;
  try {
    await execFileAsync(ffmpeg, [
      '-ss', '5', '-i', videoPath, '-vframes', '1',
      '-vf', 'scale=640:-2', '-f', 'image2', '-q:v', '2', '-y', outPath,
    ], { timeout: 15000 });
    return fs.existsSync(outPath);
  } catch { return false; }
}

// ─── Image resize → base64 ───────────────────────────────────────────────────

async function toBase64(filePath: string): Promise<string> {
  const buf = await sharp(filePath)
    .resize({ width: MAX_PX, height: MAX_PX, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  return buf.toString('base64');
}

// ─── PDF text extraction ─────────────────────────────────────────────────────

async function extractPdfText(pdfPath: string): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(pdfPath);
    const data = await pdfParse(buffer);
    return (data.text || '').trim();
  } catch {
    try {
      const raw = fs.readFileSync(pdfPath);
      const words = raw.toString('latin1')
        .replace(/[^\x20-\x7E\xC0-\xFF\n\r]/g, ' ')
        .match(/[A-Za-záéíóúüñÁÉÍÓÚÜÑ]{4,}/g) || [];
      return words.slice(0, 200).join(' ');
    } catch { return ''; }
  }
}

// ─── JSON extraction from model response ─────────────────────────────────────

function extractJSON(text: string): { tags: string[]; description: string } | null {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  try {
    const p = JSON.parse(cleaned);
    if (Array.isArray(p.tags)) return { tags: p.tags.slice(0, 3), description: p.description || '' };
  } catch { /* fall through */ }
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
    .filter(t => t.length > 1 && !['tag', 'tags', 'etiqueta', 'etiquetas'].includes(t));
}

// ─── Ollama caller ────────────────────────────────────────────────────────────

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
    return { tags: cleanTags(parsed.tags), description: String(parsed.description || '').substring(0, 120) };
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

    // ── Images ──────────────────────────────────────────────────────────────
    if (IMAGE_EXTS.has(ext)) {
      try {
        // Use existing thumb cache if available (already resized), else resize now
        const cached = getCachedThumb(normalized, false);
        const base64 = cached ? fs.readFileSync(cached).toString('base64') : await toBase64(normalized);
        try {
          const result = await callOllama({
            prompt: buildImagePrompt(false),
            images: [base64],
            system: 'You are a file tagging assistant. Respond only with valid JSON.',
          }, 60000);
          return NextResponse.json({ success: true, ...result, type: 'image' });
        } catch {
          // Simple retry
          const result = await callOllama({
            prompt: `Describe this image in Spanish. JSON only: {"tags": ["main_tag"], "description": "what you see"}`,
            images: [base64],
          }, 40000);
          return NextResponse.json({ success: true, ...result, type: 'image-retry' });
        }
      } catch {
        const result = await callOllama({ prompt: buildFilenamePrompt(name, ext) }, 20000);
        return NextResponse.json({ success: true, ...result, type: 'image-fallback' });
      }
    }

    // ── Design files (PSD etc.) — render via sharp (works on PSD natively) ──
    if (DESIGN_EXTS.has(ext)) {
      let base64: string | null = null;

      // 1. Try existing UI thumbnail cache first (fastest)
      const cached = getCachedThumb(normalized, false);
      if (cached) {
        try {
          // Cache is webp — re-encode to JPEG for Ollama
          const buf = await sharp(cached).jpeg({ quality: 82 }).toBuffer();
          base64 = buf.toString('base64');
        } catch { /* ignore */ }
      }

      // 2. If no cache, render directly with sharp (sharp reads PSD merged composite)
      if (!base64) {
        try {
          base64 = await toBase64(normalized); // sharp opens PSD merged layer
        } catch { /* PSD too complex or corrupted */ }
      }

      if (base64) {
        try {
          const result = await callOllama({
            prompt: buildImagePrompt(true),
            images: [base64],
            system: 'You are a file tagging assistant. Respond only with valid JSON.',
          }, 60000);
          return NextResponse.json({ success: true, ...result, type: 'psd-visual' });
        } catch { /* fall through to filename */ }
      }

      // 3. Filename fallback only if sharp can't open the file at all
      const result = await callOllama({ prompt: buildFilenamePrompt(name, ext) }, 20000);
      return NextResponse.json({ success: true, ...result, type: 'design-filename' });
    }


    // ── Videos — use existing ffmpeg thumbnail or extract fresh ─────────────
    if (VIDEO_EXTS.has(ext)) {
      // First: check if the UI already generated a thumbnail for this video
      let frameBase64: string | null = null;
      const cached = getCachedThumb(normalized, true);
      if (cached) {
        try { frameBase64 = await toBase64(cached); } catch { /* ignore */ }
      }
      // Second: extract fresh frame if no cache
      if (!frameBase64) {
        const tmpFrame = path.join(os.tmpdir(), `ai_frame_${Date.now()}.jpg`);
        const ok = await extractVideoFrame(normalized, tmpFrame);
        if (ok) {
          try {
            frameBase64 = await toBase64(tmpFrame);
            fs.unlinkSync(tmpFrame);
          } catch { /* ignore */ }
        }
      }

      if (frameBase64) {
        try {
          const result = await callOllama({
            prompt: buildVideoPrompt(),
            images: [frameBase64],
          }, 60000);
          return NextResponse.json({ success: true, ...result, type: 'video-frame' });
        } catch { /* fall through */ }
      }
      // Fallback: filename-based
      const result = await callOllama({ prompt: buildFilenamePrompt(name, ext) }, 20000);
      return NextResponse.json({ success: true, ...result, type: 'video-filename' });
    }

    // ── PDFs ─────────────────────────────────────────────────────────────────
    if (ext === 'pdf') {
      const text = await extractPdfText(normalized);
      if (text && text.length > 50) {
        const result = await callOllama({ prompt: buildDocPrompt(name, text) }, 45000);
        return NextResponse.json({ success: true, ...result, type: 'pdf' });
      }
      const result = await callOllama({ prompt: buildFilenamePrompt(name, ext) }, 20000);
      return NextResponse.json({ success: true, ...result, type: 'pdf-fallback' });
    }

    // ── Other text files ─────────────────────────────────────────────────────
    let textContent = '';
    try { textContent = fs.readFileSync(normalized, { encoding: 'utf-8' }).substring(0, 2000); } catch { /* binary */ }
    const prompt = textContent.length > 50 ? buildDocPrompt(name, textContent) : buildFilenamePrompt(name, ext);
    const result = await callOllama({ prompt }, 30000);
    return NextResponse.json({ success: true, ...result, type: 'text' });

  } catch (err: any) {
    const isTimeout = err.name === 'AbortError' || String(err.message).includes('abort');
    return NextResponse.json(
      { error: isTimeout ? 'Tiempo agotado (archivo muy grande)' : (err.message || 'Error de IA') },
      { status: 500 }
    );
  }
}
