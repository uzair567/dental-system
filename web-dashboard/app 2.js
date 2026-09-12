const API_BASE = '/api';
let STATE = { token: localStorage.getItem('dms_token') || null, user: JSON.parse(localStorage.getItem('dms_user') || 'null') };

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (STATE.token) headers['Authorization'] = 'Bearer ' + STATE.token;
  const res = await fetch(API_BASE + path, { ...options, headers });
  if (res.status === 401) { logout(); throw new Error('Session expired — please sign in again'); }
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json().catch(() => ({})) : null;
  if (!res.ok) throw new Error((data && data.error) || 'Something went wrong');
  return data;
}

async function apiUpload(path, formData) {
  const headers = {};
  if (STATE.token) headers['Authorization'] = 'Bearer ' + STATE.token;
  const res = await fetch(API_BASE + path, { method: 'POST', headers, body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

function fmtMoney(n) { return 'Rs ' + Number(n || 0).toLocaleString(); }
function fmtDate(s) { if (!s) return '—'; return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
function fmtDateTime(s) { if (!s) return '—'; return new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
function pill(status) { return `<span class="pill-status pill-${status}">${(status || '').replace('_', ' ')}</span>`; }
function esc(s) { return (s ?? '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------------- AUTH ----------------
function logout() {
  STATE.token = null; STATE.user = null;
  localStorage.removeItem('dms_token'); localStorage.removeItem('dms_user');
  document.getElementById('app-shell').classList.remove('active');
  document.getElementById('login-screen').style.display = 'flex';
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const errBox = document.getElementById('login-err');
  errBox.textContent = '';
  try {
    const res = await api('/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(fd.entries())) });
    STATE.token = res.token; STATE.user = res.user;
    localStorage.setItem('dms_token', res.token); localStorage.setItem('dms_user', JSON.stringify(res.user));
    boot();
  } catch (err) { errBox.textContent = err.message; }
});

document.getElementById('logout-btn').addEventListener('click', logout);

// ---------------- NAV ----------------
const NAV = [
  { key: 'overview', label: 'Dashboard', icon: '◆', roles: null },
  { key: 'patients', label: 'Patients', icon: '◔', roles: null },
  { key: 'leads', label: 'Leads', icon: '✦', roles: ['super_admin', 'receptionist', 'staff'] },
  { key: 'appointments', label: 'Appointments', icon: '▤', roles: null },
  { key: 'messages', label: 'Website Messages', icon: '✉', roles: ['super_admin', 'receptionist', 'staff'] },
  { key: 'billing', label: 'Billing & Payments', icon: '$', roles: null },
  { key: 'doctors', label: 'Doctors & Staff', icon: '☺', roles: ['super_admin'] },
  { key: 'services', label: 'Services', icon: '❖', roles: ['super_admin'] },
  { key: 'reports', label: 'Reports', icon: '▦', roles: ['super_admin', 'dentist'] },
  { key: 'activity', label: 'Activity Log', icon: '≡', roles: ['super_admin'] },
];

function canSee(item) { return !item.roles || item.roles.includes(STATE.user.role); }

function renderSidebar(active) {
  const items = NAV.filter(canSee).map(i => `
    <div class="nav-item ${i.key === active ? 'active' : ''}" data-nav="${i.key}">
      <span class="nav-icon">${i.icon}</span> ${i.label}
    </div>`).join('');
  document.getElementById('sidebar-nav').innerHTML = items;
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => go(el.dataset.nav));
  });
  document.getElementById('sidebar-user-name').textContent = STATE.user.name;
  document.getElementById('sidebar-user-role').textContent = STATE.user.role.replace('_', ' ');
}

const VIEWS = {}; // populated by view modules below
let currentView = 'overview';

async function go(view) {
  currentView = view;
  renderSidebar(view);
  const main = document.getElementById('main-content');
  main.innerHTML = '<p class="muted">Loading…</p>';
  try {
    await VIEWS[view](main);
  } catch (err) {
    main.innerHTML = `<div class="panel"><p style="color:var(--red);">${esc(err.message)}</p></div>`;
  }
}

async function boot() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-shell').classList.add('active');
  go('overview');
}

// modal helpers
function openModal(html, wide) {
  const backdrop = document.getElementById('modal-backdrop');
  backdrop.innerHTML = `<div class="modal ${wide ? 'modal-wide' : ''}">${html}</div>`;
  backdrop.classList.add('open');
  backdrop.onclick = (e) => { if (e.target === backdrop) closeModal(); };
}
function closeModal() { document.getElementById('modal-backdrop').classList.remove('open'); document.getElementById('modal-backdrop').innerHTML = ''; }

// ---------------- Print helper (shared by invoices + treatment records) ----------------
const CLINIC_PRINT_INFO = {
  name: 'Meridian Dental',
  address: 'Suite 4, Blue Court Plaza, Blue Area, Islamabad',
  phone: '+92 300 1234567',
  email: 'hello@meridiandental.pk'
};

function printDocument(docLabel, bodyHtml) {
  const win = window.open('', '_blank', 'width=800,height=900');
  win.document.write(`
    <!DOCTYPE html><html><head><title>${esc(docLabel)}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; color: #16241f; padding: 40px; max-width: 720px; margin: 0 auto; }
      .letterhead { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1f4d43; padding-bottom: 18px; margin-bottom: 24px; }
      .letterhead h1 { font-size: 1.5rem; margin: 0 0 4px; color: #123128; }
      .letterhead .meta { font-size: .82rem; color: #657069; line-height: 1.6; }
      .doc-title { text-align: right; }
      .doc-title h2 { margin: 0; font-size: 1.3rem; color: #1f4d43; }
      .doc-title .date { font-size: .82rem; color: #657069; }
      .party { margin-bottom: 22px; font-size: .92rem; }
      .party b { display: block; font-size: 1.05rem; margin-bottom: 2px; }
      table { width: 100%; border-collapse: collapse; margin: 18px 0; font-size: .92rem; }
      th { text-align: left; border-bottom: 2px solid #e1e4de; padding: 8px 6px; font-size: .78rem; text-transform: uppercase; color: #657069; }
      td { padding: 9px 6px; border-bottom: 1px solid #e1e4de; }
      .right { text-align: right; }
      .totals { margin-top: 10px; width: 260px; margin-left: auto; font-size: .92rem; }
      .totals div { display: flex; justify-content: space-between; padding: 5px 0; }
      .totals .grand { font-weight: 700; font-size: 1.05rem; border-top: 1px solid #16241f; padding-top: 8px; margin-top: 4px; }
      .status-stamp { display: inline-block; margin-top: 14px; padding: 5px 14px; border-radius: 20px; font-size: .8rem; font-weight: 700; }
      .status-paid { background: #e5f0ea; color: #2f8a5c; }
      .status-unpaid { background: #f8e6e1; color: #c0442d; }
      .status-partial { background: #faf1de; color: #c8912c; }
      .summary-box { background: #f7f8f5; border-radius: 6px; padding: 14px 16px; margin: 18px 0; font-size: .9rem; line-height: 1.6; }
      .footer-note { margin-top: 40px; font-size: .78rem; color: #657069; text-align: center; border-top: 1px solid #e1e4de; padding-top: 14px; }
      @media print { body { padding: 0; } }
    </style></head><body>
      <div class="letterhead">
        <div>
          <h1>${esc(CLINIC_PRINT_INFO.name)}</h1>
          <div class="meta">${esc(CLINIC_PRINT_INFO.address)}<br>${esc(CLINIC_PRINT_INFO.phone)} · ${esc(CLINIC_PRINT_INFO.email)}</div>
        </div>
        <div class="doc-title"><h2>${esc(docLabel)}</h2><div class="date">${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div></div>
      </div>
      ${bodyHtml}
      <div class="footer-note">Thank you for choosing ${esc(CLINIC_PRINT_INFO.name)}.</div>
    </body></html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

if (STATE.token && STATE.user) boot();
