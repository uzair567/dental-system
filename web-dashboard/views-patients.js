VIEWS.patients = async function (main) {
  main.innerHTML = `
    <div class="topline">
      <div><h1>Patients</h1><p>Search by phone, name, email or patient ID.</p></div>
      <button class="btn btn-primary" id="add-patient-btn">+ Add Patient</button>
    </div>
    <div class="panel">
      <div class="toolbar"><input type="search" id="patient-search" placeholder="Search patients…"></div>
      <table>
        <thead><tr><th>ID</th><th>Name</th><th>Phone</th><th>Email</th><th>Registered</th></tr></thead>
        <tbody id="patients-tbody"><tr class="empty-row"><td colspan="5">Loading…</td></tr></tbody>
      </table>
    </div>
  `;

  async function loadList(q) {
    const rows = await api('/patients' + (q ? '?q=' + encodeURIComponent(q) : ''));
    const tbody = document.getElementById('patients-tbody');
    tbody.innerHTML = rows.length ? rows.map(p => `
      <tr class="clickable" data-id="${p.id}">
        <td>${esc(p.patient_code)}</td><td>${esc(p.name)}</td><td>${esc(p.phone)}</td>
        <td>${esc(p.email || '—')}</td><td>${fmtDate(p.created_at)}</td>
      </tr>`).join('') : '<tr class="empty-row"><td colspan="5">No patients found.</td></tr>';
    tbody.querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => openPatientProfile(tr.dataset.id)));
  }
  await loadList();

  let searchTimer;
  document.getElementById('patient-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadList(e.target.value), 250);
  });

  document.getElementById('add-patient-btn').addEventListener('click', openAddPatientFlow);
};

// ---------- Add Patient: phone first, then dedupe check ----------
function openAddPatientFlow() {
  openModal(`
    <div class="modal-head"><h2 class="mb-0">Add Patient</h2><button onclick="closeModal()">&times;</button></div>
    <div id="add-patient-msg"></div>
    <div class="field"><label>Phone number</label><input type="tel" id="ap-phone" placeholder="Enter phone number first" autofocus></div>
    <button class="btn btn-primary" id="ap-check-btn">Continue</button>
    <div id="ap-rest" style="margin-top:18px;"></div>
  `);
  document.getElementById('ap-check-btn').addEventListener('click', async () => {
    const phone = document.getElementById('ap-phone').value.trim();
    const msg = document.getElementById('add-patient-msg');
    if (!phone) { msg.innerHTML = '<div class="form-msg err">Enter a phone number first.</div>'; return; }
    try {
      const res = await api('/patients/check-phone/' + encodeURIComponent(phone));
      if (res.exists) {
        msg.innerHTML = `<div class="form-msg ok">A patient with this number already exists: <b>${esc(res.patient.name)}</b> (${esc(res.patient.patient_code)}).</div>`;
        document.getElementById('ap-rest').innerHTML = `
          <button class="btn btn-primary btn-block" id="ap-open-existing">Open existing profile & continue</button>`;
        document.getElementById('ap-open-existing').addEventListener('click', () => { closeModal(); openPatientProfile(res.patient.id); });
      } else {
        renderNewPatientForm(phone);
      }
    } catch (err) { msg.innerHTML = `<div class="form-msg err">${esc(err.message)}</div>`; }
  });
}

function renderNewPatientForm(phone) {
  document.getElementById('ap-rest').innerHTML = `
    <hr class="divider">
    <p class="small muted">No existing patient with this number — create a new profile.</p>
    <form id="new-patient-form">
      <div class="field-row">
        <div class="field"><label>Full name</label><input type="text" name="name" required></div>
        <div class="field"><label>Email</label><input type="email" name="email"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Date of birth</label><input type="date" name="dob"></div>
        <div class="field"><label>Gender</label>
          <select name="gender"><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select>
        </div>
      </div>
      <div class="field"><label>Address</label><input type="text" name="address"></div>
      <div class="field-row">
        <div class="field"><label>Medical history</label><textarea name="medical_history" placeholder="Diabetes, heart conditions, etc."></textarea></div>
        <div class="field"><label>Allergies</label><textarea name="allergies" placeholder="Penicillin, latex, etc."></textarea></div>
      </div>
      <button class="btn btn-primary btn-block" type="submit">Create Patient</button>
    </form>`;
  document.getElementById('new-patient-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    body.phone = phone;
    try {
      const res = await api('/patients', { method: 'POST', body: JSON.stringify(body) });
      closeModal();
      openPatientProfile(res.id);
    } catch (err) {
      document.getElementById('add-patient-msg').innerHTML = `<div class="form-msg err">${esc(err.message)}</div>`;
    }
  });
}

