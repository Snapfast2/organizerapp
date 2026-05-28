import { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain, screen, Notification, globalShortcut } from 'electron';
import path from 'path';
import os from 'os';
import fs from 'fs';
import chokidar from 'chokidar';
import { exec, execSync } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

// Resolve ae-projects.json reliably from the project root regardless of cwd
// __dirname in Electron main = .../electron/ (dev) or .../app/electron/ (prod)
const PROJECT_ROOT = path.resolve(__dirname, '..');
const AE_PROJECTS_DB_PATH = path.join(PROJECT_ROOT, 'ae-projects.json');
console.log('[DB] ae-projects.json path:', AE_PROJECTS_DB_PATH);


const EXT_TO_ASSETS_SUBFOLDER: Record<string, string> = {
  png: 'Images', jpg: 'Images', jpeg: 'Images', webp: 'Images', tif: 'Images',
  tiff: 'Images', exr: 'Images', nef: 'Images', dpx: 'Images', psd: 'Images', gif: 'Images',
  mp4: 'Video', mov: 'Video', avi: 'Video', mkv: 'Video', webm: 'Video', mxf: 'Video', m4v: 'Video',
  mp3: 'Audio', wav: 'Audio', aac: 'Audio', flac: 'Audio', aif: 'Audio', aiff: 'Audio', ogg: 'Audio', m4a: 'Audio',
  ai: 'Vector', svg: 'Vector', eps: 'Vector',
  ttf: 'Fonts', otf: 'Fonts',
};

function getAssetSubfolder(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  return EXT_TO_ASSETS_SUBFOLDER[ext] || 'Other';
}

const isDev = process.env.NODE_ENV === 'development';
const NEXT_PORT = 3000;

let mainWindow: BrowserWindow | null = null;
let companionWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let watcher: ReturnType<typeof chokidar.watch> | null = null;
// Saved before the minimize-squish animation so restore always has correct bounds
let savedBoundsBeforeMinimize: Electron.Rectangle | null = null;

// Queue of pending download popups (one at a time)
const pendingPopups: { filePath: string }[] = [];
let activePopup: BrowserWindow | null = null;

// Path to persist companion position between sessions
const companionPosPath = path.join(app.getPath('userData'), 'companion-pos.json');

// â”€â”€â”€ Quick access destinations (editable later) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const downloadsPath = path.join(require('os').homedir(), 'Downloads');
const QUICK_DESTINATIONS = [
  { label: 'Escritorio',   path: path.join(require('os').homedir(), 'Desktop') },
  { label: 'Documentos',   path: path.join(require('os').homedir(), 'Documents') },
  { label: 'ImÃ¡genes',     path: path.join(require('os').homedir(), 'Pictures') },
  { label: 'Videos',       path: path.join(require('os').homedir(), 'Videos') },
];

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function getFileSize(filePath: string): string {
  try {
    const stat = fs.statSync(filePath);
    return formatBytes(stat.size);
  } catch { return 'â€”'; }
}

