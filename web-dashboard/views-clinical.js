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
