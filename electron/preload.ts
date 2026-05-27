import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close:    () => ipcRenderer.send('window:close'),
  isElectron: true,

  // Download popup actions
  popupMove:   (filePath: string, destDir: string) => ipcRenderer.send('popup:move', { filePath, destDir }),
  popupIgnore: () => ipcRenderer.send('popup:ignore'),

  // Listen for fs refresh from main — returns cleanup fn to call on unmount
  onFsRefresh: (cb: () => void) => {
    const handler = (_event: Electron.IpcRendererEvent) => cb();
    ipcRenderer.on('fs:refresh', handler);
    return () => ipcRenderer.removeListener('fs:refresh', handler);
  },

  // Window animation sync — lets React play CSS animations in sync with Electron
  onWindowAnimate: (event: string, cb: () => void) => {
    const channel = `window:animate:${event}`;
    const handler = () => cb();
    ipcRenderer.on(channel, handler);
    // Return cleanup function
    return () => ipcRenderer.removeListener(channel, handler);
  },
  // After Effects Integration
  isAEOpen: () => ipcRenderer.invoke('is-ae-open'),
  popupImportAE: (filePath: string, deleteOriginal?: boolean) =>
    ipcRenderer.send('popup-import-ae', { filePath, deleteOriginal: deleteOriginal ?? false }),

  // Project folder management
  openProjectFolder: (folderPath: string) => ipcRenderer.send('open-project-folder', folderPath),
  aeRunRelinkScript: (script: string) => ipcRenderer.send('ae-run-relink-script', script),

  // ── MooMotion Companion ────────────────────────────────────────
  companion: {
    hide:             () => ipcRenderer.send('companion:hide'),
    setHeight:        (h: number) => ipcRenderer.send('companion:set-height', h),
    openMain:         () => ipcRenderer.send('companion:open-main'),
    importToAE:       () => ipcRenderer.send('companion:import-to-ae'),
    isAERunning:      () => ipcRenderer.invoke('companion:is-ae-running'),
    getActiveProject: () => ipcRenderer.invoke('companion:get-active-project'),
    getRecents:       () => ipcRenderer.invoke('companion:get-recents'),
    moveBy:           (dx: number, dy: number) => ipcRenderer.send('companion:move-by', dx, dy),
  },
});
