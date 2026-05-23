import { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain, screen } from 'electron';
import path from 'path';
import fs from 'fs';
import chokidar from 'chokidar';

const isDev = process.env.NODE_ENV === 'development';
const NEXT_PORT = 3000;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let watcher: ReturnType<typeof chokidar.watch> | null = null;

// Queue of pending download popups (one at a time)
const pendingPopups: { filePath: string }[] = [];
let activePopup: BrowserWindow | null = null;

// ─── Quick access destinations (editable later) ────────────────
const downloadsPath = path.join(require('os').homedir(), 'Downloads');
const QUICK_DESTINATIONS = [
  { label: 'Escritorio',   path: path.join(require('os').homedir(), 'Desktop') },
  { label: 'Documentos',   path: path.join(require('os').homedir(), 'Documents') },
  { label: 'Imágenes',     path: path.join(require('os').homedir(), 'Pictures') },
  { label: 'Videos',       path: path.join(require('os').homedir(), 'Videos') },
];

// ─── Helpers ───────────────────────────────────────────────────
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
  } catch { return '—'; }
}

// ─── Popup window ─────────────────────────────────────────────
function showNextPopup() {
  if (activePopup || pendingPopups.length === 0) return;

  const { filePath } = pendingPopups.shift()!;
  const fileName = path.basename(filePath);
  const fileSize = getFileSize(filePath);
  const ext = path.extname(filePath).toLowerCase().replace('.', '');

  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const W = 400, H = 220;

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
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Encode popup data in URL params
  const params = new URLSearchParams({
    filePath,
    fileName,
    fileSize,
    ext,
    dests: JSON.stringify(QUICK_DESTINATIONS),
  });

  activePopup.loadURL(`http://localhost:${NEXT_PORT}/popup?${params.toString()}`);

  // Slide in from the right
  activePopup.once('ready-to-show', () => {
    activePopup?.show();
  });

  activePopup.on('closed', () => {
    activePopup = null;
    // Show next queued popup after a small delay
    setTimeout(showNextPopup, 300);
  });

  // Auto-dismiss after 15 seconds
  setTimeout(() => {
    if (activePopup && !activePopup.isDestroyed()) {
      activePopup.close();
    }
  }, 15000);
}

// ─── Download watcher ─────────────────────────────────────────
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

// ─── Main window ──────────────────────────────────────────────
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
    titleBarStyle: 'hidden',
  });

  mainWindow.loadURL(`http://localhost:${NEXT_PORT}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    startWatcher(); // start watching when app is ready
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ─── Tray ─────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, '../public/icon.png');
  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);
  tray.setToolTip('FileOrganizer');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Abrir FileOrganizer', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'Salir', click: () => { isQuitting = true; app.quit(); } },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

// ─── IPC ──────────────────────────────────────────────────────
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.hide());

// Popup: user chose a destination
ipcMain.on('popup:move', async (_event, { filePath, destDir }: { filePath: string; destDir: string }) => {
  try {
    const fileName = path.basename(filePath);
    const destPath = path.join(destDir, fileName);
    fs.renameSync(filePath, destPath);
    // Notify main window to refresh if it's showing the dest folder
    mainWindow?.webContents.send('fs:refresh');
  } catch (err) {
    console.error('popup:move error', err);
  }
  activePopup?.close();
});

// Popup: user ignored
ipcMain.on('popup:ignore', () => {
  activePopup?.close();
});

// ─── App lifecycle ────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  createTray();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => { /* stay in tray */ });
app.on('before-quit', () => {
  isQuitting = true;
  stopWatcher();
});
