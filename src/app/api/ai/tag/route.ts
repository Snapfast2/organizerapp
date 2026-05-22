import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2-vision:11b';

const IMAGE_EXTS = new Set(['jpg','jpeg','png','gif','webp','bmp','tiff','tif','heic','ico']);
const VIDEO_EXTS = new Set(['mp4','mov','avi','mkv','webm','wmv','flv','m4v']);
const BINARY_DESIGN_EXTS = new Set(['psd','psb','ai','indd','xd','fig','sketch']);

// Max pixel dimension to send to Ollama — keeps base64 under ~2 MB
const MAX_PX = 1024;

const IMAGE_PROMPT = `You MUST respond with ONLY a JSON object. No explanation. No markdown. Just JSON.
{"tags": ["tag1", "tag2", "tag3"], "description": "brief description in Spanish"}

Rules for the JSON:
- 2 to 6 tags in Spanish (one word or hyphenated like "al-aire-libre")
- description in Spanish, max 12 words
- tags: describe content, main objects, colors, scene type
- Start your response with { and end with }`;

const FILENAME_PROMPT = (name: string, sizeKb: number, ext: string) =>
  `You MUST respond with ONLY a JSON object. No explanation. No markdown. Just JSON.
{"tags": ["tag1", "tag2", "tag3"], "description": "brief description in Spanish"}

File info:
- Name: ${name}
- Size: ${sizeKb} KB  
- Extension: .${ext}

Infer tags in Spanish from the filename. Start with { and end with }.`;

/** Resize image to MAX_PX on longest side, convert to JPEG for smaller base64 */
async function resizeImageToBase64(filePath: string): Promise<string> {
  try {
    const resized = await sharp(filePath)
      .resize({ width: MAX_PX, height: MAX_PX, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    return resized.toString('base64');
  } catch {
    // If sharp fails (e.g. corrupt file), fall back to raw buffer
    const raw = fs.readFileSync(filePath);
    if (raw.length > 4 * 1024 * 1024) throw new Error('Imagen demasiado grande para procesar sin sharp');
    return raw.toString('base64');
  }
}

/** Parse JSON from model response — handles markdown code blocks + raw JSON */
function extractJSON(text: string): { tags: string[]; description: string } | null {
  // Strip markdown fences
  const stripped = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  // Try direct parse first
  try {
    const p = JSON.parse(stripped);
    if (Array.isArray(p.tags)) return { tags: p.tags.slice(0, 6), description: p.description || '' };
  } catch { /* fall through */ }

  // Regex fallback: find first {...} block
  const match = stripped.match(/\{[\s\S]*?\}/);
  if (match) {
    try {
      const p = JSON.parse(match[0]);
      if (Array.isArray(p.tags)) return { tags: p.tags.slice(0, 6), description: p.description || '' };
    } catch { /* fall through */ }
  }
  return null;
}

async function callOllama(payload: object, timeoutMs = 90000): Promise<{ tags: string[]; description: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: '',
        stream: false,
        format: 'json',
        options: { temperature: 0.05, num_predict: 200 },
        ...payload,
      }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
    const data = await res.json();
    const text: string = data.response || '';

    const parsed = extractJSON(text);
    if (!parsed) throw new Error('No JSON in response');

    return {
      tags: parsed.tags.map((t: string) => String(t).toLowerCase().replace(/[^a-záéíóúüñ0-9-]/gi, '').trim()).filter(Boolean),
      description: String(parsed.description || '').substring(0, 120),
    };
  } finally {
    clearTimeout(timer);
  }
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

    // ── Images ─────────────────────────────────────────────────────────────────
    if (IMAGE_EXTS.has(ext)) {
      let base64: string;
      try {
        base64 = await resizeImageToBase64(normalized);
      } catch (resizeErr: any) {
        // Can't resize — fall back to filename analysis
        console.warn('Resize failed, using filename fallback:', resizeErr.message);
        const result = await callOllama({ prompt: FILENAME_PROMPT(name, sizeKb, ext) });
        return NextResponse.json({ success: true, ...result, type: 'image-fallback' });
      }

      // First attempt: image vision analysis
      try {
        const result = await callOllama({
          prompt: IMAGE_PROMPT,
          images: [base64],
          system: 'Respond only with valid JSON. No extra text.',
        }, 60000);
        return NextResponse.json({ success: true, ...result, type: 'image' });
      } catch (visionErr: any) {
        // Second attempt: retry with even simpler prompt
        try {
          const simplePrompt = `Describe this image in Spanish with JSON only:
{"tags": ["objeto1", "objeto2"], "description": "que muestra la imagen"}
Only JSON, starting with {`;
          const result = await callOllama({
            prompt: simplePrompt,
            images: [base64],
          }, 45000);
          return NextResponse.json({ success: true, ...result, type: 'image-retry' });
        } catch {
          // Final fallback: filename-based
          const result = await callOllama({ prompt: FILENAME_PROMPT(name, sizeKb, ext) }, 30000);
          return NextResponse.json({ success: true, ...result, type: 'image-filename-fallback' });
        }
      }
    }

    // ── Videos ─────────────────────────────────────────────────────────────────
    if (VIDEO_EXTS.has(ext)) {
      const result = await callOllama({ prompt: FILENAME_PROMPT(name, sizeKb, ext) }, 30000);
      return NextResponse.json({ success: true, ...result, type: 'video' });
    }

    // ── Design/binary files (PSD, AI, etc.) ────────────────────────────────────
    if (BINARY_DESIGN_EXTS.has(ext)) {
      const result = await callOllama({ prompt: FILENAME_PROMPT(name, sizeKb, ext) }, 30000);
      return NextResponse.json({ success: true, ...result, type: 'design' });
    }

    // ── Text / PDF / documents ──────────────────────────────────────────────────
    let textContent = '';
    try {
      textContent = fs.readFileSync(normalized, { encoding: 'utf-8' }).substring(0, 2000);
    } catch { /* binary — use filename */ }

    const docPrompt = textContent
      ? `Respond ONLY with JSON. No extra text.
{"tags": ["tag1", "tag2"], "description": "brief in Spanish"}
Document: ${name}
Content: ${textContent.substring(0, 1500)}
Start with {`
      : FILENAME_PROMPT(name, sizeKb, ext);

    const result = await callOllama({ prompt: docPrompt }, 45000);
    return NextResponse.json({ success: true, ...result, type: 'text' });

  } catch (err: any) {
    console.error('AI tag error:', err.message);
    const isTimeout = err.name === 'AbortError' || err.message?.includes('aborted');
    return NextResponse.json(
      { error: isTimeout ? 'Timeout: imagen muy pesada, intenta con una selección más pequeña' : (err.message || 'Error al procesar con IA') },
      { status: 500 }
    );
  }
}
