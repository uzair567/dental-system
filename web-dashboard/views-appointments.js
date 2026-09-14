VIEWS.appointments = async function (main) {
  const today = new Date().toISOString().slice(0, 10);
  main.innerHTML = `
    <div class="topline">
      <div><h1>Appointments</h1><p>Website bookings and manually created appointments, all in one place.</p></div>
      <button class="btn btn-primary" id="add-appt-btn">+ New Appointment</button>
    </div>
    <div class="panel">
      <div class="toolbar">
        <input type="date" id="appt-date-filter" value="${today}">
        <select id="appt-status-filter">
          <option value="">All statuses</option>
          <option value="pending">Pending</option><option value="confirmed">Confirmed</option>
          <option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="no_show">No-show</option>
        </select>
        <select id="appt-dentist-filter"><option value="">All dentists</option></select>
        <button class="btn btn-outline btn-sm" id="appt-clear-date">Show all dates</button>
      </div>
      <table>
        <thead><tr><th>Date</th><th>Time</th><th>Patient</th><th>Dentist</th><th>Service</th><th>Source</th><th>Status</th><th></th></tr></thead>
        <tbody id="appt-tbody"><tr class="empty-row"><td colspan="8">Loading…</td></tr></tbody>
      </table>
    </div>
  `;

  try {
    const users = await api('/auth/users');
    const dentists = users.filter(u => u.role === 'dentist');
    document.getElementById('appt-dentist-filter').innerHTML += dentists.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
  } catch (e) { /* non-fatal */ }

  async function load() {
    const date = document.getElementById('appt-date-filter').value;
    const status = document.getElementById('appt-status-filter').value;
    const dentist_id = document.getElementById('appt-dentist-filter').value;
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (status) params.set('status', status);
    if (dentist_id) params.set('dentist_id', dentist_id);
    const rows = await api('/appointments?' + params.toString());
    document.getElementById('appt-tbody').innerHTML = rows.length ? rows.map(a => `
      <tr>
        <td>${fmtDate(a.date)}</td><td>${a.time}</td><td>${esc(a.patient_name || '—')}</td>
        <td>${esc(a.dentist_name || 'Unassigned')}</td><td>${esc(a.service_name || '—')}</td>
        <td class="small muted" style="text-transform:capitalize;">${a.source}</td><td>${pill(a.status)}</td>
        <td><button class="btn btn-outline btn-sm" data-appt="${a.id}">Manage</button></td>
      </tr>`).join('') : '<tr class="empty-row"><td colspan="8">No appointments match these filters.</td></tr>';
    document.querySelectorAll('[data-appt]').forEach(b => b.addEventListener('click', () => openAppointmentModal(b.dataset.appt, load)));
  }
  await load();
  document.getElementById('appt-date-filter').addEventListener('change', load);
  document.getElementById('appt-status-filter').addEventListener('change', load);
  document.getElementById('appt-dentist-filter').addEventListener('change', load);
  document.getElementById('appt-clear-date').addEventListener('click', () => { document.getElementById('appt-date-filter').value = ''; load(); });
  document.getElementById('add-appt-btn').addEventListener('click', () => openNewAppointmentModal(load));
};

async function patientPickerHtml() {
  return `<div class="field"><label>Patient phone</label><input type="tel" id="na-phone" placeholder="Search by phone number"></div>
    <div id="na-patient-result" class="small muted" style="margin-bottom:10px;"></div>`;
}

