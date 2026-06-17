const fs = require('fs');

let c = fs.readFileSync('electron/main.ts', 'utf-8');

c = c.replace('let activePopup: BrowserWindow | null = null;', 'let popupView: WebContentsView | null = null;');
c = c.replace('if (activePopup) return;', 'if (popupView) return;');

const old_create = `  activePopup = new BrowserWindow({
    width: W,
    height: H + GHOST_OFFSET,          // extra height so content isn't clipped
    x: Math.round((sw - W) / 2),
    y: Math.round((sh - H) / 2) - GHOST_OFFSET, // push ghost bar above screen edge
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

const new_create = `  popupView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  popupView.setBackgroundColor('#00000000');
  
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    // Fallback if not created
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
    overlayWindow = new BrowserWindow({
      width: sw, height: sh + GHOST_OFFSET, x: 0, y: -GHOST_OFFSET,
      frame: false, transparent: true, alwaysOnTop: true,
      skipTaskbar: true, focusable: false, hasShadow: false, show: true,
    });
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  
  overlayWindow.contentView.addChildView(popupView);
  popupView.setBounds({
    x: sw - W - 20,
    y: sh - H - 20 + GHOST_OFFSET,
    width: W,
    height: H
  });`;

c = c.replace(old_create, new_create);

c = c.replace('activePopup.loadURL(', 'popupView.webContents.loadURL(');

const old_close = `  // Slide in from the right
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
  }, 15000);`;

const new_close = `  const thisPopupView = popupView;
  const cleanup = () => {
    if (thisPopupView === popupView && popupView && overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.contentView.removeChildView(popupView);
      popupView = null;
      setTimeout(showNextPopup, 300);
    }
  };
  setTimeout(cleanup, 15000);`;

// The comment might have weird encoding, so we'll regex replace it:
c = c.replace(/  \/\/ Slide in from the right[\s\S]*?}, 15000\);/, new_close);

c = c.replace('if (activePopup) {', 'if (popupView) {');
c = c.replace('activePopup.close();', '/* webcontentsview has no close */');

fs.writeFileSync('electron/main.ts', c);
console.log('Done');
