const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopSync', {
  getConfig: () => ipcRenderer.invoke('syncconfig:get'),
  connect: (remoteUrl, email, password) => ipcRenderer.invoke('syncconfig:connect', { remoteUrl, email, password }),
  disconnect: () => ipcRenderer.invoke('syncconfig:disconnect'),
  syncNow: () => ipcRenderer.invoke('sync:now'),
  isOnline: () => ipcRenderer.invoke('sync:isOnline'),
  pendingCount: () => ipcRenderer.invoke('sync:pendingCount'),
  onLog: (cb) => ipcRenderer.on('sync:log', (e, msg) => cb(msg)),
  onStatus: (cb) => ipcRenderer.on('sync:status', (e, status) => cb(status)),
});

// Inject a small floating sync bar into whatever page loads (the real dashboard UI),
// so staff can see online/offline status and connect this computer to the live server —
// without needing to modify the dashboard's own source files.
window.addEventListener('DOMContentLoaded', () => {
  const bar = document.createElement('div');
  bar.id = 'desktop-sync-bar';
  bar.innerHTML = `
    <style>
      #desktop-sync-bar {
        position: fixed; top: 10px; right: 14px; z-index: 99999;
        background: #123128; color: #dfe8e3; border-radius: 20px;
        padding: 7px 14px; font: 12px -apple-system, "Segoe UI", sans-serif;
        display: flex; align-items: center; gap: 10px; box-shadow: 0 4px 14px rgba(0,0,0,.25);
      }
      #desktop-sync-bar .dot { width: 7px; height: 7px; border-radius: 50%; background: #c0442d; flex-shrink: 0; }
      #desktop-sync-bar .dot.on { background: #2f8a5c; }
      #desktop-sync-bar button {
        background: rgba(255,255,255,.12); color: #fff; border: none; border-radius: 14px;
        padding: 4px 10px; font-size: 11px; cursor: pointer;
      }
      #desktop-sync-bar button:hover { background: rgba(255,255,255,.22); }
      #ds-connect-modal {
        position: fixed; inset: 0; background: rgba(18,49,40,.55); z-index: 100000;
        display: none; align-items: center; justify-content: center;
      }
      #ds-connect-modal.open { display: flex; }
      #ds-connect-modal .box {
        background: #fff; border-radius: 8px; padding: 26px; width: 360px; font: 13px -apple-system, sans-serif; color: #16241f;
      }
      #ds-connect-modal h3 { margin: 0 0 4px; font-family: Georgia, serif; color: #123128; }
      #ds-connect-modal p { color: #657069; margin: 0 0 14px; font-size: 12px; }
      #ds-connect-modal label { display: block; font-size: 11px; font-weight: 600; color: #1f4d43; margin-bottom: 4px; }
      #ds-connect-modal input {
        width: 100%; padding: 8px 10px; border: 1px solid #e1e4de; border-radius: 5px; margin-bottom: 12px; font-size: 13px; box-sizing: border-box;
      }
      #ds-connect-modal .err { color: #c0442d; font-size: 12px; margin-bottom: 10px; }
      #ds-connect-modal .actions { display: flex; justify-content: flex-end; gap: 8px; }
      #ds-connect-modal .actions button {
        padding: 8px 16px; border-radius: 5px; border: none; font-size: 12px; cursor: pointer;
      }
      #ds-cancel { background: #f0f0eb; color: #16241f; }
      #ds-submit { background: #1f4d43; color: #fff; }
    </style>
    <span class="dot" id="ds-dot"></span>
    <span id="ds-label">Checking…</span>
    <span id="ds-pending"></span>
    <button id="ds-sync-btn">Sync Now</button>
    <button id="ds-connect-btn" style="display:none;">Connect to live server</button>
  `;
  document.body.appendChild(bar);

  const modal = document.createElement('div');
  modal.id = 'ds-connect-modal';
  modal.innerHTML = `
    <div class="box">
      <h3>Connect to Live Server</h3>
      <p>Enter your clinic's live server address and your staff login. This lets this computer sync offline changes automatically.</p>
      <div id="ds-err" class="err"></div>
      <label>Live server URL</label>
      <input id="ds-url" placeholder="https://your-clinic-server.onrender.com">
      <label>Staff email</label>
      <input id="ds-email" type="email">
      <label>Password</label>
      <input id="ds-pass" type="password">
      <div class="actions">
        <button id="ds-cancel">Cancel</button>
        <button id="ds-submit">Connect</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const dot = document.getElementById('ds-dot');
  const label = document.getElementById('ds-label');
  const pendingEl = document.getElementById('ds-pending');
  const connectBtn = document.getElementById('ds-connect-btn');
  const syncBtn = document.getElementById('ds-sync-btn');

  async function refresh() {
    const cfg = await window.desktopSync.getConfig();
    if (!cfg.remoteUrl || !cfg.connected) {
      dot.classList.remove('on');
      label.textContent = 'Not connected';
      connectBtn.style.display = '';
      syncBtn.style.display = 'none';
      pendingEl.textContent = '';
      return;
    }
    connectBtn.style.display = 'none';
    syncBtn.style.display = '';
    const online = await window.desktopSync.isOnline();
    dot.classList.toggle('on', online);
    label.textContent = online ? 'Online' : 'Offline';
    const pending = await window.desktopSync.pendingCount();
    pendingEl.textContent = pending ? `· ${pending} pending` : '';
  }

  connectBtn.addEventListener('click', () => { modal.classList.add('open'); });
  document.getElementById('ds-cancel').addEventListener('click', () => { modal.classList.remove('open'); });
  document.getElementById('ds-submit').addEventListener('click', async () => {
    const url = document.getElementById('ds-url').value.trim();
    const email = document.getElementById('ds-email').value.trim();
    const pass = document.getElementById('ds-pass').value;
    const err = document.getElementById('ds-err');
    err.textContent = '';
    if (!url || !email || !pass) { err.textContent = 'Fill in all fields.'; return; }
    try {
      await window.desktopSync.connect(url, email, pass);
      modal.classList.remove('open');
      refresh();
    } catch (e) { err.textContent = e.message; }
  });

  syncBtn.addEventListener('click', async () => {
    syncBtn.textContent = 'Syncing…';
    await window.desktopSync.syncNow();
    syncBtn.textContent = 'Sync Now';
    refresh();
  });

  window.desktopSync.onStatus(() => refresh());
  refresh();
  setInterval(refresh, 8000);
});
