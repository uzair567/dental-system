function esc(s) { return (s ?? '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtDate(s) { if (!s) return '—'; return new Date(s).toLocaleDateString(); }
function syncBadge(r) { return r._synced ? '<span class="sync-badge synced">synced</span>' : '<span class="sync-badge pending">pending</span>'; }

function openModal(html) {
  const backdrop = document.getElementById('modal-backdrop');
  backdrop.innerHTML = `<div class="modal">${html}</div>`;
  backdrop.classList.add('open');
  backdrop.onclick = (e) => { if (e.target === backdrop) closeModal(); };
}
function closeModal() { document.getElementById('modal-backdrop').classList.remove('open'); document.getElementById('modal-backdrop').innerHTML = ''; }

// ---------------- Setup / login ----------------
async function initSetup() {
  const cfg = await window.desktop.getConfig();
  if (cfg.serverUrl) document.getElementById('su-server').value = cfg.serverUrl;
  if (cfg.authToken) { showApp(); return; }

  document.getElementById('su-connect-btn').addEventListener('click', async () => {
    const serverUrl = document.getElementById('su-server').value.trim();
    const email = document.getElementById('su-email').value.trim();
    const password = document.getElementById('su-password').value;
    const err = document.getElementById('setup-err');
    err.textContent = '';
    if (!serverUrl || !email || !password) { err.textContent = 'Fill in the server URL, email and password.'; return; }
    try {
      await window.desktop.login(serverUrl, email, password);
      showApp();
    } catch (e) { err.textContent = e.message; }
  });

  document.getElementById('su-skip').addEventListener('click', async (e) => {
    e.preventDefault();
    const serverUrl = document.getElementById('su-server').value.trim();
    if (serverUrl) await window.desktop.setServerUrl(serverUrl);
    showApp();
  });
}

function showApp() {
  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('app-shell').classList.add('active');
  bootApp();
}

// ---------------- Main app ----------------
async function bootApp() {
  renderTabs();
  await refreshAll();
  await refreshStatus();
  setInterval(refreshStatus, 8000);

  document.getElementById('sync-now-btn').addEventListener('click', async () => {
    logLine('Syncing…');
    const res = await window.desktop.syncNow();
    (res.logs || []).forEach(logLine);
    await refreshAll();
    await refreshStatus();
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await window.desktop.logout();
    location.reload();
  });

  window.desktop.onSyncLog((msg) => logLine(msg));
  window.desktop.onSyncStatus(() => { refreshAll(); refreshStatus(); });

  document.getElementById('add-patient-btn').addEventListener('click', openAddPatientModal);
  document.getElementById('add-lead-btn').addEventListener('click', openAddLeadModal);
  document.getElementById('add-appt-btn').addEventListener('click', openAddAppointmentModal);
}

function renderTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.querySelector(`[data-pane="${btn.dataset.tab}"]`).classList.add('active');
  }));
}

function logLine(msg) {
  const box = document.getElementById('sync-log');
  const line = document.createElement('div');
  line.textContent = `${new Date().toLocaleTimeString()} — ${msg}`;
  box.prepend(line);
}

async function refreshStatus() {
  const online = await window.desktop.isOnline();
  const indicator = document.getElementById('online-indicator');
  indicator.innerHTML = `<span class="dot ${online ? 'online' : 'offline'}"></span>${online ? 'Online — synced with live server' : 'Offline — working locally'}`;
  const pending = await window.desktop.pendingCount();
  document.getElementById('pending-badge').textContent = `${pending} pending`;
}

async function refreshAll() {
  const [patients, leads, appts] = await Promise.all([
    window.desktop.list('patients'), window.desktop.list('leads'), window.desktop.list('appointments')
  ]);

  document.getElementById('patients-tbody').innerHTML = patients.length ? patients.map(p => `
    <tr><td>${esc(p.patient_code || '—')}</td><td>${esc(p.name)}</td><td>${esc(p.phone)}</td><td>${esc(p.email || '—')}</td><td>${syncBadge(p)}</td></tr>
  `).join('') : '<tr class="empty-row"><td colspan="5">No patients added on this device yet.</td></tr>';

  document.getElementById('leads-tbody').innerHTML = leads.length ? leads.map(l => `
    <tr><td>${esc(l.name)}</td><td>${esc(l.phone || '—')}</td><td>${esc(l.status || 'new')}</td><td>${syncBadge(l)}</td></tr>
  `).join('') : '<tr class="empty-row"><td colspan="4">No leads added on this device yet.</td></tr>';

  document.getElementById('appts-tbody').innerHTML = appts.length ? appts.map(a => `
    <tr><td>${fmtDate(a.date)}</td><td>${esc(a.time)}</td><td class="small">${esc((a.patient_id || '').slice(0, 8))}…</td><td>${esc(a.status || 'pending')}</td><td>${syncBadge(a)}</td></tr>
  `).join('') : '<tr class="empty-row"><td colspan="5">No appointments added on this device yet.</td></tr>';
}

// ---------------- Add modals ----------------
function openAddPatientModal() {
  openModal(`
    <div class="modal-head"><h2 style="margin:0;">Add Patient</h2><button onclick="closeModal()">&times;</button></div>
    <form id="dp-patient-form">
      <div class="field"><label>Phone number</label><input type="tel" name="phone" required></div>
      <div class="field"><label>Full name</label><input type="text" name="name" required></div>
      <div class="field"><label>Email</label><input type="email" name="email"></div>
      <div class="modal-actions"><button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save</button></div>
    </form>`);
  document.getElementById('dp-patient-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    const list = await window.desktop.list('patients');
    body.patient_code = 'LOCAL-' + String(list.length + 1).padStart(4, '0');
    await window.desktop.insert('patients', body);
    closeModal(); refreshAll(); refreshStatus();
  });
}

function openAddLeadModal() {
  openModal(`
    <div class="modal-head"><h2 style="margin:0;">Add Lead</h2><button onclick="closeModal()">&times;</button></div>
    <form id="dp-lead-form">
      <div class="field"><label>Name</label><input type="text" name="name" required></div>
      <div class="field"><label>Phone</label><input type="tel" name="phone"></div>
      <div class="field"><label>Notes</label><input type="text" name="notes"></div>
      <div class="modal-actions"><button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save</button></div>
    </form>`);
  document.getElementById('dp-lead-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    body.status = 'new'; body.source = 'desktop_app';
    await window.desktop.insert('leads', body);
    closeModal(); refreshAll(); refreshStatus();
  });
}

async function openAddAppointmentModal() {
  const patients = await window.desktop.list('patients');
  openModal(`
    <div class="modal-head"><h2 style="margin:0;">Add Appointment</h2><button onclick="closeModal()">&times;</button></div>
    <form id="dp-appt-form">
      <div class="field"><label>Patient</label>
        <select name="patient_id" required>
          <option value="">Select a patient</option>
          ${patients.map(p => `<option value="${p.id}">${esc(p.name)} — ${esc(p.phone)}</option>`).join('')}
        </select>
      </div>
      <div class="field-row">
        <div class="field"><label>Date</label><input type="date" name="date" required></div>
        <div class="field"><label>Time</label><input type="time" name="time" required></div>
      </div>
      <div class="modal-actions"><button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save</button></div>
    </form>
    ${!patients.length ? '<p class="helper">Add a patient first — offline appointments need a local patient record.</p>' : ''}
    `);
  document.getElementById('dp-appt-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    body.status = 'confirmed'; body.source = 'dashboard'; body.duration_minutes = 30;
    await window.desktop.insert('appointments', body);
    closeModal(); refreshAll(); refreshStatus();
  });
}

initSetup();
