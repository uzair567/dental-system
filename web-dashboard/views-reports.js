VIEWS.reports = async function (main) {
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 86400000);
  const from = monthAgo.toISOString().slice(0, 10);
  const to = today.toISOString().slice(0, 10);

  main.innerHTML = `
    <div class="topline"><div><h1>Reports</h1><p>Last 30 days by default — adjust the range below.</p></div></div>
    <div class="panel">
      <div class="toolbar">
        <label class="small muted">From <input type="date" id="rep-from" value="${from}"></label>
        <label class="small muted">To <input type="date" id="rep-to" value="${to}"></label>
        <button class="btn btn-outline btn-sm" id="rep-refresh">Refresh</button>
      </div>
    </div>
    <div class="panel"><h3>Revenue by day</h3><div id="rep-revenue"></div></div>
    <div class="panel"><h3>New patients by day</h3><div id="rep-patients"></div></div>
    <div class="field-row" style="gap:22px;">
      <div class="panel"><h3>Appointments by status</h3><div id="rep-appts"></div></div>
      <div class="panel"><h3>Leads by status</h3><div id="rep-leads"></div></div>
    </div>
  `;

  function barChart(container, data, labelKey, valueKey, formatter) {
    if (!data.length) { container.innerHTML = '<p class="muted small">No data in this range.</p>'; return; }
    const fmt = formatter || (v => v);
    const max = Math.max(...data.map(d => Number(d[valueKey]) || 0), 1);
    container.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;">` + data.map(d => `
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="small muted" style="width:110px;flex-shrink:0;text-transform:capitalize;">${esc(String(d[labelKey]))}</span>
        <div style="flex:1;background:#eef0eb;border-radius:4px;overflow:hidden;height:18px;">
          <div style="width:${(Number(d[valueKey]) / max * 100).toFixed(0)}%;background:var(--pine);height:100%;"></div>
        </div>
        <span class="small" style="width:90px;text-align:right;">${esc(String(fmt(d[valueKey])))}</span>
      </div>`).join('') + `</div>`;
  }

  async function load() {
    const from = document.getElementById('rep-from').value;
    const to = document.getElementById('rep-to').value;
    const [revenue, patients, appts, leads] = await Promise.all([
      api(`/dashboard/reports?type=revenue&from=${from}&to=${to}`),
      api(`/dashboard/reports?type=patients&from=${from}&to=${to}`),
      api(`/dashboard/reports?type=appointments&from=${from}&to=${to}`),
      api(`/dashboard/reports?type=leads&from=${from}&to=${to}`),
    ]);
    barChart(document.getElementById('rep-revenue'), revenue, 'day', 'total', v => 'Rs ' + Number(v).toLocaleString());
    barChart(document.getElementById('rep-patients'), patients, 'day', 'total');
    barChart(document.getElementById('rep-appts'), appts, 'status', 'total');
    barChart(document.getElementById('rep-leads'), leads, 'status', 'total');
  }
  await load();
  document.getElementById('rep-refresh').addEventListener('click', load);
};