async function openNewAppointmentModal(onSaved) {
  const [services, users] = await Promise.all([api('/services'), api('/auth/users')]);
  const dentists = users.filter(u => u.role === 'dentist');
  let selectedPatientId = null;

  openModal(`
    <div class="modal-head"><h2 class="mb-0">New Appointment</h2><button onclick="closeModal()">&times;</button></div>
    <div id="na-msg"></div>
    ${await patientPickerHtml()}
    <form id="new-appt-form">
      <div class="field-row">
        <div class="field"><label>Service</label>
          <select name="service_id">${services.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Dentist</label>
          <select name="dentist_id"><option value="">Unassigned</option>${dentists.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select>
        </div>
      </div>
      <div class="field-row">
        <div class="field"><label>Date</label><input type="date" name="date" required></div>
        <div class="field"><label>Time</label><input type="time" name="time" required></div>
      </div>
      <div class="field"><label>Notes</label><textarea name="notes"></textarea></div>
      <div class="modal-actions"><button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Create Appointment</button></div>
    </form>`, true);

  document.getElementById('na-phone').addEventListener('input', async (e) => {
    const raw = e.target.value.trim();
    const q = raw.replace(/[\s\-()]/g, ''); // ignore spaces/dashes so formatting differences don't block a match
    const resultBox = document.getElementById('na-patient-result');
    if (q.length < 3) { resultBox.textContent = ''; selectedPatientId = null; return; }
    const results = await api('/patients?q=' + encodeURIComponent(q));
    if (results.length) {
      resultBox.innerHTML = results.slice(0, 5).map(p =>
        `<div><a href="#" data-pick="${p.id}" data-name="${esc(p.name)}">${esc(p.name)} — ${esc(p.phone)} (${esc(p.patient_code)})</a></div>`).join('');
      resultBox.querySelectorAll('[data-pick]').forEach(a => a.addEventListener('click', (ev) => {
        ev.preventDefault(); selectedPatientId = a.dataset.pick;
        resultBox.innerHTML = `<span style="color:var(--green);">Selected: ${a.dataset.name}</span>`;
      }));
    } else {
      resultBox.innerHTML = 'No matching patient for this number — double-check the digits, or add them first from the Patients page.';
    }
  });

  document.getElementById('new-appt-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedPatientId) { document.getElementById('na-msg').innerHTML = '<div class="form-msg err">Select a patient by phone first.</div>'; return; }
    const body = Object.fromEntries(new FormData(e.target).entries());
    body.patient_id = selectedPatientId;
    try { await api('/appointments', { method: 'POST', body: JSON.stringify(body) }); closeModal(); onSaved(); }
    catch (err) { document.getElementById('na-msg').innerHTML = `<div class="form-msg err">${esc(err.message)}</div>`; }
  });
}

async function openAppointmentModal(apptId, onSaved) {
  const rows = await api('/appointments');
  const a = rows.find(r => r.id === apptId);
  const users = await api('/auth/users');
  const dentists = users.filter(u => u.role === 'dentist');

  openModal(`
    <div class="modal-head"><h2 class="mb-0">Manage Appointment</h2><button onclick="closeModal()">&times;</button></div>
    <p class="small muted">${esc(a.patient_name || '—')} · ${esc(a.service_name || '—')}</p>
    <div id="am-msg"></div>
    <div class="field-row">
      <div class="field"><label>Date</label><input type="date" id="am-date" value="${a.date}"></div>
      <div class="field"><label>Time</label><input type="time" id="am-time" value="${a.time}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Dentist</label>
        <select id="am-dentist"><option value="">Unassigned</option>${dentists.map(d => `<option value="${d.id}" ${a.dentist_id === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Status</label>
        <select id="am-status">
          ${['pending', 'confirmed', 'completed', 'cancelled', 'no_show'].map(s => `<option value="${s}" ${a.status === s ? 'selected' : ''}>${s.replace('_', ' ')}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-danger" id="am-cancel-btn">Cancel Appointment</button>
      <button class="btn btn-outline" id="am-treatment-btn">+ Add Treatment Record</button>
      <button class="btn btn-primary" id="am-save-btn">Save Changes</button>
    </div>`, true);

  document.getElementById('am-save-btn').addEventListener('click', async () => {
    try {
      await api('/appointments/' + apptId, {
        method: 'PUT', body: JSON.stringify({
          date: document.getElementById('am-date').value, time: document.getElementById('am-time').value,
          dentist_id: document.getElementById('am-dentist').value || null,
          status: document.getElementById('am-status').value
        })
      });
      closeModal(); onSaved();
    } catch (err) { document.getElementById('am-msg').innerHTML = `<div class="form-msg err">${esc(err.message)}</div>`; }
  });

  document.getElementById('am-cancel-btn').addEventListener('click', async () => {
    if (!confirm('Cancel this appointment?')) return;
    await api('/appointments/' + apptId, { method: 'DELETE' });
    closeModal(); onSaved();
  });

  document.getElementById('am-treatment-btn').addEventListener('click', () => {
    openTreatmentModal(a.patient_id, () => { closeModal(); onSaved(); }, apptId);
  });
}
