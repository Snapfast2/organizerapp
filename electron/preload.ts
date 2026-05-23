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
});
