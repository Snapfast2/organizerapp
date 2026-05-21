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
  return trashPath;
}

export function restoreFromTrash(trashPath: string, originalPath: string) {
  moveWithExdevFallback(trashPath, originalPath);
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
    return items.map(item => {
      const fullPath = path.join(TRASH_DIR, item);
      const stat = fs.statSync(fullPath);
      // Remove hash prefix (16 hex chars + 1 underscore = 17 chars)
      const name = item.length > 17 ? item.substring(17) : item;
      const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() || '' : '';
      return {
        name,
        trashPath: fullPath,
        // We don't store original path, so surface the name for display
        originalPath: name,
        size: stat.size,
        ext,
        isDir: stat.isDirectory(),
        deletedAt: stat.mtime.toISOString(),
      };
    }).sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
  } catch {
    return [];
  }
}
