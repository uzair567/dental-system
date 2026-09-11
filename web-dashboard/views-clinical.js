// ---------- New Treatment Record (with inline dental chart tagging) ----------
async function openTreatmentModal(patientId, onSaved, appointmentId) {
  let servicesOpts = '';
  try {
    const services = await api('/services');
    servicesOpts = services.map(s => `<option value="${s.price}">${esc(s.name)} (${fmtMoney(s.price)})</option>`).join('');
  } catch (e) { /* optional */ }

  const teethQueue = []; // { tooth_number, condition, notes }

  openModal(`
    <div class="modal-head"><h2 class="mb-0">New Treatment Record</h2><button onclick="closeModal()">&times;</button></div>
    <div id="tr-msg"></div>
    <form id="treatment-form">
      <div class="field"><label>Complaint</label><input type="text" name="complaint" placeholder="e.g. Pain in lower left molar"></div>
      <div class="field"><label>Diagnosis</label><input type="text" name="diagnosis" placeholder="e.g. Deep caries, tooth #36"></div>
      <div class="field-row">
        <div class="field"><label>Treatment performed</label><input type="text" name="treatment_performed" placeholder="e.g. Composite filling"></div>
        <div class="field"><label>Cost</label><input type="number" name="cost" min="0" step="1" placeholder="0" list="tr-price-hints"></div>
      </div>
      <datalist id="tr-price-hints">${servicesOpts}</datalist>
      <div class="field"><label>Treatment plan</label><textarea name="treatment_plan" placeholder="Next steps, if any"></textarea></div>
      <div class="field-row">
        <div class="field"><label>Notes</label><textarea name="notes"></textarea></div>
        <div class="field"><label>Follow-up date</label><input type="date" name="follow_up_date"></div>
      </div>

      <div class="field">
        <label>Tag affected teeth (optional)</label>
        <div class="field-row" style="align-items:end;">
          <div class="field mb-0"><input type="number" id="tr-tooth-num" min="11" max="48" placeholder="Tooth # (e.g. 36)"></div>
          <div class="field mb-0">
            <select id="tr-tooth-cond">
              <option value="cavity">Cavity</option><option value="filling">Filling</option>
              <option value="extraction">Extraction</option><option value="root_canal">Root canal</option>
              <option value="crown">Crown</option><option value="implant">Implant</option>
              <option value="missing">Missing</option><option value="other">Other</option>
            </select>
          </div>
        </div>
        <button type="button" class="btn btn-outline btn-sm" id="tr-add-tooth" style="margin-top:8px;">+ Add tooth entry</button>
        <div id="tr-teeth-list" class="small muted" style="margin-top:8px;"></div>
      </div>

      <div class="modal-actions"><button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Treatment Record</button></div>
    </form>`, true);

  function renderTeethList() {
    document.getElementById('tr-teeth-list').innerHTML = teethQueue.length
      ? 'Tagged: ' + teethQueue.map(t => `#${t.tooth_number} (${t.condition.replace('_', ' ')})`).join(', ')
      : 'No teeth tagged yet.';
  }
  document.getElementById('tr-add-tooth').addEventListener('click', () => {
    const num = document.getElementById('tr-tooth-num').value;
    const cond = document.getElementById('tr-tooth-cond').value;
    if (!num) return;
    teethQueue.push({ tooth_number: Number(num), condition: cond });
    document.getElementById('tr-tooth-num').value = '';
    renderTeethList();
  });

  document.getElementById('treatment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    body.patient_id = patientId;
    if (appointmentId) body.appointment_id = appointmentId;
    body.cost = Number(body.cost || 0);
    body.teeth = teethQueue;
    try {
      await api('/treatments', { method: 'POST', body: JSON.stringify(body) });
      closeModal(); onSaved && onSaved();
    } catch (err) { document.getElementById('tr-msg').innerHTML = `<div class="form-msg err">${esc(err.message)}</div>`; }
  });
}

// ---------- New Prescription ----------
function openPrescriptionModal(patientId, onSaved) {
  const items = [{ medicine_name: '', dosage: '', frequency: '', duration: '', instructions: '' }];

  function itemRow(i, it) {
    return `<div class="field-row" style="grid-template-columns:1.4fr 1fr 1fr 1fr;gap:8px;margin-bottom:8px;" data-row="${i}">
      <input type="text" placeholder="Medicine name" value="${esc(it.medicine_name)}" data-f="medicine_name">
      <input type="text" placeholder="Dosage" value="${esc(it.dosage)}" data-f="dosage">
      <input type="text" placeholder="Frequency" value="${esc(it.frequency)}" data-f="frequency">
      <input type="text" placeholder="Duration" value="${esc(it.duration)}" data-f="duration">
    </div>`;
  }

  openModal(`
    <div class="modal-head"><h2 class="mb-0">New Prescription</h2><button onclick="closeModal()">&times;</button></div>
    <div id="rx-msg"></div>
    <form id="rx-form">
      <div id="rx-items">${items.map((it, i) => itemRow(i, it)).join('')}</div>
      <button type="button" class="btn btn-outline btn-sm" id="rx-add-item">+ Add medicine</button>
      <div class="field" style="margin-top:14px;"><label>General instructions</label><textarea name="instructions" placeholder="e.g. Take after meals"></textarea></div>
      <div class="modal-actions"><button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Prescription</button></div>
    </form>`, true);

  document.getElementById('rx-add-item').addEventListener('click', () => {
    items.push({ medicine_name: '', dosage: '', frequency: '', duration: '', instructions: '' });
    document.getElementById('rx-items').insertAdjacentHTML('beforeend', itemRow(items.length - 1, items[items.length - 1]));
  });

  document.getElementById('rx-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const rows = document.querySelectorAll('#rx-items [data-row]');
    const generalInstructions = e.target.instructions.value;
    const payloadItems = Array.from(rows).map(row => {
      const obj = { instructions: generalInstructions };
      row.querySelectorAll('input').forEach(inp => obj[inp.dataset.f] = inp.value);
      return obj;
    }).filter(it => it.medicine_name);
    if (!payloadItems.length) { document.getElementById('rx-msg').innerHTML = '<div class="form-msg err">Add at least one medicine.</div>'; return; }
    try {
      await api('/prescriptions', { method: 'POST', body: JSON.stringify({ patient_id: patientId, items: payloadItems }) });
      closeModal(); onSaved && onSaved();
    } catch (err) { document.getElementById('rx-msg').innerHTML = `<div class="form-msg err">${esc(err.message)}</div>`; }
  });
}

