VIEWS.activity = async function (main) {
  main.innerHTML = `
    <div class="topline"><div><h1>Activity Log</h1><p>Who did what, and when — the last 300 actions across the system.</p></div></div>
    <div class="panel">
      <table>
        <thead><tr><th>When</th><th>Staff member</th><th>Action</th><th>Details</th></tr></thead>
        <tbody id="log-tbody"><tr class="empty-row"><td colspan="4">Loading…</td></tr></tbody>
      </table>
    </div>
  `;
  const rows = await api('/dashboard/activity-log');
  document.getElementById('log-tbody').innerHTML = rows.length ? rows.map(r => {
    let details = '';
    try { const d = JSON.parse(r.details); details = Object.entries(d).map(([k, v]) => `${k}: ${v}`).join(', '); } catch (e) { details = r.details || ''; }
    return `<tr><td class="small">${fmtDateTime(r.created_at)}</td><td>${esc(r.user_name || 'System / Website')}</td>
      <td>${esc(r.action)}</td><td class="small muted">${esc(details)}</td></tr>`;
  }).join('') : '<tr class="empty-row"><td colspan="4">No activity recorded yet.</td></tr>';
};