// ---------- Patient profile ----------
async function openPatientProfile(patientId) {
  const main = document.getElementById('main-content');
  main.innerHTML = '<p class="muted">Loading patient…</p>';
  const data = await api('/patients/' + patientId);
  const p = data.patient;

  main.innerHTML = `
    <div class="topline">
      <div>
        <a href="#" id="back-to-patients" class="small muted">&larr; Back to patients</a>
        <h1 style="margin-top:6px;">${esc(p.name)}</h1>
        <p>${esc(p.patient_code)} · ${esc(p.phone)} ${p.email ? '· ' + esc(p.email) : ''}</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-outline" id="pp-edit-btn">Edit Info</button>
        <button class="btn btn-primary" id="pp-new-treatment-btn">+ New Treatment</button>
      </div>
    </div>

    <div class="tabs">
      <button class="tab-btn active" data-tab="info">Info</button>
      <button class="tab-btn" data-tab="appts">Appointments (${data.appointments.length})</button>
      <button class="tab-btn" data-tab="treatments">Treatments (${data.treatments.length})</button>
      <button class="tab-btn" data-tab="chart">Dental Chart</button>
      <button class="tab-btn" data-tab="rx">Prescriptions (${data.prescriptions.length})</button>
      <button class="tab-btn" data-tab="billing">Billing</button>
      <button class="tab-btn" data-tab="docs">Documents (${data.documents.length})</button>
    </div>

    <div class="tab-pane active" data-pane="info">
      <div class="profile-grid">
        <div class="profile-side">
          <div class="card-mini"><h4>Date of birth</h4>${fmtDate(p.dob)}</div>
          <div class="card-mini"><h4>Gender</h4>${esc(p.gender || '—')}</div>
          <div class="card-mini"><h4>Address</h4>${esc(p.address || '—')}</div>
        </div>
        <div>
          <div class="panel"><h3>Medical history</h3><p>${esc(p.medical_history || 'Nothing on file.')}</p></div>
          <div class="panel"><h3>Allergies</h3><p>${esc(p.allergies || 'None recorded.')}</p></div>
          <div class="panel"><h3>Notes</h3><p>${esc(p.notes || 'No additional notes.')}</p></div>
        </div>
      </div>
    </div>

    <div class="tab-pane" data-pane="appts">
      <div class="panel">
        <table><thead><tr><th>Date</th><th>Time</th><th>Dentist</th><th>Service</th><th>Status</th></tr></thead>
        <tbody>${data.appointments.length ? data.appointments.map(a => `
          <tr><td>${fmtDate(a.date)}</td><td>${a.time}</td><td>${esc(a.dentist_name || 'Unassigned')}</td>
          <td>${esc(a.service_name || '—')}</td><td>${pill(a.status)}</td></tr>`).join('')
      : '<tr class="empty-row"><td colspan="5">No appointments yet.</td></tr>'}</tbody></table>
      </div>
    </div>

    <div class="tab-pane" data-pane="treatments">
      <div class="panel">
        ${data.treatments.length ? data.treatments.map(t => `
          <div style="border-bottom:1px solid var(--line);padding:12px 0;">
            <div class="flex-between"><b>${fmtDate(t.created_at)}</b><span class="small muted">${esc(t.dentist_name || '')}</span></div>
            <p class="small" style="margin:6px 0;"><b>Diagnosis:</b> ${esc(t.diagnosis || '—')}</p>
            <p class="small" style="margin:6px 0;"><b>Treatment:</b> ${esc(t.treatment_performed || '—')}</p>
            <p class="small muted" style="margin:6px 0;">Cost: ${fmtMoney(t.cost)} ${t.follow_up_date ? '· Follow-up: ' + fmtDate(t.follow_up_date) : ''}</p>
          </div>`).join('') : '<p class="muted">No treatment records yet.</p>'}
      </div>
    </div>

    <div class="tab-pane" data-pane="chart">
      <div class="panel" id="chart-panel"><p class="muted">Loading chart…</p></div>
    </div>

    <div class="tab-pane" data-pane="rx">
      <div class="panel">
        ${data.prescriptions.length ? data.prescriptions.map(rx => `
          <div style="border-bottom:1px solid var(--line);padding:12px 0;">
            <div class="flex-between"><b>${fmtDate(rx.prescription_date)}</b><span class="small muted">${esc(rx.dentist_name || '')}</span></div>
            <table style="margin-top:8px;"><thead><tr><th>Medicine</th><th>Dosage</th><th>Frequency</th><th>Duration</th></tr></thead>
            <tbody>${rx.items.map(it => `<tr><td>${esc(it.medicine_name)}</td><td>${esc(it.dosage || '—')}</td><td>${esc(it.frequency || '—')}</td><td>${esc(it.duration || '—')}</td></tr>`).join('')}</tbody></table>
          </div>`).join('') : '<p class="muted">No prescriptions yet.</p>'}
        <button class="btn btn-outline" id="pp-new-rx-btn" style="margin-top:14px;">+ New Prescription</button>
      </div>
    </div>

    <div class="tab-pane" data-pane="billing">
      <div class="panel">
        <div class="panel-head"><h3 class="mb-0">Invoices</h3><button class="btn btn-outline btn-sm" id="pp-new-invoice-btn">+ New Invoice</button></div>
        <table><thead><tr><th>Invoice #</th><th>Total</th><th>Paid</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>${data.invoices.length ? data.invoices.map(inv => `
          <tr class="clickable" data-inv="${inv.id}"><td>${esc(inv.invoice_number)}</td><td>${fmtMoney(inv.total)}</td>
          <td>${fmtMoney(inv.paid_amount)}</td><td>${pill(inv.status)}</td><td>${fmtDate(inv.created_at)}</td></tr>`).join('')
      : '<tr class="empty-row"><td colspan="5">No invoices yet.</td></tr>'}</tbody></table>
      </div>
    </div>

    <div class="tab-pane" data-pane="docs">
      <div class="panel">
        <div class="panel-head"><h3 class="mb-0">Uploaded files</h3>
          <label class="btn btn-outline btn-sm" style="cursor:pointer;">+ Upload File<input type="file" id="pp-upload-input" style="display:none;"></label>
        </div>
        <table><thead><tr><th>File</th><th>Type</th><th>Uploaded</th></tr></thead>
        <tbody>${data.documents.length ? data.documents.map(d => `
          <tr><td><a href="/uploads/${d.file_path}" target="_blank">${esc(d.file_name)}</a></td><td>${esc(d.file_type)}</td><td>${fmtDateTime(d.uploaded_at)}</td></tr>`).join('')
      : '<tr class="empty-row"><td colspan="3">No files uploaded yet.</td></tr>'}</tbody></table>
      </div>
    </div>
  `;

  main.querySelector('#back-to-patients').addEventListener('click', (e) => { e.preventDefault(); go('patients'); });
  main.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
    main.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    main.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    main.querySelector(`[data-pane="${btn.dataset.tab}"]`).classList.add('active');
    if (btn.dataset.tab === 'chart') loadDentalChart(patientId);
  }));

  main.querySelector('#pp-new-treatment-btn').addEventListener('click', () => openTreatmentModal(patientId, () => openPatientProfile(patientId)));
  main.querySelector('#pp-edit-btn').addEventListener('click', () => openEditPatientModal(p, () => openPatientProfile(patientId)));
  main.querySelector('#pp-new-rx-btn')?.addEventListener('click', () => openPrescriptionModal(patientId, () => openPatientProfile(patientId)));
  main.querySelector('#pp-new-invoice-btn')?.addEventListener('click', () => openInvoiceModal(patientId, () => openPatientProfile(patientId)));
  main.querySelectorAll('[data-inv]').forEach(tr => tr.addEventListener('click', () => openInvoiceDetail(tr.dataset.inv, () => openPatientProfile(patientId))));
  main.querySelector('#pp-upload-input')?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const fd = new FormData(); fd.append('file', file); fd.append('file_type', 'other');
    try { await apiUpload('/uploads/' + patientId, fd); openPatientProfile(patientId); }
    catch (err) { alert(err.message); }
  });
}

