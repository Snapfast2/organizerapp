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

  // Listen for fs refresh from main
  onFsRefresh: (cb: () => void) => ipcRenderer.on('fs:refresh', cb),

  // After Effects Integration
  isAEOpen: () => ipcRenderer.invoke('is-ae-open'),
  popupImportAE: (filePath: string, deleteOriginal?: boolean) =>
    ipcRenderer.send('popup-import-ae', { filePath, deleteOriginal: deleteOriginal ?? false }),

  // Project folder management
  openProjectFolder: (folderPath: string) => ipcRenderer.send('open-project-folder', folderPath),
  aeRunRelinkScript: (script: string) => ipcRenderer.send('ae-run-relink-script', script),
});
