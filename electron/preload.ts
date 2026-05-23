import { contextBridge, ipcRenderer } from 'electron';

// Exponer controles de ventana al renderer (la app de Next.js)
contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  isElectron: true,
});