// â”€â”€â”€ Popup window â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function showNextPopup() {
  if (activePopup) return;
  if (pendingPopups.length === 0) return;

  const { filePath } = pendingPopups.shift()!;
  const fileName = path.basename(filePath);
  const fileSize = getFileSize(filePath);
  const ext = path.extname(filePath).toLowerCase().replace('.', '');

  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const W = 400, H = 280;

  activePopup = new BrowserWindow({
    width: W,
    height: H,
    x: Math.round((sw - W) / 2),
    y: Math.round((sh - H) / 2),
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Check if After Effects is running
  let isAERunning = false;
  try {
    const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq AfterFX.exe"');
    if (stdout.includes('AfterFX.exe')) {
      isAERunning = true;
    }
  } catch (e) {
    // ignore
  }

  // Encode popup data in URL params
  const params = new URLSearchParams({
    filePath,
    fileName,
    fileSize,
    ext,
    dests: JSON.stringify(QUICK_DESTINATIONS),
  });

  if (isAERunning) {
    params.set('ae', '1');
  }

  activePopup.loadURL(`http://localhost:${NEXT_PORT}/popup?${params.toString()}`);

  // Slide in from the right
  activePopup.once('ready-to-show', () => {
    // showInactive() = appears without stealing focus from After Effects
    // (show() was causing AE to unmaximize when the popup appeared)
    activePopup?.showInactive();
  });

  activePopup.on('closed', () => {
    activePopup = null;
    // Show next queued popup after a small delay
    setTimeout(showNextPopup, 300);
  });

  // Auto-dismiss after 15 seconds â€” capture local ref so we always close THIS popup
  const thisPopup = activePopup;
  setTimeout(() => {
    if (thisPopup && !thisPopup.isDestroyed()) {
      thisPopup.close();
    }
  }, 15000);
}

// â”€â”€â”€ Download watcher â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function startWatcher() {
  if (watcher) return;

  watcher = chokidar.watch(downloadsPath, {
    depth: 0,            // only immediate children
    ignoreInitial: true, // don't fire for existing files
    awaitWriteFinish: {  // wait until the file is fully written
      stabilityThreshold: 1500,
      pollInterval: 200,
    },
    ignored: /(^|[/\\])\../, // ignore hidden files
  });

  watcher.on('add', (filePath: string) => {
    // Skip temp / partial download files
    const name = path.basename(filePath);
    if (name.endsWith('.crdownload') || name.endsWith('.tmp') || name.startsWith('.')) return;

    pendingPopups.push({ filePath });
    showNextPopup();
  });
}

function stopWatcher() {
  watcher?.close();
  watcher = null;
}

