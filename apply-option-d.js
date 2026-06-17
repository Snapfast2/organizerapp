const fs = require('fs');
const path = require('path');

let content = fs.readFileSync('electron/main.ts', 'utf-8');

content = content.replace('let activePopup: BrowserWindow | null = null;', 'let popupView: any = null;\nlet overlayWindow: any = null;\nlet companionView: any = null;');

const overlay_creation = `
function ensureOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return;
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const GHOST_OFFSET = 40;
  
  overlayWindow = new BrowserWindow({
    width: sw,
    height: sh + GHOST_OFFSET,
    x: 0,
    y: -GHOST_OFFSET,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    show: true,
  });
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}
`;

const old_popup = `  activePopup = new BrowserWindow({
    width: W,
    height: H,
    x: sw - W - 20,
    y: sh - H - 20,
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
  });`;

const new_popup = `  ensureOverlayWindow();
  const GHOST_OFFSET = 40;
  popupView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });
  popupView.setBackgroundColor('#00000000');
  overlayWindow.contentView.addChildView(popupView);
  popupView.setBounds({
    x: sw - W - 20,
    y: sh - H - 20 + GHOST_OFFSET,
    width: W,
    height: H
  });`;

content = content.replace(old_popup, new_popup);

content = content.replace('activePopup.loadURL(', 'popupView.webContents.loadURL(');
content = content.replace('activePopup.once(', 'popupView.webContents.once(');

// Properly replace the event handlers and cleanup logic for popup
const old_popup_close = `  // Slide in from the right
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

  // Auto-dismiss after 15 seconds — capture local ref so we always close THIS popup
  const thisPopup = activePopup;
  setTimeout(() => {
    if (thisPopup && !thisPopup.isDestroyed()) {
      thisPopup.close();
    }
  }, 15000);`;

const new_popup_close = `  // Slide in from the right
  popupView.webContents.once('ready-to-show', () => {
    // webcontentsview doesnt need showInactive
  });

  const thisPopupView = popupView;
  const cleanupPopup = () => {
    if (thisPopupView === popupView && popupView && overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.contentView.removeChildView(popupView);
      popupView = null;
      setTimeout(showNextPopup, 300);
    }
  };

  // Auto-dismiss after 15 seconds
  setTimeout(cleanupPopup, 15000);`;

content = content.replace(old_popup_close, new_popup_close);

content = content.replace('if (activePopup) {', 'if (popupView) {');

content = content.replace('let companionWindow: BrowserWindow | null = null;', '');

const old_create_overlay = `function createCompanion() {
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
    backgroundColor: '#00000000',  // fully transparent ARGB — required on Windows
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
  });`;

const new_create_overlay = `function createCompanion() {
  ensureOverlayWindow();
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const GHOST_OFFSET = 40;
  
  let cx = sw - 290, cy = sh - 420;
  try {
    const saved = JSON.parse(fs.readFileSync(companionPosPath, 'utf-8'));
    cx = saved.x ?? cx; cy = saved.y ?? cy;
  } catch { /* use defaults */ }

  companionView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });`;

content = content.replace(old_create_overlay, new_create_overlay);

const old_companion_rest = `  companionWindow.loadURL(\`http://localhost:\${NEXT_PORT}/companion\`);

  // Make the transparent area click-through by default.
  // The renderer will toggle this off when the cursor enters the bubble content.
  companionWindow.setIgnoreMouseEvents(true, { forward: true });

  // 'screen-saver' is the highest z-order level on Windows —
  // puts the companion above AE, browsers, fullscreen apps, everything
  companionWindow.setAlwaysOnTop(true, 'screen-saver');
  companionWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Save position when moved
  companionWindow.on('moved', () => {
    if (!companionWindow || companionWindow.isDestroyed()) return;
    const [x, y] = companionWindow.getPosition();
    try { fs.writeFileSync(companionPosPath, JSON.stringify({ x, y })); } catch { /* ignore */ }
  });`;

const new_companion_rest = `  companionView.webContents.loadURL(\`http://localhost:\${NEXT_PORT}/companion\`);
  companionView.setBackgroundColor('#00000000');
  overlayWindow.contentView.addChildView(companionView);
  companionView.setBounds({
    x: Math.max(0, cx),
    y: Math.max(0, cy) + GHOST_OFFSET,
    width: 310,
    height: 400
  });`;

content = content.replace(old_companion_rest, new_companion_rest);

content = content.replace("const QUICK_DESTINATIONS = [", overlay_creation + "\nconst QUICK_DESTINATIONS = [");

// IPC fixes
content = content.replace("companionWindow = null;", "companionView = null;");
content = content.replace("companionWindow?.hide()", "if (companionView && overlayWindow && !overlayWindow.isDestroyed()) { overlayWindow.contentView.removeChildView(companionView); companionView = null; }");
content = content.replace("if (!companionWindow || companionWindow.isDestroyed()) return;", "if (!companionView) return;");

const old_toggle = `function toggleCompanion() {
  if (!companionWindow || companionWindow.isDestroyed()) {
    createCompanion();
    return;
  }
  if (companionWindow.isVisible()) {
    companionWindow.hide();
  } else {
    companionWindow.showInactive();
  }
}`;
const new_toggle = `function toggleCompanion() {
  if (!companionView) {
    createCompanion();
  } else {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.contentView.removeChildView(companionView);
    }
    companionView = null;
  }
}`;
content = content.replace(old_toggle, new_toggle);

const old_drag = `ipcMain.on('companion:drag', (event, { dx, dy }) => {
  if (!companionWindow || companionWindow.isDestroyed()) return;
  const [x, y] = companionWindow.getPosition();
  companionWindow.setPosition(x + dx, y + dy);
});`;
const new_drag = `ipcMain.on('companion:drag', (event, { dx, dy }) => {
  if (!companionView) return;
  const bounds = companionView.getBounds();
  bounds.x += dx;
  bounds.y += dy;
  companionView.setBounds(bounds);
  try { fs.writeFileSync(companionPosPath, JSON.stringify({ x: bounds.x, y: bounds.y - 40 })); } catch { /* ignore */ }
});`;
content = content.replace(old_drag, new_drag);

fs.writeFileSync('electron/main.ts', content);
console.log('Patch applied.');
