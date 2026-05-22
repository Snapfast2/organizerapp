import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

// ─── In-memory job store ──────────────────────────────────────────────────────
type JobStatus = {
  state: 'running' | 'done' | 'error';
  message: string;
  copied: number;
  total: number;
  currentFile: string;
  files: { name: string; status: 'pending' | 'copying' | 'done' }[];
  // done fields
  totalBytes?: number;
  destPath?: string;
  error?: string;
};

const jobs = new Map<string, JobStatus>();

// ─── AEP parser ───────────────────────────────────────────────────────────────
function extractPathsFromAEP(aepPath: string): string[] {
  try {
    const buffer = fs.readFileSync(aepPath);
    const str8 = buffer.toString('utf8');
    const str16 = buffer.toString('utf16le');
    const regex = /(?:[A-Za-z]:\\|\\\\)[^\0\r\n\t*?"<>|]+/g;
    const matches8 = str8.match(regex) || [];
    const matches16 = str16.match(regex) || [];
    const allMatches = new Set([...matches8, ...matches16]);
    const validPaths: string[] = [];
    for (let m of allMatches) {
      m = m.trim().replace(/[\x00-\x1F\x7F-\x9F]/g, '');
      if (m.length < 5) continue;
      const cleanPath = path.normalize(m);
      if (path.extname(cleanPath)) {
        try {
          if (fs.existsSync(cleanPath) && fs.statSync(cleanPath).isFile()) {
            validPaths.push(cleanPath);
          }
        } catch { }
      }
    }
    return validPaths;
  } catch {
    return [];
  }
}

// ─── Background worker ────────────────────────────────────────────────────────
async function runPack(jobId: string, aepPath: string) {
  const job = jobs.get(jobId)!;

  try {
    job.message = 'Analizando proyecto...';

    const deps = extractPathsFromAEP(aepPath);
    const parsedPath = path.parse(aepPath);
    const destDirPath = path.join(parsedPath.dir, `${parsedPath.name}_Empaquetado`);
    const footageDirPath = path.join(destDirPath, '(Footage)');

    if (!fs.existsSync(destDirPath)) fs.mkdirSync(destDirPath, { recursive: true });
    if (!fs.existsSync(footageDirPath)) fs.mkdirSync(footageDirPath, { recursive: true });

    job.total = deps.length;
    job.files = deps.map(d => ({ name: path.basename(d), status: 'pending' }));
    job.message = `Encontrados ${deps.length} archivos. Copiando...`;

    // Copy .aep
    fs.copyFileSync(aepPath, path.join(destDirPath, parsedPath.base));

    let copied = 0;
    let bytesTotal = 0;

    for (let i = 0; i < deps.length; i++) {
      const dep = deps[i];
      job.files[i].status = 'copying';
      job.currentFile = path.basename(dep);
      job.copied = copied;

      if (!fs.existsSync(dep)) {
        job.files[i].status = 'done';
        copied++;
        continue;
      }

      const depStats = fs.statSync(dep);
      const depName = path.basename(dep);
      let finalName = depName;
      let destPath = path.join(footageDirPath, finalName);

      let counter = 1;
      while (fs.existsSync(destPath)) {
        const ext = path.extname(depName);
        const nameNoExt = path.basename(depName, ext);
        finalName = `${nameNoExt}_${counter}${ext}`;
        destPath = path.join(footageDirPath, finalName);
        counter++;
      }

      await fs.promises.copyFile(dep, destPath);
      bytesTotal += depStats.size;
      job.files[i].status = 'done';
      copied++;
      job.copied = copied;

      // small yield so Node doesn't block the event loop
      await new Promise(r => setImmediate(r));
    }

    job.state = 'done';
    job.message = '¡Empaquetado completo!';
    job.copied = copied;
    job.total = deps.length;
    job.totalBytes = bytesTotal;
    job.destPath = destDirPath;
    job.currentFile = '';
  } catch (err: any) {
    job.state = 'error';
    job.error = err.message;
  }
}

// ─── POST /api/ae-collect  → start a job ────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const { aepPath } = await request.json();
    if (!aepPath || !fs.existsSync(aepPath)) {
      return NextResponse.json({ error: 'Ruta inválida o archivo no existe' }, { status: 400 });
    }

    const jobId = Date.now().toString();
    const job: JobStatus = {
      state: 'running',
      message: 'Iniciando...',
      copied: 0,
      total: 0,
      currentFile: '',
      files: [],
    };
    jobs.set(jobId, job);

    // fire and forget
    runPack(jobId, aepPath).catch(() => {});

    return NextResponse.json({ jobId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─── GET /api/ae-collect?jobId=xxx  → poll status ───────────────────────────
export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get('jobId');
  if (!jobId) return NextResponse.json({ error: 'Falta jobId' }, { status: 400 });

  const job = jobs.get(jobId);
  if (!job) return NextResponse.json({ error: 'Job no encontrado' }, { status: 404 });

  // clean up finished jobs after sending final status
  if (job.state !== 'running') {
    setTimeout(() => jobs.delete(jobId), 5000);
  }

  return NextResponse.json(job);
}