// â”€â”€â”€ Main window â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0a0a0a',
    icon: path.join(__dirname, '../public/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    opacity: 0,
    titleBarStyle: 'hidden',
  });

  mainWindow.loadURL(`http://localhost:${NEXT_PORT}`);

  // â”€â”€ Easing functions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Spring bounce â€” overshoots slightly then settles (launch, restore)
  const easeOutBack = (t: number) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  // Exponential acceleration (minimize â€” rush toward taskbar)
  const easeInExpo = (t: number) => t === 0 ? 0 : Math.pow(2, 10 * t - 10);
  // Exponential deceleration (opacity restore)
  const easeOutExpo = (t: number) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);

  // Generic tween helper
  const tween = (durationMs: number, steps: number, onTick: (t: number) => void, onDone?: () => void) => {
    let tick = 0;
    const iv = setInterval(() => {
      tick++;
      const t = Math.min(tick / steps, 1);
      onTick(t);
      if (tick >= steps) { clearInterval(iv); onDone?.(); }
    }, durationMs / steps);
    return iv;
  };

  // â”€â”€ Launch: spring scale + fade in â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  mainWindow.once('ready-to-show', () => {
    const win = mainWindow!;
    const { width, height } = win.getBounds();
    const display = screen.getDisplayMatching(win.getBounds());
    const cx = display.workArea.x + display.workArea.width / 2;
    const cy = display.workArea.y + display.workArea.height / 2;
    const startScale = 0.88; // start at 88% â€” more dramatic than before

    win.setBounds({
      x: Math.round(cx - width * startScale / 2),
      y: Math.round(cy - height * startScale / 2),
      width: Math.round(width * startScale),
      height: Math.round(height * startScale),
    });
    win.setOpacity(0);
    win.show();

    // Notify renderer to play Framer Motion CSS layer in sync
    win.webContents.send('window:animate:will-show');

    // Opacity: 0 â†’ 1 fast (200ms, easeOutExpo)
    tween(200, 20, (t) => {
      if (!win.isDestroyed()) win.setOpacity(Math.min(1, easeOutExpo(t)));
    });

    // Scale: 88% â†’ 100% with spring overshoot (380ms, easeOutBack)
    tween(380, 30, (t) => {
      const ease = Math.min(easeOutBack(t), 1.04); // cap overshoot at 104%
      const w = Math.round(width * startScale + (width - width * startScale) * ease);
      const h = Math.round(height * startScale + (height - height * startScale) * ease);
      if (!win.isDestroyed()) {
        win.setBounds({
          x: Math.round(cx - w / 2),
          y: Math.round(cy - h / 2),
          width: Math.max(w, 100),
          height: Math.max(h, 100),
        });
      }
    }, () => {
      if (!win.isDestroyed()) win.setBounds({ x: Math.round(cx - width / 2), y: Math.round(cy - height / 2), width, height });
    });

    startWatcher();
  });

  // â”€â”€ Restore from minimized: spring scale + fade in â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  mainWindow.on('restore', () => {
    const win = mainWindow;
    if (!win || win.isDestroyed()) return;

    // If there are no savedBounds from a minimize, this restore was triggered
    // by something external (e.g. AE stealing/returning focus via unmaximize).
    // In that case just re-maximize silently â€” no animation needed.
    if (!savedBoundsBeforeMinimize) {
      // Small delay so Windows finishes its focus transition first
      setTimeout(() => {
        if (win && !win.isDestroyed() && !win.isMaximized()) {
          win.maximize();
        }
      }, 50);
      return;
    }

    // Always use the bounds saved before the squish animation
    // (win.getBounds() during restore may still be at the tiny animation size)
    const target = savedBoundsBeforeMinimize;
    savedBoundsBeforeMinimize = null;
    const { x: tx, y: ty, width, height } = target;

    const display = screen.getDisplayMatching(target);
    const cx = display.workArea.x + display.workArea.width / 2;
    const cy = display.workArea.y + display.workArea.height / 2;
    const startScale = 0.82;

    // Start: small, slightly below center of screen
    const startW = Math.round(width * startScale);
    const startH = Math.round(height * startScale);
    const startX = Math.round(cx - startW / 2);
    const startY = Math.round(cy - startH / 2 + height * 0.08);

    win.setBounds({ x: startX, y: startY, width: startW, height: startH });
    win.setOpacity(0);
    setTimeout(() => { if (!win.isDestroyed()) win.webContents.send('window:animate:did-show'); }, 30);

    // Fade in (220ms)
    tween(220, 20, (t) => {
      if (!win.isDestroyed()) win.setOpacity(Math.min(1, easeOutExpo(t)));
    });

    // Spring to ORIGINAL size + position (350ms)
    tween(350, 28, (t) => {
      const ease = Math.min(easeOutBack(t), 1.03);
      const w = Math.round(startW + (width  - startW) * ease);
      const h = Math.round(startH + (height - startH) * ease);
      const x = Math.round(startX + (tx    - startX) * ease);
      const y = Math.round(startY + (ty    - startY) * ease);
      if (!win.isDestroyed()) {
        win.setBounds({ x, y, width: Math.max(w, 100), height: Math.max(h, 100) });
      }
    }, () => {
      // Snap to exact original bounds to eliminate any rounding drift
      if (!win.isDestroyed()) win.setBounds(target);
    });
  });

  // â”€â”€ Close (to tray): fade out â†’ hide â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      const win = mainWindow!;
      // Notify renderer CSS layer first
      win.webContents.send('window:animate:will-hide');
      tween(180, 18, (t) => {
        if (!win.isDestroyed()) win.setOpacity(Math.max(0, 1 - easeInExpo(t)));
      }, () => {
        if (!win.isDestroyed()) { win.hide(); win.setOpacity(1); }
      });
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Only allow http/https links to open in the default browser.
    // Blocking other protocols (file://, javascript:, custom handlers) prevents potential abuse.
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

