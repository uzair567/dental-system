VIEWS.services = async function (main) {
  main.innerHTML = `
    <div class="topline">
      <div><h1>Services</h1><p>What shows up on the website and in booking forms.</p></div>
      <button class="btn btn-primary" id="add-service-btn">+ Add Service</button>
    </div>
    <div class="panel">
      <table>
        <thead><tr><th>Name</th><th>Duration</th><th>Price</th><th>Status</th><th></th></tr></thead>
        <tbody id="svc-tbody"><tr class="empty-row"><td colspan="5">Loading…</td></tr></tbody>
      </table>
    </div>
  `;
  async function load() {
    const rows = await api('/services');
    document.getElementById('svc-tbody').innerHTML = rows.map(s => `
      <tr>
        <td>${esc(s.name)}</td><td>${s.duration_minutes} min</td><td>${fmtMoney(s.price)}</td>
        <td>${s.active ? '<span class="pill-status pill-confirmed">active</span>' : '<span class="pill-status pill-cancelled">hidden</span>'}</td>
        <td><button class="btn btn-outline btn-sm" data-toggle="${s.id}" data-active="${s.active}">${s.active ? 'Hide' : 'Show'}</button></td>
      </tr>`).join('');
    document.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', async () => {
      await api('/services/' + b.dataset.toggle, { method: 'PUT', body: JSON.stringify({ active: b.dataset.active === '1' ? 0 : 1 }) });
      load();
    }));
  }
  await load();
  document.getElementById('add-service-btn').addEventListener('click', () => openNewServiceModal(load));
};

function openNewServiceModal(onSaved) {
  openModal(`
    <div class="modal-head"><h2 class="mb-0">Add Service</h2><button onclick="closeModal()">&times;</button></div>
    <div id="ns-msg"></div>
    <form id="new-service-form">
      <div class="field"><label>Name</label><input type="text" name="name" required></div>
      <div class="field"><label>Description</label><textarea name="description"></textarea></div>
      <div class="field-row">
        <div class="field"><label>Duration (minutes)</label><input type="number" name="duration_minutes" value="30" min="5"></div>
        <div class="field"><label>Price</label><input type="number" name="price" value="0" min="0"></div>
      </div>
      <div class="modal-actions"><button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Service</button></div>
    </form>`);
  document.getElementById('new-service-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    body.duration_minutes = Number(body.duration_minutes); body.price = Number(body.price);
    try { await api('/services', { method: 'POST', body: JSON.stringify(body) }); closeModal(); onSaved(); }
    catch (err) { document.getElementById('ns-msg').innerHTML = `<div class="form-msg err">${esc(err.message)}</div>`; }
  });
}
