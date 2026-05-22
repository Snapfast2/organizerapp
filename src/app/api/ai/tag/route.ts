import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2-vision:11b';

const IMAGE_EXTS = new Set(['jpg','jpeg','png','gif','webp','bmp','tiff','tif','heic','ico']);
const VIDEO_EXTS = new Set(['mp4','mov','avi','mkv','webm','wmv','flv','m4v']);

const TAG_PROMPT = `Analiza esta imagen y devuelve SOLO un JSON con este formato exacto, sin texto adicional:
{"tags": ["etiqueta1", "etiqueta2", "etiqueta3"], "description": "descripcion breve en español"}

Reglas:
- Máximo 6 etiquetas, mínimo 2
- Etiquetas en español, una sola palabra cada una (o dos con guion: "al-aire-libre")
- La descripción máximo 15 palabras
- Etiquetas útiles para búsqueda y organización de archivos
- Incluí: tipo de contenido, objetos principales, colores dominantes si aplica, ambiente/escena`;

const TEXT_PROMPT = (content: string) => `Analiza este texto de un documento y devuelve SOLO un JSON con este formato exacto, sin texto adicional:
{"tags": ["etiqueta1", "etiqueta2", "etiqueta3"], "description": "descripcion breve en español"}

Reglas:
- Máximo 6 etiquetas, mínimo 2
- Etiquetas en español
- La descripción máximo 15 palabras
- Etiquetas útiles para organización de documentos

Texto del documento (primeros 2000 caracteres):
${content.substring(0, 2000)}`;

async function callOllama(payload: object): Promise<{ tags: string[]; description: string }> {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: '',
      stream: false,
      ...payload,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = await res.json();
  const text: string = data.response || '';

  // Extract JSON from response
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in response');
  const parsed = JSON.parse(match[0]);

  return {
    tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 6) : [],
    description: parsed.description || '',
  };
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

    // ── Images ──────────────────────────────────────────────
    if (IMAGE_EXTS.has(ext)) {
      const imageBuffer = fs.readFileSync(normalized);
      const base64 = imageBuffer.toString('base64');
      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
      };
      const mime = mimeMap[ext] || 'image/jpeg';

      const result = await callOllama({
        prompt: TAG_PROMPT,
        images: [base64],
        system: 'Eres un asistente de organización de archivos. Respondes solo en JSON.',
      });

      return NextResponse.json({ success: true, ...result, type: 'image', mime });
    }

    // ── Videos — analyze first frame via description ─────────
    if (VIDEO_EXTS.has(ext)) {
      // For videos, we do a text-based analysis using filename + metadata
      const stat = fs.statSync(normalized);
      const name = path.basename(normalized);
      const result = await callOllama({
        model: OLLAMA_MODEL.replace('-vision', '').replace(':11b', '') || 'llama3.2',
        prompt: `Analiza este archivo de video y devuelve SOLO un JSON:
{"tags": ["etiqueta1", "etiqueta2"], "description": "descripcion breve en español"}

Nombre del archivo: ${name}
Tamaño: ${Math.round(stat.size / 1024 / 1024)} MB
Extensión: .${ext}

Infiere etiquetas útiles basadas en el nombre y metadatos.`,
      });
      return NextResponse.json({ success: true, ...result, type: 'video' });
    }

    // ── Text-based files (fallback) ───────────────────────────
    let textContent = '';
    try {
      const raw = fs.readFileSync(normalized, 'utf-8');
      textContent = raw.substring(0, 3000);
    } catch {
      // Binary file — use filename only
      textContent = path.basename(normalized);
    }

    const result = await callOllama({
      prompt: TEXT_PROMPT(textContent || path.basename(normalized)),
    });

    return NextResponse.json({ success: true, ...result, type: 'text' });

  } catch (err: any) {
    console.error('AI tag error:', err);
    return NextResponse.json(
      { error: err.message || 'Error al procesar con IA' },
      { status: 500 }
    );
  }
}