// â”€â”€â”€ Companion window â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function createCompanion() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  // Restore saved position or default to bottom-right
  let cx = sw - 290, cy = sh - 420;
  try {
    const saved = JSON.parse(fs.readFileSync(companionPosPath, 'utf-8'));
    cx = saved.x ?? cx; cy = saved.y ?? cy;
  } catch { /* use defaults */ }

  companionWindow = new BrowserWindow({
    width: 310, // 260px bubble + 48px padding for drop shadow
    height: 400,
    x: cx,
    y: cy,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',  // fully transparent ARGB â€” required on Windows
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false, // The OS shadow is disabled. The CSS drop-shadow is used instead.
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  companionWindow.loadURL(`http://localhost:${NEXT_PORT}/companion`);

  // 'screen-saver' is the highest z-order level on Windows â€”
  // puts the companion above AE, browsers, fullscreen apps, everything
  companionWindow.setAlwaysOnTop(true, 'screen-saver');
  companionWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Save position when moved
  companionWindow.on('moved', () => {
    if (!companionWindow || companionWindow.isDestroyed()) return;
    const [x, y] = companionWindow.getPosition();
    try { fs.writeFileSync(companionPosPath, JSON.stringify({ x, y })); } catch { /* ignore */ }
  });

  companionWindow.on('closed', () => { companionWindow = null; });
}

function toggleCompanion() {
  if (!companionWindow || companionWindow.isDestroyed()) {
    createCompanion();
    companionWindow?.once('ready-to-show', () => companionWindow?.showInactive());
    return;
  }
  if (companionWindow.isVisible()) {
    companionWindow.hide();
  } else {
    companionWindow.showInactive();
  }
}

// â”€â”€â”€ Show main window with spring animation (reusable) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function showMainWindowAnimated() {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  const { width, height } = win.getBounds();
  const display = screen.getDisplayMatching(win.getBounds());
  const cx = display.workArea.x + display.workArea.width / 2;
  const cy = display.workArea.y + display.workArea.height / 2;
  const easeOutExpo = (t: number) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
  const easeOutBack = (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

  win.setOpacity(0);
  win.show();
  win.focus();

  // Tell renderer CSS layer to reset + spring in (clears any blur/dark overlay)
  win.webContents.send('window:animate:did-show');

  // Electron: fade in
  let tick = 0;
  const iv = setInterval(() => {
    tick++; const t = Math.min(tick / 20, 1);
    if (!win.isDestroyed()) win.setOpacity(Math.min(1, easeOutExpo(t)));
    if (tick >= 20) clearInterval(iv);
  }, 220 / 20);

  // Electron: spring scale from 82%
  const startScale = 0.82;
  win.setBounds({ x: Math.round(cx - width * startScale / 2), y: Math.round(cy - height / 2 + height * 0.1), width: Math.round(width * startScale), height: Math.round(height * startScale) });
  let step = 0;
  const sv = setInterval(() => {
    step++; const t = Math.min(step / 28, 1);
    const ease = Math.min(easeOutBack(t), 1.03);
    const w = Math.round(width * startScale + (width - width * startScale) * ease);
    const h = Math.round(height * startScale + (height - height * startScale) * ease);
    if (!win.isDestroyed()) win.setBounds({ x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), width: Math.max(w, 100), height: Math.max(h, 100) });
    if (step >= 28) { clearInterval(sv); if (!win.isDestroyed()) win.setBounds({ x: Math.round(cx - width / 2), y: Math.round(cy - height / 2), width, height }); }
  }, 350 / 28);
}

// â”€â”€â”€ Tray â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function createTray() {
  const iconPath = path.join(__dirname, '../public/icon.png');
  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);
  tray.setToolTip('MooMotion');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'ðŸ„ MooMotion Companion', click: () => toggleCompanion() },
    { label: 'Abrir MooMotion',       click: () => showMainWindowAnimated() },
    { type: 'separator' },
    { label: 'Salir', click: () => { isQuitting = true; app.quit(); } },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click',        () => toggleCompanion());
  tray.on('double-click', () => showMainWindowAnimated());
}

// â”€â”€â”€ IPC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ipcMain.on('window:minimize', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const win = mainWindow;
  const saved = win.getBounds();

  // Save BEFORE the squish animation changes the bounds
  savedBoundsBeforeMinimize = { ...saved };

  const display = screen.getDisplayMatching(saved);

  // Notify renderer CSS layer first
  win.webContents.send('window:animate:will-minimize');

  // Target: bottom-center of the work area (taskbar direction)
  const targetCX = display.workArea.x + display.workArea.width / 2;
  const targetY  = display.workArea.y + display.workArea.height;

  const easeInExpo = (t: number) => t === 0 ? 0 : Math.pow(2, 10 * t - 10);
  const steps = 22, duration = 280;
  let tick = 0;

  const iv = setInterval(() => {
    tick++;
    const t = Math.min(tick / steps, 1);
    const ease = easeInExpo(t);

    // Shrink width (squeeze horizontally) and collapse height
    const w = Math.max(8, Math.round(saved.width  * (1 - ease * 0.88)));
    const h = Math.max(4, Math.round(saved.height * (1 - ease * 0.96)));

    // Move toward bottom-center (taskbar)
    const x = Math.round(saved.x + saved.width / 2 - w / 2
                + (targetCX - saved.x - saved.width / 2) * ease * 0.6);
    const y = Math.round(saved.y + (targetY - saved.y) * ease * 0.85);

    // Fade out simultaneously
    if (!win.isDestroyed()) {
      win.setBounds({ x, y, width: w, height: h });
      win.setOpacity(Math.max(0, 1 - ease));
    }

    if (tick >= steps) {
      clearInterval(iv);
      win.minimize();
      // Restore bounds immediately (window is hidden while minimized)
      setTimeout(() => {
        if (!win.isDestroyed()) {
          win.setBounds(saved);
          win.setOpacity(1);
        }
      }, 60);
    }
  }, duration / steps);
});

