const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('uangq', {
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onAuthCallback: (cb) => ipcRenderer.on('auth-callback', (_e, url) => cb(url))
});
