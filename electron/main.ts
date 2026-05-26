import { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain, screen, Notification } from 'electron';
import path from 'path';
import fs from 'fs';
import chokidar from 'chokidar';
import { exec, execSync } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

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

// ─── App lifecycle ────────────────────────────────────────────
app.setAppUserModelId(isDev ? process.execPath : 'com.fileorganizer.app');

app.whenReady().then(() => {
  createWindow();
  createTray();

  // Handle AE Import
  ipcMain.handle('is-ae-open', async () => {
    try {
      const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq AfterFX.exe"');
      return stdout.includes('AfterFX.exe');
    } catch {
      return false;
    }
  });

  ipcMain.on('popup-import-ae', async (e, filePath) => {
    try {
      // Find AE path
      const { stdout: regOut } = await execAsync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\AfterFX.exe" /ve');
      const match = regOut.match(/REG_SZ\s+(.+)$/im);
      if (!match) throw new Error("After Effects no encontrado en el registro");
      
      const aePath = match[1].trim();
      const ext = path.extname(filePath).toLowerCase().replace('.', '');
      
      let folderPath = ["Other"];
      if (['aep', 'prproj', 'mogrt', 'ffx', 'jsx', 'jsxbin', 'psd', 'aet', 'aepx', 'sqpreset'].includes(ext)) {
        folderPath = ["Adobe"];
      } else if (['png', 'jpg', 'jpeg', 'nef', 'exr', 'tif', 'dpx', 'pam', 'pbm', 'pcx', 'ptx', 'webp'].includes(ext)) {
        folderPath = ["Image"];
      } else if (ext === 'gif') {
        folderPath = ["Image", "GIFs"]; // Subcarpeta
      } else if (['mp4', 'avi', 'mov', 'webm', 'mkv', '3gp', 'm4v', 'apng', 'mxf'].includes(ext)) {
        folderPath = ["Video"];
      } else if (['mp3', 'wav', 'wma', 'flac', 'aac', 'ac3', 'aif', 'aiff', 'mpa', 'm4a', 'mp2', 'ogg', 'oga', 'ogm', 'ogv'].includes(ext)) {
        folderPath = ["Audio"];
      } else if (['ttf', 'otf'].includes(ext)) {
        folderPath = ["Font"];
      } else if (['ai', 'eps', 'svg'].includes(ext)) {
        folderPath = ["Vector"];
      } else if (['c4d', 'prst', 'expr', 'json', 'mgjson', 'csv', 'tsv', 'txt'].includes(ext)) {
        folderPath = ["Other"];
      }

      const script = `
        try {
          var fileToImport = new File("${filePath.replace(/\\/g, '/')}");
          
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
                  found = item;
                  break;
                }
              }
              
              if (!found) {
                found = app.project.items.addFolder(fName);
                found.parentFolder = currentParent;
              }
              
              currentParent = found;
            }
            
            var targetFolder = currentParent;
            
            var importOptions = new ImportOptions(fileToImport);
            if (importOptions.canImportAs(ImportAsType.FOOTAGE)) {
              importOptions.importAs = ImportAsType.FOOTAGE;
            }
            importOptions.sequence = false;
            importOptions.forceAlphabetical = false;

            var importedItem = app.project.importFile(importOptions);
            
            if (importedItem) {
              importedItem.parentFolder = targetFolder;
            } else {
              app.project.items.addFolder("FileOrg Error: importFile fallo silenciosamente");
            }
            
            app.endUndoGroup();
          }
        } catch (err) {
          if (app && app.project) {
            app.project.items.addFolder("FileOrg Error: " + err.toString().substring(0, 50));
          }
        }
      `;
      
      const tempJsx = path.join(require('os').tmpdir(), 'ae_import_fileorg.jsx');
      fs.writeFileSync(tempJsx, script);
      
      const evalScript = `$.evalFile('${tempJsx.replace(/\\/g, '/')}');`;
      
      exec(`"${aePath}" -s "${evalScript}"`, (err) => {
        if (err) {
          console.error("Error ejecutando AE:", err);
          new Notification({ title: 'Error en After Effects', body: 'Hubo un problema al enviar el archivo.' }).show();
        } else {
          new Notification({ title: 'Enviado a After Effects', body: `Archivo ${path.basename(filePath)} importado.` }).show();
        }
      });
    } catch (err) {
      console.error("Error importando a AE:", err);
      new Notification({ title: 'Error', body: 'No se pudo conectar con After Effects.' }).show();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => { /* stay in tray */ });
app.on('before-quit', () => {
  isQuitting = true;
  stopWatcher();
});