ipcMain.on('window:maximize', () => {
  mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize();
});
ipcMain.on('window:close', () => {
  // Trigger the close event which handles the fade-out-to-tray animation
  mainWindow?.close();
});

// Popup: user chose a destination
ipcMain.on('popup:move', async (_event, { filePath, destDir }: { filePath: string; destDir: string }) => {
  try {
    const fileName = path.basename(filePath);
    const destPath = path.join(destDir, fileName);
    fs.renameSync(filePath, destPath);
    // Notify main window to refresh if it's showing the dest folder
    mainWindow?.webContents.send('fs:refresh');
    new Notification({ title: 'FileOrganizer', body: `Archivo movido a ${path.basename(destDir)}` }).show();
  } catch (err) {
    console.error('popup:move error', err);
    new Notification({ title: 'FileOrganizer Error', body: `No se pudo mover el archivo` }).show();
  }
  activePopup?.close();
});

// Popup: user ignored
ipcMain.on('popup:ignore', () => {
  activePopup?.close();
});

// â”€â”€â”€ App lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.setAppUserModelId(isDev ? process.execPath : 'com.fileorganizer.app');


// --- IPC Handlers (module-level, registered once) ---
  // Handle AE Import
  ipcMain.handle('is-ae-open', async () => {
    try {
      const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq AfterFX.exe"');
      return stdout.includes('AfterFX.exe');
    } catch {
      return false;
    }
  });

  ipcMain.on('popup-import-ae', async (e, payload: { filePath: string; deleteOriginal?: boolean } | string) => {
    const filePath = typeof payload === 'string' ? payload : payload.filePath;
    const deleteOriginal = typeof payload === 'string' ? false : (payload.deleteOriginal ?? false);
    try {
      // Find AE path
      const { stdout: regOut } = await execAsync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\AfterFX.exe" /ve');
      const match = regOut.match(/REG_SZ\s+(.+)$/im);
      if (!match) throw new Error('After Effects no encontrado en el registro');
      
      const aePath = match[1].trim();

      // â”€â”€ STEP 1 & 2: Find projectFolder â€” DB first (instant), AE query only if needed â”€â”€
      let projectFolder: string | null = null;
      let activeAepPath = '';

      // Helper: resolve projectFolder from DB projects list
      const resolveProjectFolder = (projects: any[]): string | null => {
        // A: exact match by AE-reported path
        if (activeAepPath) {
          const exact = projects.find(
            p => path.normalize(p.path).toLowerCase() === activeAepPath.toLowerCase()
          );
          if (exact?.projectFolder && fs.existsSync(exact.projectFolder)) return exact.projectFolder;
        }
        // B: infer from folder structure (E:\Motion\Proj\Proj.aep â†’ E:\Motion\Proj)
        const withFolder = projects.map((p: any) => {
          if (p.projectFolder && fs.existsSync(p.projectFolder)) return p;
          const aepBase = path.basename(p.path, '.aep');
          const parentDir = path.dirname(p.path);
          if (path.basename(parentDir) === aepBase && fs.existsSync(parentDir)) {
            return { ...p, projectFolder: parentDir };
          }
          return null;
        }).filter(Boolean);

        if (withFolder.length === 0) return null;

        // Sort by most recently opened
        const sorted = [...withFolder].sort(
          (a: any, b: any) => new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime()
        );
        return sorted[0].projectFolder;
      };

      // â”€â”€ Fast path: read DB immediately (no AE query needed in 95% of cases) â”€â”€
      try {
        const dbData = JSON.parse(fs.readFileSync(AE_PROJECTS_DB_PATH, 'utf-8'));
        const projects: any[] = dbData.recentProjects || [];
        projectFolder = resolveProjectFolder(projects);

        if (projectFolder) {
          console.log(`[SmartCollect] Fast path â†’ ${projectFolder}`);

          // Persist inferred projectFolder if it was missing
          const needsPatch = projects.some(p => !p.projectFolder &&
            path.normalize(path.join(path.dirname(p.path))).toLowerCase() ===
            path.normalize(projectFolder!).toLowerCase()
          );
          if (needsPatch) {
            const patched = { ...dbData, recentProjects: projects.map((p: any) => {
              const parentDir = path.dirname(p.path);
              if (!p.projectFolder && path.basename(parentDir) === path.basename(p.path, '.aep')) {
                return { ...p, projectFolder: parentDir };
              }
              return p;
            })};
            fs.writeFileSync(AE_PROJECTS_DB_PATH, JSON.stringify(patched, null, 2));
          }
        }
      } catch (dbErr) {
        console.error('[SmartCollect] DB read failed:', dbErr);
      }

      // â”€â”€ Slow path: only query AE if DB lookup found nothing (rare edge case) â”€â”€
      if (!projectFolder) {
        console.log('[SmartCollect] DB miss â€” querying AE for active project...');
        const tempResultPath = path.join(os.tmpdir(), 'ae_active_project_result.txt');
        try {
          if (fs.existsSync(tempResultPath)) fs.unlinkSync(tempResultPath);
          const safeTemp = tempResultPath.replace(/\\/g, '/');
          const scriptLines = [
            'try {',
            `  var result = (app.project && app.project.file) ? app.project.file.fsName : "";`,
            `  var f = new File("${safeTemp}");`,
            '  f.open("w"); f.write(result); f.close();',
            '} catch(err) {',
            `  var f = new File("${safeTemp}");`,
            '  f.open("w"); f.write(""); f.close();',
            '}',
          ].join('\n');
          const tempJsx = path.join(os.tmpdir(), 'ae_get_proj.jsx');
          fs.writeFileSync(tempJsx, scriptLines);
          exec(`"${aePath}" -r "${tempJsx}"`);

          // Short poll â€” max 1.5 seconds (we already know DB failed so we're in edge case)
          for (let i = 0; i < 8; i++) {
            await new Promise(r => setTimeout(r, 200));
            if (fs.existsSync(tempResultPath)) {
              const raw = fs.readFileSync(tempResultPath, 'utf-8').trim();
              if (raw) activeAepPath = path.normalize(raw);
              break;
            }
          }

          // Re-try DB lookup with AE-reported path
          if (activeAepPath) {
            const dbData = JSON.parse(fs.readFileSync(AE_PROJECTS_DB_PATH, 'utf-8'));
            projectFolder = resolveProjectFolder(dbData.recentProjects || []);
            if (projectFolder) console.log(`[SmartCollect] AE query path â†’ ${projectFolder}`);
          }
        } catch { /* ignore */ }
      }

      // â”€â”€ STEP 3: Copy asset to project folder if we have one â”€â”€â”€â”€â”€
      let importPath = filePath; // Default: import from original location
      let copiedToProject = false;

      if (projectFolder) {
        const subfolder = getAssetSubfolder(filePath);
        const destDir = path.join(projectFolder, 'Assets', subfolder);
        fs.mkdirSync(destDir, { recursive: true });

        const baseName = path.basename(filePath);
        let destPath = path.join(destDir, baseName);
        // Handle name collisions
        if (fs.existsSync(destPath)) {
          const ext = path.extname(baseName);
          const stem = path.basename(baseName, ext);
          destPath = path.join(destDir, `${stem}_${Date.now()}${ext}`);
        }
        try {
          fs.copyFileSync(filePath, destPath);
          importPath = destPath;
          copiedToProject = true;
          // Delete original if requested
          if (deleteOriginal) {
            try { fs.unlinkSync(filePath); } catch { /* ignore */ }
          }
        } catch { /* if copy fails, fall back to original path */ }
      }

      // â”€â”€ STEP 4: Import into AE from importPath â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

      const ext = path.extname(importPath).toLowerCase().replace('.', '');
      let folderPath = ['Other'];
      if (['aep', 'prproj', 'mogrt', 'ffx', 'jsx', 'jsxbin', 'psd', 'aet', 'aepx'].includes(ext)) {
        folderPath = ['Adobe'];
      } else if (['png', 'jpg', 'jpeg', 'nef', 'exr', 'tif', 'dpx', 'webp', 'gif', 'psd'].includes(ext)) {
        folderPath = ['Image'];
      } else if (['mp4', 'avi', 'mov', 'webm', 'mkv', '3gp', 'm4v', 'mxf'].includes(ext)) {
        folderPath = ['Video'];
      } else if (['mp3', 'wav', 'flac', 'aac', 'aif', 'aiff', 'ogg', 'm4a'].includes(ext)) {
        folderPath = ['Audio'];
      } else if (['ttf', 'otf'].includes(ext)) {
        folderPath = ['Font'];
      } else if (['ai', 'eps', 'svg'].includes(ext)) {
        folderPath = ['Vector'];
      }

      const script = `
        try {
          var fileToImport = new File("${importPath.replace(/\\/g, '/')}");
          if (!fileToImport.exists) {
            app.project.items.addFolder("FileOrg Error: Archivo no existe");
          } else if (app.project) {
            app.beginUndoGroup("Importar desde FileOrg");
            var folderNames = ${JSON.stringify(folderPath)};
            var currentParent = app.project.rootFolder;
            for (var f = 0; f < folderNames.length; f++) {
              var fName = folderNames[f];
              var found = null;
              for (var i = 1; i <= app.project.items.length; i++) {
                var item = app.project.items[i];
                if (item instanceof FolderItem && item.name === fName && item.parentFolder === currentParent) {
                  found = item; break;
                }
              }
              if (!found) { found = app.project.items.addFolder(fName); found.parentFolder = currentParent; }
              currentParent = found;
            }
            var importOptions = new ImportOptions(fileToImport);
            if (importOptions.canImportAs(ImportAsType.FOOTAGE)) importOptions.importAs = ImportAsType.FOOTAGE;
            importOptions.sequence = false;
            importOptions.forceAlphabetical = false;
            var importedItem = app.project.importFile(importOptions);
            if (importedItem) {
              importedItem.parentFolder = currentParent;
              // Scroll project panel to show the imported item:
              // Use AE's native Deselect All (no loop, no folder opening)
              // then select only our item â€” AE scrolls to show it
              try { app.executeCommand(app.findMenuCommandId("Deselect All")); } catch(de) {}
              importedItem.selected = true;
            }
            app.endUndoGroup();
          }
        } catch (err) {
          if (app && app.project) app.project.items.addFolder("FileOrg Error: " + err.toString().substring(0, 50));
        }
      `;

      const tempJsx = path.join(os.tmpdir(), 'ae_import_fileorg.jsx');
      fs.writeFileSync(tempJsx, script);
      const evalScript = `$.evalFile('${tempJsx.replace(/\\/g, '/')}');`;

      // windowsHide:true prevents the spawned AfterFX.exe from stealing focus
      // which was causing AE's window to unmaximize
      exec(`"${aePath}" -s "${evalScript}"`, { windowsHide: true }, (err) => {
        if (err) {
          console.error('Error ejecutando AE:', err);
          new Notification({ title: 'Error en After Effects', body: 'Hubo un problema al enviar el archivo.' }).show();
        } else {
          let notice: string;
          if (copiedToProject && projectFolder) {
            const projName = path.basename(projectFolder);
            notice = `${path.basename(filePath)} â†’ ${projName}/Assets/ âœ“`;
          } else {
            notice = `${path.basename(filePath)} importado (sin organizar â€” proyecto no en Hub).`;
          }
          new Notification({ title: 'Enviado a After Effects', body: notice }).show();
        }
      });
    } catch (err) {
      console.error('Error importando a AE:', err);
      new Notification({ title: 'Error', body: 'No se pudo conectar con After Effects.' }).show();
    }
  });

  // Open project folder in Explorer
  ipcMain.on('open-project-folder', (_event, folderPath: string) => {
    if (folderPath && fs.existsSync(folderPath)) {
      shell.openPath(folderPath);
    }
  });

  // Run a relinking script in AE (used after migrate)
  ipcMain.on('ae-run-relink-script', async (_event, relinkScript: string) => {
    try {
      const { stdout: regOut } = await execAsync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\AfterFX.exe" /ve');
      const match = regOut.match(/REG_SZ\s+(.+)$/im);
      if (!match) return;
      const aePath = match[1].trim();
      const tempJsx = path.join(os.tmpdir(), 'ae_relink.jsx');
      fs.writeFileSync(tempJsx, relinkScript);
      const evalScript = `$.evalFile('${tempJsx.replace(/\\/g, '/')}');`;
      exec(`"${aePath}" -s "${evalScript}"`, { windowsHide: true });
    } catch (err) {
      console.error('Error running relink script:', err);
    }
  });

  ipcMain.on('companion:execute-script', async (_event, scriptCode: string) => {
    try {
      const { stdout: regOut } = await execAsync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\AfterFX.exe" /ve');
      const match = regOut.match(/REG_SZ\s+(.+)$/im);
      if (!match) return;
      const aePath = match[1].trim();
      const tempJsx = path.join(os.tmpdir(), 'ae_figma_bridge.jsx');
      fs.writeFileSync(tempJsx, scriptCode);
      const evalScript = `$.evalFile('${tempJsx.replace(/\\/g, '/')}');`;
      exec(`"${aePath}" -s "${evalScript}"`, { windowsHide: true });
    } catch (err) {
      console.error('Error running companion script:', err);
    }
  });


