VIEWS.messages = async function (main) {
  main.innerHTML = `
    <div class="topline"><div><h1>Website Messages</h1><p>Contact form submissions from the public website.</p></div></div>
    <div class="panel">
      <div class="toolbar">
        <select id="msg-status-filter">
          <option value="">All</option><option value="new">New</option><option value="read">Read</option>
          <option value="replied">Replied</option><option value="archived">Archived</option>
        </select>
      </div>
      <table>
        <thead><tr><th>Name</th><th>Contact</th><th>Subject</th><th>Message</th><th>Received</th><th>Status</th><th></th></tr></thead>
        <tbody id="msg-tbody"><tr class="empty-row"><td colspan="7">Loading…</td></tr></tbody>
      </table>
    </div>
  `;
  async function load() {
    const status = document.getElementById('msg-status-filter').value;
    const rows = await api('/website/messages' + (status ? '?status=' + status : ''));
    document.getElementById('msg-tbody').innerHTML = rows.length ? rows.map(m => `
      <tr>
        <td>${esc(m.name)}</td><td class="small">${esc(m.phone || '')}${m.phone && m.email ? ' · ' : ''}${esc(m.email || '')}</td>
        <td>${esc(m.subject || '—')}</td><td class="small" style="max-width:260px;">${esc(m.message).slice(0, 90)}${m.message.length > 90 ? '…' : ''}</td>
        <td class="small">${fmtDateTime(m.created_at)}</td><td>${pill(m.status)}</td>
        <td>
          <select data-status="${m.id}" class="btn-sm" style="padding:5px;">
            ${['new', 'read', 'replied', 'archived'].map(s => `<option value="${s}" ${m.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </td>
      </tr>`).join('') : '<tr class="empty-row"><td colspan="7">No messages yet.</td></tr>';
    document.querySelectorAll('[data-status]').forEach(sel => sel.addEventListener('change', async () => {
      await api('/website/messages/' + sel.dataset.status, { method: 'PUT', body: JSON.stringify({ status: sel.value }) });
      load();
    }));
  }
  await load();
  document.getElementById('msg-status-filter').addEventListener('change', load);
};
