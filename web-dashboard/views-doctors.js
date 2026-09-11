VIEWS.doctors = async function (main) {
  main.innerHTML = `
    <div class="topline">
      <div><h1>Doctors & Staff</h1><p>Manage who has access to the dashboard and what they can see.</p></div>
      <button class="btn btn-primary" id="add-user-btn">+ Add User</button>
    </div>
    <div class="panel">
      <table>
        <thead><tr><th>Name</th><th>Role</th><th>Specialty</th><th>Email</th><th>Phone</th><th>Status</th><th></th></tr></thead>
        <tbody id="users-tbody"><tr class="empty-row"><td colspan="7">Loading…</td></tr></tbody>
      </table>
    </div>
  `;
  async function load() {
    const rows = await api('/auth/users');
    document.getElementById('users-tbody').innerHTML = rows.map(u => `
      <tr>
        <td>${esc(u.name)}</td><td><span class="badge-role">${u.role.replace('_', ' ')}</span></td>
        <td>${esc(u.specialty || '—')}</td><td>${esc(u.email)}</td><td>${esc(u.phone || '—')}</td>
        <td>${u.active ? '<span class="pill-status pill-confirmed">active</span>' : '<span class="pill-status pill-cancelled">inactive</span>'}</td>
        <td><button class="btn btn-outline btn-sm" data-toggle="${u.id}" data-active="${u.active}">${u.active ? 'Deactivate' : 'Activate'}</button></td>
      </tr>`).join('');
    document.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', async () => {
      await api('/auth/users/' + b.dataset.toggle, { method: 'PUT', body: JSON.stringify({ active: b.dataset.active === '1' ? 0 : 1 }) });
      load();
    }));
  }
  await load();
  document.getElementById('add-user-btn').addEventListener('click', () => openNewUserModal(load));
};

function openNewUserModal(onSaved) {
  openModal(`
    <div class="modal-head"><h2 class="mb-0">Add User</h2><button onclick="closeModal()">&times;</button></div>
    <div id="nu-msg"></div>
    <form id="new-user-form">
      <div class="field-row">
        <div class="field"><label>Full name</label><input type="text" name="name" required></div>
        <div class="field"><label>Role</label>
          <select name="role" id="nu-role">
            <option value="dentist">Dentist</option><option value="receptionist">Receptionist</option>
            <option value="staff">Staff</option><option value="super_admin">Super Admin</option>
          </select>
        </div>
      </div>
      <div class="field-row">
        <div class="field"><label>Email</label><input type="email" name="email" required></div>
        <div class="field"><label>Phone</label><input type="tel" name="phone"></div>
      </div>
      <div class="field" id="nu-specialty-field"><label>Specialty</label><input type="text" name="specialty" placeholder="e.g. Orthodontics"></div>
      <div class="field"><label>Temporary password</label><input type="text" name="password" required></div>
      <div class="modal-actions"><button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Create User</button></div>
    </form>`);
  document.getElementById('new-user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    try { await api('/auth/users', { method: 'POST', body: JSON.stringify(body) }); closeModal(); onSaved(); }
    catch (err) { document.getElementById('nu-msg').innerHTML = `<div class="form-msg err">${esc(err.message)}</div>`; }
  });
}