app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // -- Companion: create hidden on startup, register hotkey --
  createCompanion();
  globalShortcut.register('CommandOrControl+Shift+M', () => toggleCompanion());
});


app.on('window-all-closed', () => { /* stay in tray */ });
app.on('before-quit', () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
  stopWatcher();
});

// â”€â”€â”€ Companion IPC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ipcMain.on('companion:hide', () => companionWindow?.hide());

let dragInitialPos = [0, 0];

ipcMain.on('companion:drag-start', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win && !win.isDestroyed()) {
    dragInitialPos = win.getPosition();
  }
});

ipcMain.on('companion:drag-move', (e, totalDx: number, totalDy: number) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win && !win.isDestroyed()) {
    win.setPosition(Math.round(dragInitialPos[0] + totalDx), Math.round(dragInitialPos[1] + totalDy));
  }
});

ipcMain.on('companion:set-size', (_e, width: number, height: number) => {
  if (!companionWindow || companionWindow.isDestroyed()) return;
  const [x, y] = companionWindow.getPosition();
  companionWindow.setBounds({ x, y, width: Math.round(width), height: Math.round(height) }, true);
});

ipcMain.on('companion:open-main', () => {
  showMainWindowAnimated();
});

ipcMain.handle('companion:is-ae-running', async () => {
  try {
    const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq AfterFX.exe"');
    return stdout.includes('AfterFX.exe');
  } catch { return false; }
});

ipcMain.handle('companion:get-active-project', async () => {
  try {
    const db = JSON.parse(fs.readFileSync(AE_PROJECTS_DB_PATH, 'utf-8'));
    // DB format: { recentProjects: [{ path, lastOpened, ... }] }
    const projects: { path: string; lastOpened?: string }[] = db.recentProjects || [];
    if (!projects.length) return null;
    const latest = [...projects].sort((a, b) =>
      new Date(b.lastOpened ?? 0).getTime() - new Date(a.lastOpened ?? 0).getTime()
    )[0];
    return path.basename(latest.path);
  } catch { return null; }
});

ipcMain.handle('companion:get-recents', async () => {
  try {
    const recentsPath = path.join(app.getPath('userData'), 'moo-recents.json');
    return JSON.parse(fs.readFileSync(recentsPath, 'utf-8'));
  } catch { return []; }
});

ipcMain.on('companion:import-to-ae', () => {
  // Open the main window and trigger an import
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('trigger:import-ae');
  }
});