function openEditPatientModal(p, onSaved) {
  openModal(`
    <div class="modal-head"><h2 class="mb-0">Edit Patient Info</h2><button onclick="closeModal()">&times;</button></div>
    <div id="ep-msg"></div>
    <form id="edit-patient-form">
      <div class="field-row">
        <div class="field"><label>Full name</label><input type="text" name="name" value="${esc(p.name)}" required></div>
        <div class="field"><label>Email</label><input type="email" name="email" value="${esc(p.email || '')}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Date of birth</label><input type="date" name="dob" value="${p.dob || ''}"></div>
        <div class="field"><label>Gender</label>
          <select name="gender">
            <option value="" ${!p.gender ? 'selected' : ''}>Select</option>
            <option ${p.gender === 'Male' ? 'selected' : ''}>Male</option>
            <option ${p.gender === 'Female' ? 'selected' : ''}>Female</option>
            <option ${p.gender === 'Other' ? 'selected' : ''}>Other</option>
          </select>
        </div>
      </div>
      <div class="field"><label>Address</label><input type="text" name="address" value="${esc(p.address || '')}"></div>
      <div class="field-row">
        <div class="field"><label>Medical history</label><textarea name="medical_history">${esc(p.medical_history || '')}</textarea></div>
        <div class="field"><label>Allergies</label><textarea name="allergies">${esc(p.allergies || '')}</textarea></div>
      </div>
      <div class="field"><label>Notes</label><textarea name="notes">${esc(p.notes || '')}</textarea></div>
      <div class="modal-actions"><button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Changes</button></div>
    </form>`, true);
  document.getElementById('edit-patient-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    try { await api('/patients/' + p.id, { method: 'PUT', body: JSON.stringify(body) }); closeModal(); onSaved(); }
    catch (err) { document.getElementById('ep-msg').innerHTML = `<div class="form-msg err">${esc(err.message)}</div>`; }
  });
}

