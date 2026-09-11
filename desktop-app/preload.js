const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setServerUrl: (url) => ipcRenderer.invoke('config:setServerUrl', url),
  login: (serverUrl, email, password) => ipcRenderer.invoke('config:login', { serverUrl, email, password }),
  logout: () => ipcRenderer.invoke('config:logout'),
  isOnline: () => ipcRenderer.invoke('config:isOnline'),

  list: (table) => ipcRenderer.invoke('data:list', table),
  insert: (table, record) => ipcRenderer.invoke('data:insert', { table, record }),
  update: (table, id, patch) => ipcRenderer.invoke('data:update', { table, id, patch }),

  syncNow: () => ipcRenderer.invoke('sync:now'),
  pendingCount: () => ipcRenderer.invoke('sync:pendingCount'),

  onSyncLog: (cb) => ipcRenderer.on('sync:log', (e, msg) => cb(msg)),
  onSyncStatus: (cb) => ipcRenderer.on('sync:status', (e, status) => cb(status)),
});
