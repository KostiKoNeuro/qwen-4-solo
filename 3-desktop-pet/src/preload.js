const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('magpie', {
  getInit: () => ipcRenderer.invoke('get-init'),
  onMetrics: (cb) => ipcRenderer.on('metrics', (_e, d) => cb(d)),
  onClipboard: (cb) => ipcRenderer.on('clipboard', (_e, t) => cb(t)),
  onIdle: (cb) => ipcRenderer.on('idle', (_e, s) => cb(s)),
  onAction: (cb) => ipcRenderer.on('action', (_e, a) => cb(a)),
  setIgnore: (v) => ipcRenderer.send('set-ignore', v),
  reportState: (s) => ipcRenderer.send('pet-state', s),
});