// ---------------- Treatment record detail (clickable from patient profile) ----------------
async function openTreatmentDetailModal(treatmentId, patient) {
  const t = await api('/treatments/' + treatmentId);
  const teethLine = t.teeth && t.teeth.length
    ? t.teeth.map(tt => `#${tt.tooth_number} (${tt.condition.replace('_', ' ')})`).join(', ')
    : 'None tagged';

  openModal(`
    <div class="modal-head">
      <h2 class="mb-0">Treatment Record</h2>
      <div style="display:flex;gap:8px;align-items:center;">
        <button class="btn btn-outline btn-sm" id="tx-print-btn">🖨 Print</button>
        <button onclick="closeModal()" style="background:none;border:none;font-size:1.2rem;color:var(--muted);">&times;</button>
      </div>
    </div>
    <div class="summary-box" style="background:#f7f8f5;border-radius:6px;padding:12px 14px;margin-bottom:16px;font-size:.85rem;">
      <b>${fmtDate(t.created_at)}</b> — ${esc(t.diagnosis || 'No diagnosis recorded')} treated with
      <b>${esc(t.treatment_performed || 'no treatment noted')}</b>, cost ${fmtMoney(t.cost)}${t.dentist_name ? ' by ' + esc(t.dentist_name) : ''}.
    </div>
    <div class="field-row">
      <div><p class="small muted" style="margin-bottom:2px;">Complaint</p><p class="small">${esc(t.complaint || '—')}</p></div>
      <div><p class="small muted" style="margin-bottom:2px;">Diagnosis</p><p class="small">${esc(t.diagnosis || '—')}</p></div>
    </div>
    <div class="field-row">
      <div><p class="small muted" style="margin-bottom:2px;">Treatment performed</p><p class="small">${esc(t.treatment_performed || '—')}</p></div>
      <div><p class="small muted" style="margin-bottom:2px;">Treatment plan</p><p class="small">${esc(t.treatment_plan || '—')}</p></div>
    </div>
    <div class="field-row">
      <div><p class="small muted" style="margin-bottom:2px;">Cost</p><p class="small">${fmtMoney(t.cost)}</p></div>
      <div><p class="small muted" style="margin-bottom:2px;">Follow-up date</p><p class="small">${t.follow_up_date ? fmtDate(t.follow_up_date) : '—'}</p></div>
    </div>
    <div><p class="small muted" style="margin-bottom:2px;">Teeth involved</p><p class="small">${esc(teethLine)}</p></div>
    <div style="margin-top:10px;"><p class="small muted" style="margin-bottom:2px;">Notes</p><p class="small">${esc(t.notes || 'No additional notes.')}</p></div>
  `, true);

  document.getElementById('tx-print-btn').addEventListener('click', () => {
    const body = `
      <div class="party">
        <b>${esc(patient?.name || 'Patient')}</b>
        ${patient?.phone ? esc(patient.phone) : ''}
        <div style="margin-top:6px;">Visit date: <b>${fmtDate(t.created_at)}</b></div>
      </div>
      <div class="summary-box">${esc(t.diagnosis || 'No diagnosis recorded')} — treated with <b>${esc(t.treatment_performed || 'N/A')}</b>, cost ${fmtMoney(t.cost)}${t.dentist_name ? ' · Dentist: ' + esc(t.dentist_name) : ''}</div>
      <table>
        <tbody>
          <tr><td><b>Complaint</b></td><td>${esc(t.complaint || '—')}</td></tr>
          <tr><td><b>Diagnosis</b></td><td>${esc(t.diagnosis || '—')}</td></tr>
          <tr><td><b>Treatment performed</b></td><td>${esc(t.treatment_performed || '—')}</td></tr>
          <tr><td><b>Treatment plan</b></td><td>${esc(t.treatment_plan || '—')}</td></tr>
          <tr><td><b>Teeth involved</b></td><td>${esc(teethLine)}</td></tr>
          <tr><td><b>Follow-up date</b></td><td>${t.follow_up_date ? fmtDate(t.follow_up_date) : '—'}</td></tr>
          <tr><td><b>Notes</b></td><td>${esc(t.notes || '—')}</td></tr>
          <tr><td><b>Cost</b></td><td>${fmtMoney(t.cost)}</td></tr>
        </tbody>
      </table>
    `;
    printDocument('Treatment Record', body);
  });
}
