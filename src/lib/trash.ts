import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const TRASH_DIR = path.join('C:\\Users\\Admin', '.file-organizer-trash');

if (!fs.existsSync(TRASH_DIR)) {
  fs.mkdirSync(TRASH_DIR, { recursive: true });
}

function moveWithExdevFallback(src: string, dest: string) {
  try {
    fs.renameSync(src, dest);
  } catch (err: any) {
    if (err.code === 'EXDEV') {
      fs.cpSync(src, dest, { recursive: true });
      fs.rmSync(src, { recursive: true, force: true });
    } else {
      throw err;
    }
  }
}

export function moveToTrash(srcPath: string): string {
  const name = path.basename(srcPath);
  const hash = crypto.randomBytes(8).toString('hex');
  const trashName = `${hash}_${name}`;
  const trashPath = path.join(TRASH_DIR, trashName);

  moveWithExdevFallback(srcPath, trashPath);
  
  // Save original path so we can restore it properly
  try {
    fs.writeFileSync(`${trashPath}.meta`, JSON.stringify({ originalPath: srcPath }));
  } catch (err) {
    console.error('Failed to write trash meta file', err);
  }

  return trashPath;
}

export function restoreFromTrash(trashPath: string, originalPath: string) {
  moveWithExdevFallback(trashPath, originalPath);
  
  // Cleanup meta file
  const metaPath = `${trashPath}.meta`;
  if (fs.existsSync(metaPath)) {
    fs.rmSync(metaPath, { force: true });
  }
}

export function emptyTrash() {
  if (!fs.existsSync(TRASH_DIR)) return;
  const items = fs.readdirSync(TRASH_DIR);
  for (const item of items) {
    const fullPath = path.join(TRASH_DIR, item);
    fs.rmSync(fullPath, { recursive: true, force: true });
  }
}

export const TRASH_DIR_PATH = TRASH_DIR;

export function getTrashItems() {
  if (!fs.existsSync(TRASH_DIR)) return [];
  try {
    const items = fs.readdirSync(TRASH_DIR);
    const trashItems = [];
    
    for (const item of items) {
      if (item.endsWith('.meta')) continue; // skip metadata sidecar files
      
      const fullPath = path.join(TRASH_DIR, item);
      const metaPath = `${fullPath}.meta`;
      
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }
      
      const name = item.length > 17 ? item.substring(17) : item;
      let originalPath = name; // fallback
      
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          if (meta.originalPath) originalPath = meta.originalPath;
        } catch (e) {}
      }

      const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() || '' : '';
      
      trashItems.push({
        name,
        trashPath: fullPath,
        originalPath,
        size: stat.size,
        ext,
        isDir: stat.isDirectory(),
        deletedAt: stat.mtime.toISOString(),
      });
    }
    return trashItems.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
  } catch {
    return [];
  }
}
