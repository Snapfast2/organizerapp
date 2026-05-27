import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize:        () => ipcRenderer.send('window:minimize'),
  minimizeExecute: () => ipcRenderer.send('window:minimize-execute'), // called by Genie after animation
  maximize:        () => ipcRenderer.send('window:maximize'),
  close:           () => ipcRenderer.send('window:close'),
  isElectron: true,

  // Download popup actions
  popupMove:   (filePath: string, destDir: string) => ipcRenderer.send('popup:move', { filePath, destDir }),
  popupIgnore: () => ipcRenderer.send('popup:ignore'),

  // Listen for fs refresh from main
  onFsRefresh: (cb: () => void) => ipcRenderer.on('fs:refresh', cb),

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
});
