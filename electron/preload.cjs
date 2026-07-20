const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pos', {
  getPaths: () => ipcRenderer.invoke('get-paths'),
  getLocalConfig: () => ipcRenderer.invoke('get-local-config'),
  setLocalConfig: (config) => ipcRenderer.invoke('set-local-config', config),
  getLanIp: () => ipcRenderer.invoke('get-lan-ip'),
  getApiInfo: () => ipcRenderer.invoke('get-api-info'),
  quit: () => ipcRenderer.send('app-quit'),
  reload: () => ipcRenderer.send('app-reload'),
});
