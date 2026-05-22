import { NextResponse } from 'next/server';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2-vision:11b';

export async function GET() {
  try {
    // Check if Ollama is running
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      return NextResponse.json({ available: false, error: 'Ollama no responde' });
    }

    const data = await res.json();
    const models: string[] = (data.models || []).map((m: any) => m.name);
    const modelAvailable = models.some((m) => m.startsWith(OLLAMA_MODEL.split(':')[0]));

    return NextResponse.json({
      available: true,
      modelAvailable,
      model: OLLAMA_MODEL,
      models,
      ollamaUrl: OLLAMA_URL,
    });
  } catch {
    return NextResponse.json({
      available: false,
      error: 'Ollama no está corriendo. Abrí la app de Ollama o ejecutá "ollama serve" en terminal.',
    });
  }
}