// ---------- Dental chart ----------
const TOOTH_CONDITIONS = ['healthy', 'cavity', 'filling', 'extraction', 'root_canal', 'crown', 'implant', 'missing', 'other'];
const UPPER_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

async function loadDentalChart(patientId) {
  const records = await api('/treatments/chart/' + patientId);
  const byTooth = Object.fromEntries(records.map(r => [r.tooth_number, r]));
  const panel = document.getElementById('chart-panel');
  const renderRow = (teeth) => teeth.map(n => {
    const rec = byTooth[n];
    const cond = rec ? rec.condition : null;
    return `<button class="tooth-btn ${cond ? 'cond-' + cond : ''}" data-tooth="${n}">
      <span>${n}</span><span style="font-size:.62rem;">${cond ? cond.replace('_', ' ') : ''}</span>
    </button>`;
  }).join('');

  panel.innerHTML = `
    <div class="flex-between"><h3 class="mb-0">Dental Chart (FDI numbering)</h3><span class="small muted">Click a tooth to record its condition</span></div>
    <p class="small muted" style="margin-top:6px;">Upper arch</p>
    <div class="tooth-chart">${renderRow(UPPER_TEETH)}</div>
    <p class="small muted" style="margin-top:6px;">Lower arch</p>
    <div class="tooth-chart lower">${renderRow(LOWER_TEETH)}</div>
    <div class="chart-legend">
      <span><span class="legend-dot" style="background:#f8e6e1;"></span>Cavity</span>
      <span><span class="legend-dot" style="background:#e3ebf5;"></span>Filling</span>
      <span><span class="legend-dot" style="background:#eee;"></span>Extraction</span>
      <span><span class="legend-dot" style="background:#f3e6f5;"></span>Root canal</span>
      <span><span class="legend-dot" style="background:#faf1de;"></span>Crown</span>
      <span><span class="legend-dot" style="background:#e5f0ea;"></span>Implant</span>
      <span><span class="legend-dot" style="background:#f5f5f5;"></span>Missing</span>
    </div>
  `;
  panel.querySelectorAll('.tooth-btn').forEach(btn => btn.addEventListener('click', () => {
    openToothModal(patientId, btn.dataset.tooth, () => loadDentalChart(patientId));
  }));
}

function openToothModal(patientId, toothNumber, onSaved) {
  openModal(`
    <div class="modal-head"><h2 class="mb-0">Tooth #${toothNumber}</h2><button onclick="closeModal()">&times;</button></div>
    <div id="tooth-msg"></div>
    <form id="tooth-form">
      <div class="field"><label>Condition</label>
        <select name="condition">${TOOTH_CONDITIONS.map(c => `<option value="${c}">${c.replace('_', ' ')}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Notes</label><textarea name="notes" placeholder="Details about this tooth"></textarea></div>
      <div class="modal-actions"><button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save</button></div>
    </form>`);
  document.getElementById('tooth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    body.patient_id = patientId; body.tooth_number = Number(toothNumber);
    try { await api('/treatments/tooth', { method: 'POST', body: JSON.stringify(body) }); closeModal(); onSaved(); }
    catch (err) { document.getElementById('tooth-msg').innerHTML = `<div class="form-msg err">${esc(err.message)}</div>`; }
  });
}
