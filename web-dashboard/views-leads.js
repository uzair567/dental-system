VIEWS.leads = async function (main) {
  main.innerHTML = `
    <div class="topline">
      <div><h1>Leads</h1><p>Enquiries from the website, phone, and walk-ins.</p></div>
      <button class="btn btn-primary" id="add-lead-btn">+ Add Lead</button>
    </div>
    <div class="panel">
      <div class="toolbar">
        <select id="lead-status-filter">
          <option value="">All statuses</option>
          <option value="new">New</option><option value="contacted">Contacted</option>
          <option value="follow_up">Follow-up</option><option value="converted">Converted</option><option value="lost">Lost</option>
        </select>
      </div>
      <table>
        <thead><tr><th>Name</th><th>Phone</th><th>Source</th><th>Interested in</th><th>Status</th><th>Follow-up</th><th></th></tr></thead>
        <tbody id="leads-tbody"><tr class="empty-row"><td colspan="7">Loading…</td></tr></tbody>
      </table>
    </div>
  `;

  async function load() {
    const status = document.getElementById('lead-status-filter').value;
    const rows = await api('/leads' + (status ? '?status=' + status : ''));
    document.getElementById('leads-tbody').innerHTML = rows.length ? rows.map(l => `
      <tr>
        <td>${esc(l.name)}</td><td>${esc(l.phone || '—')}</td><td>${esc((l.source || '').replace('_', ' '))}</td>
        <td>${esc(l.interested_service || '—')}</td><td>${pill(l.status)}</td><td>${l.follow_up_date ? fmtDate(l.follow_up_date) : '—'}</td>
        <td><button class="btn btn-outline btn-sm" data-lead="${l.id}">Manage</button></td>
      </tr>`).join('') : '<tr class="empty-row"><td colspan="7">No leads found.</td></tr>';
    document.querySelectorAll('[data-lead]').forEach(b => b.addEventListener('click', () => openLeadModal(b.dataset.lead, load)));
  }
  await load();
  document.getElementById('lead-status-filter').addEventListener('change', load);
  document.getElementById('add-lead-btn').addEventListener('click', () => openNewLeadModal(load));
};

function openNewLeadModal(onSaved) {
  openModal(`
    <div class="modal-head"><h2 class="mb-0">Add Lead</h2><button onclick="closeModal()">&times;</button></div>
    <div id="nl-msg"></div>
    <form id="new-lead-form">
      <div class="field-row">
        <div class="field"><label>Name</label><input type="text" name="name" required></div>
        <div class="field"><label>Phone</label><input type="tel" name="phone"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Email</label><input type="email" name="email"></div>
        <div class="field"><label>Source</label>
          <select name="source"><option value="phone">Phone</option><option value="whatsapp">WhatsApp</option>
            <option value="walk_in">Walk-in</option><option value="referral">Referral</option><option value="manual">Other</option></select>
        </div>
      </div>
      <div class="field"><label>Interested service</label><input type="text" name="interested_service"></div>
      <div class="field"><label>Notes</label><textarea name="notes"></textarea></div>
      <div class="modal-actions"><button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Lead</button></div>
    </form>`);
  document.getElementById('new-lead-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    try { await api('/leads', { method: 'POST', body: JSON.stringify(body) }); closeModal(); onSaved(); }
    catch (err) { document.getElementById('nl-msg').innerHTML = `<div class="form-msg err">${esc(err.message)}</div>`; }
  });
}

async function openLeadModal(leadId, onSaved) {
  const lead = await api('/leads/' + leadId);
  openModal(`
    <div class="modal-head"><h2 class="mb-0">${esc(lead.name)}</h2><button onclick="closeModal()">&times;</button></div>
    <p class="small muted">${esc(lead.phone || '')} ${lead.email ? '· ' + esc(lead.email) : ''} · Source: ${esc((lead.source || '').replace('_', ' '))}</p>
    <div id="lm-msg"></div>
    <div class="field-row">
      <div class="field"><label>Status</label>
        <select id="lead-status">
          ${['new', 'contacted', 'follow_up', 'converted', 'lost'].map(s => `<option value="${s}" ${lead.status === s ? 'selected' : ''}>${s.replace('_', ' ')}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Follow-up date</label><input type="date" id="lead-followup" value="${lead.follow_up_date || ''}"></div>
    </div>
    <div class="field"><label>Add a note</label><textarea id="lead-note" placeholder="Call notes, next steps…"></textarea></div>
    <div class="modal-actions">
      <button class="btn btn-outline" id="lead-convert-btn">Convert to Patient</button>
      <button class="btn btn-primary" id="lead-save-btn">Save</button>
    </div>
    <hr class="divider">
    <h3>Activity history</h3>
    <div>${lead.activities.length ? lead.activities.map(a => `<p class="small" style="border-bottom:1px solid var(--line);padding:8px 0;">${esc(a.note)} <span class="muted">— ${fmtDateTime(a.created_at)}</span></p>`).join('') : '<p class="muted small">No activity yet.</p>'}</div>
  `, true);

  document.getElementById('lead-save-btn').addEventListener('click', async () => {
    try {
      const note = document.getElementById('lead-note').value;
      await api('/leads/' + leadId, {
        method: 'PUT', body: JSON.stringify({
          status: document.getElementById('lead-status').value,
          follow_up_date: document.getElementById('lead-followup').value || null
        })
      });
      if (note) await api(`/leads/${leadId}/activity`, { method: 'POST', body: JSON.stringify({ note }) });
      closeModal(); onSaved();
    } catch (err) { document.getElementById('lm-msg').innerHTML = `<div class="form-msg err">${esc(err.message)}</div>`; }
  });

  document.getElementById('lead-convert-btn').addEventListener('click', async () => {
    try {
      const res = await api(`/leads/${leadId}/convert`, { method: 'POST' });
      closeModal();
      go('patients').then(() => openPatientProfile(res.patientId));
    } catch (err) { document.getElementById('lm-msg').innerHTML = `<div class="form-msg err">${esc(err.message)}</div>`; }
  });
}
