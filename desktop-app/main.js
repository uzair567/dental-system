const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { LocalStore, TABLES } = require('./store');
const { isOnline, login, syncNow } = require('./sync');

let mainWindow;
let store;
let configPath;
let syncInterval;

function loadConfig() {
  if (!fs.existsSync(configPath)) {
    return { serverUrl: '', authToken: null, userName: null, userRole: null };
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}
function saveConfig(patch) {
  const cfg = { ...loadConfig(), ...patch };
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
  return cfg;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180, height: 780, minWidth: 920, minHeight: 600,
    title: 'Meridian Dental — Desktop (Offline-Capable)',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  const dataDir = path.join(app.getPath('userData'), 'offline-data');
  store = new LocalStore(dataDir);
  configPath = path.join(app.getPath('userData'), 'config.json');

  createWindow();

  // Background sync loop — every 20s, silently sync if online & signed in.
  syncInterval = setInterval(async () => {
    const cfg = loadConfig();
    if (!cfg.serverUrl || !cfg.authToken) return;
    try {
      const result = await syncNow(store, cfg.serverUrl, cfg.authToken, (msg) => {
        mainWindow?.webContents.send('sync:log', msg);
      });
      mainWindow?.webContents.send('sync:status', { ...result, at: new Date().toISOString() });
    } catch (e) { /* swallow — will retry next tick */ }
  }, 20000);

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { clearInterval(syncInterval); if (process.platform !== 'darwin') app.quit(); });

// ---------------- IPC: config ----------------
ipcMain.handle('config:get', () => loadConfig());
ipcMain.handle('config:setServerUrl', (e, serverUrl) => saveConfig({ serverUrl }));
ipcMain.handle('config:login', async (e, { serverUrl, email, password }) => {
  const res = await login(serverUrl, email, password);
  saveConfig({ serverUrl, authToken: res.token, userName: res.user.name, userRole: res.user.role });
  return res.user;
});
ipcMain.handle('config:logout', () => saveConfig({ authToken: null, userName: null, userRole: null }));
ipcMain.handle('config:isOnline', async () => {
  const cfg = loadConfig();
  return isOnline(cfg.serverUrl);
});

// ---------------- IPC: local data CRUD ----------------
ipcMain.handle('data:list', (e, table) => {
  if (!TABLES.includes(table)) throw new Error('Unknown table');
  return store.list(table).sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
});
ipcMain.handle('data:insert', (e, { table, record }) => {
  if (!TABLES.includes(table)) throw new Error('Unknown table');
  return store.insert(table, record);
});
ipcMain.handle('data:update', (e, { table, id, patch }) => {
  if (!TABLES.includes(table)) throw new Error('Unknown table');
  return store.update(table, id, patch);
});

// ---------------- IPC: manual sync trigger ----------------
ipcMain.handle('sync:now', async () => {
  const cfg = loadConfig();
  const logs = [];
  const result = await syncNow(store, cfg.serverUrl, cfg.authToken, (msg) => logs.push(msg));
  return { ...result, logs };
});

ipcMain.handle('sync:pendingCount', () => {
  return TABLES.reduce((sum, t) => sum + store.unsynced(t).length, 0);
});
