const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { createLocalApp } = require('./local-server/app');
const syncEngine = require('./sync-engine');

let mainWindow;
let localDb;
let configPath;
let syncInterval;
const LOCAL_PORT = 4321;

function loadConfig() {
  if (!fs.existsSync(configPath)) {
    return { remoteUrl: '', remoteEmail: '', remoteToken: null, deviceId: require('crypto').randomUUID(), lastSyncAt: null };
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
    width: 1280, height: 820, minWidth: 960, minHeight: 640,
    title: 'Meridian Dental — Desktop (Offline-Capable)',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  mainWindow.loadURL(`http://localhost:${LOCAL_PORT}/`);
}

app.whenReady().then(() => {
  const userData = app.getPath('userData');
  const dbPath = path.join(userData, 'local.db');
  const uploadsPath = path.join(userData, 'uploads');
  const webDashboardPath = path.join(__dirname, '..', 'web-dashboard');
  configPath = path.join(userData, 'sync-config.json');

  const { app: localExpressApp, db } = createLocalApp({ dbPath, uploadsPath, webDashboardPath });
  localDb = db;
  localExpressApp.listen(LOCAL_PORT, '127.0.0.1', () => {
    console.log(`Local embedded server running on http://localhost:${LOCAL_PORT}`);
    createWindow();
  });

  // Background sync loop — every 20s, silently sync if a remote server + token are configured.
  syncInterval = setInterval(async () => {
    const cfg = loadConfig();
    if (!cfg.remoteUrl || !cfg.remoteToken) return;
    try {
      const result = await syncEngine.syncNow(localDb, cfg.remoteUrl, cfg.remoteToken, cfg, (msg) => {
        mainWindow?.webContents.send('sync:log', msg);
      });
      if (result.ok && result.newLastSyncAt) saveConfig({ lastSyncAt: result.newLastSyncAt });
      mainWindow?.webContents.send('sync:status', { ...result, at: new Date().toISOString() });
    } catch (e) { mainWindow?.webContents.send('sync:log', 'Sync error: ' + e.message); }
  }, 20000);

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { clearInterval(syncInterval); if (process.platform !== 'darwin') app.quit(); });

// ---------------- IPC: sync configuration ----------------
ipcMain.handle('syncconfig:get', () => {
  const cfg = loadConfig();
  return { remoteUrl: cfg.remoteUrl, remoteEmail: cfg.remoteEmail, connected: !!cfg.remoteToken };
});

ipcMain.handle('syncconfig:connect', async (e, { remoteUrl, email, password }) => {
  const res = await syncEngine.login(remoteUrl, email, password);
  saveConfig({ remoteUrl, remoteEmail: email, remoteToken: res.token });
  return { ok: true, user: res.user };
});

ipcMain.handle('syncconfig:disconnect', () => {
  saveConfig({ remoteUrl: '', remoteEmail: '', remoteToken: null, lastSyncAt: null });
  return { ok: true };
});

// ---------------- IPC: manual sync + status ----------------
ipcMain.handle('sync:now', async () => {
  const cfg = loadConfig();
  const logs = [];
  const result = await syncEngine.syncNow(localDb, cfg.remoteUrl, cfg.remoteToken, cfg, (msg) => logs.push(msg));
  if (result.ok && result.newLastSyncAt) saveConfig({ lastSyncAt: result.newLastSyncAt });
  return { ...result, logs };
});

ipcMain.handle('sync:isOnline', async () => {
  const cfg = loadConfig();
  return cfg.remoteUrl ? syncEngine.isOnline(cfg.remoteUrl) : false;
});

ipcMain.handle('sync:pendingCount', () => {
  const cfg = loadConfig();
  const since = cfg.lastSyncAt || '1970-01-01T00:00:00.000Z';
  let count = 0;
  for (const [table, spec] of Object.entries(syncEngine.SYNCABLE)) {
    try {
      count += localDb.prepare(`SELECT COUNT(*) c FROM ${table} WHERE ${spec.timeCol} > ?`).get(since).c;
    } catch (e) { /* table might not exist yet on a brand-new db — ignore */ }
  }
  return count;
});
