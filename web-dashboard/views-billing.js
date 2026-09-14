VIEWS.billing = async function (main) {
  main.innerHTML = `
    <div class="topline"><div><h1>Billing & Payments</h1><p>Invoices and payment records across all patients.</p></div></div>
    <div class="panel">
      <div class="toolbar">
        <select id="bill-status-filter">
          <option value="">All statuses</option><option value="unpaid">Unpaid</option>
          <option value="partial">Partial</option><option value="paid">Paid</option>
        </select>
      </div>
      <table>
        <thead><tr><th>Invoice #</th><th>Patient</th><th>Total</th><th>Paid</th><th>Outstanding</th><th>Status</th><th>Date</th></tr></thead>
        <tbody id="bill-tbody"><tr class="empty-row"><td colspan="7">Loading…</td></tr></tbody>
      </table>
    </div>
  `;
  async function load() {
    const status = document.getElementById('bill-status-filter').value;
    const rows = await api('/billing/invoices' + (status ? '?status=' + status : ''));
    document.getElementById('bill-tbody').innerHTML = rows.length ? rows.map(inv => `
      <tr class="clickable" data-inv="${inv.id}">
        <td>${esc(inv.invoice_number)}</td><td>${esc(inv.patient_name || '—')}</td><td>${fmtMoney(inv.total)}</td>
        <td>${fmtMoney(inv.paid_amount)}</td><td>${fmtMoney(inv.total - inv.paid_amount)}</td>
        <td>${pill(inv.status)}</td><td>${fmtDate(inv.created_at)}</td>
      </tr>`).join('') : '<tr class="empty-row"><td colspan="7">No invoices yet.</td></tr>';
    document.querySelectorAll('[data-inv]').forEach(tr => tr.addEventListener('click', () => openInvoiceDetail(tr.dataset.inv, load)));
  }
  await load();
  document.getElementById('bill-status-filter').addEventListener('change', load);
};

function openInvoiceModal(patientId, onSaved) {
  const items = [{ description: '', amount: '' }];
  function row(i, it) {
    return `<div class="field-row" style="grid-template-columns:2fr 1fr;gap:8px;margin-bottom:8px;" data-row="${i}">
      <input type="text" placeholder="Description" value="${esc(it.description)}" data-f="description">
      <input type="number" placeholder="Amount" value="${esc(it.amount)}" data-f="amount">
    </div>`;
  }
  openModal(`
    <div class="modal-head"><h2 class="mb-0">New Invoice</h2><button onclick="closeModal()">&times;</button></div>
    <div id="iv-msg"></div>
    <form id="invoice-form">
      <div id="iv-items">${items.map((it, i) => row(i, it)).join('')}</div>
      <button type="button" class="btn btn-outline btn-sm" id="iv-add-item">+ Add line item</button>
      <div class="field" style="margin-top:14px;"><label>Discount</label><input type="number" name="discount" value="0" min="0"></div>
      <div class="field" style="display:flex;align-items:center;gap:10px;margin-top:12px;padding:12px 14px;background:#f7f8f5;border:1px solid var(--line);border-radius:6px;">
        <input type="checkbox" id="iv-mark-paid" style="width:auto;transform:scale(1.15);">
        <label for="iv-mark-paid" style="margin:0;font-weight:600;cursor:pointer;">💰 Mark as paid now — skip recording payment separately</label>
      </div>
      <div class="field" id="iv-paid-method-field" style="display:none;">
        <label>Payment method</label>
        <select id="iv-paid-method"><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank Transfer</option><option value="other">Other</option></select>
      </div>
      <div class="modal-actions"><button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Create Invoice</button></div>
    </form>`, true);

  document.getElementById('iv-mark-paid').addEventListener('change', (e) => {
    document.getElementById('iv-paid-method-field').style.display = e.target.checked ? '' : 'none';
  });

  document.getElementById('iv-add-item').addEventListener('click', () => {
    items.push({ description: '', amount: '' });
    document.getElementById('iv-items').insertAdjacentHTML('beforeend', row(items.length - 1, items[items.length - 1]));
  });

  document.getElementById('invoice-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const rows = document.querySelectorAll('#iv-items [data-row]');
    const payloadItems = Array.from(rows).map(r => {
      const obj = {};
      r.querySelectorAll('input').forEach(inp => obj[inp.dataset.f] = inp.dataset.f === 'amount' ? Number(inp.value || 0) : inp.value);
      return obj;
    }).filter(it => it.description && it.amount > 0);
    if (!payloadItems.length) { document.getElementById('iv-msg').innerHTML = '<div class="form-msg err">Add at least one valid line item.</div>'; return; }
    const discount = Number(e.target.discount.value || 0);
    const markPaid = document.getElementById('iv-mark-paid').checked;
    const method = document.getElementById('iv-paid-method').value;
    try {
      const inv = await api('/billing/invoices', { method: 'POST', body: JSON.stringify({ patient_id: patientId, items: payloadItems, discount }) });
      if (markPaid && inv.total > 0) {
        await api('/billing/payments', { method: 'POST', body: JSON.stringify({ invoice_id: inv.id, amount: inv.total, method }) });
      }
      closeModal(); onSaved && onSaved();
    } catch (err) { document.getElementById('iv-msg').innerHTML = `<div class="form-msg err">${esc(err.message)}</div>`; }
  });
}

async function openInvoiceDetail(invoiceId, onSaved) {
  const inv = await api('/billing/invoices/' + invoiceId);
  const outstanding = inv.total - inv.paid_amount;
  openModal(`
    <div class="modal-head">
      <h2 class="mb-0">${esc(inv.invoice_number)}</h2>
      <div style="display:flex;gap:8px;align-items:center;">
        <button class="btn btn-outline btn-sm" id="inv-print-btn">🖨 Print Invoice</button>
        <button onclick="closeModal()" style="background:none;border:none;font-size:1.2rem;color:var(--muted);">&times;</button>
      </div>
    </div>
    <p class="small muted">${esc(inv.patient_name || '')} · ${esc(inv.patient_phone || '')}</p>
    <div class="summary-box" style="background:#f7f8f5;border-radius:6px;padding:12px 14px;margin-bottom:14px;font-size:.85rem;">
      <b>${esc(inv.patient_name || 'Patient')}</b> owes <b>${fmtMoney(outstanding)}</b> on this invoice
      (${fmtMoney(inv.total)} total, ${fmtMoney(inv.paid_amount)} already paid) — status: ${pill(inv.status)}
    </div>
    <table style="margin:14px 0;"><thead><tr><th>Description</th><th class="right">Amount</th></tr></thead>
    <tbody>${inv.items.map(it => `<tr><td>${esc(it.description)}</td><td class="right">${fmtMoney(it.amount)}</td></tr>`).join('')}</tbody></table>
    <div class="right small" style="line-height:2;">
      <div>Subtotal: ${fmtMoney(inv.subtotal)}</div>
      <div>Discount: ${fmtMoney(inv.discount)}</div>
      <div><b>Total: ${fmtMoney(inv.total)}</b></div>
      <div>Paid: ${fmtMoney(inv.paid_amount)}</div>
      <div style="color:var(--red);">Outstanding: ${fmtMoney(outstanding)}</div>
    </div>
    <hr class="divider">
    <div id="pay-msg"></div>
    ${inv.status !== 'paid' ? `
    <div class="field-row">
      <div class="field"><label>Record payment</label><input type="number" id="pay-amount" placeholder="Amount" min="1"></div>
      <div class="field"><label>Method</label>
        <select id="pay-method"><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank Transfer</option><option value="other">Other</option></select>
      </div>
    </div>
    <button class="btn btn-primary btn-block" id="pay-submit-btn">Record Payment</button>` : '<p class="small" style="color:var(--green);">This invoice is fully paid.</p>'}
    <h3 style="margin-top:20px;">Payment history</h3>
    ${inv.payments.length ? inv.payments.map(p => `<div class="small" style="border-bottom:1px solid var(--line);padding:6px 0;display:flex;justify-content:space-between;"><span>${fmtMoney(p.amount)} · ${esc(p.method)}</span><span class="muted">${fmtDateTime(p.paid_at)}</span></div>`).join('') : '<p class="small muted">No payments recorded yet.</p>'}
  `, true);

  document.getElementById('inv-print-btn').addEventListener('click', () => printInvoiceDocument(inv));

  document.getElementById('pay-submit-btn')?.addEventListener('click', async () => {
    const amount = Number(document.getElementById('pay-amount').value || 0);
    const method = document.getElementById('pay-method').value;
    if (amount <= 0) { document.getElementById('pay-msg').innerHTML = '<div class="form-msg err">Enter a valid amount.</div>'; return; }
    try {
      await api('/billing/payments', { method: 'POST', body: JSON.stringify({ invoice_id: invoiceId, amount, method }) });
      closeModal(); onSaved && onSaved();
    } catch (err) { document.getElementById('pay-msg').innerHTML = `<div class="form-msg err">${esc(err.message)}</div>`; }
  });
}

// ---------------- Formal printable invoice ----------------
function printInvoiceDocument(inv) {
  const outstanding = inv.total - inv.paid_amount;
  const statusClass = inv.status === 'paid' ? 'status-paid' : inv.status === 'partial' ? 'status-partial' : 'status-unpaid';
  const body = `
    <div class="party">
      <b>Bill to: ${esc(inv.patient_name || 'Patient')}</b>
      ${inv.patient_phone ? esc(inv.patient_phone) : ''}
      <div style="margin-top:6px;">Invoice #: <b>${esc(inv.invoice_number)}</b></div>
      <span class="status-stamp ${statusClass}">${esc((inv.status || '').toUpperCase())}</span>
    </div>
    <table>
      <thead><tr><th>Description</th><th class="right">Amount</th></tr></thead>
      <tbody>${inv.items.map(it => `<tr><td>${esc(it.description)}</td><td class="right">${fmtMoney(it.amount)}</td></tr>`).join('')}</tbody>
    </table>
    <div class="totals">
      <div><span>Subtotal</span><span>${fmtMoney(inv.subtotal)}</span></div>
      <div><span>Discount</span><span>-${fmtMoney(inv.discount)}</span></div>
      <div class="grand"><span>Total</span><span>${fmtMoney(inv.total)}</span></div>
      <div><span>Paid</span><span>${fmtMoney(inv.paid_amount)}</span></div>
      <div><span><b>Outstanding</b></span><span><b>${fmtMoney(outstanding)}</b></span></div>
    </div>
    ${inv.payments && inv.payments.length ? `
    <h3 style="margin-top:30px;font-size:.95rem;">Payment History</h3>
    <table>
      <thead><tr><th>Date</th><th>Method</th><th class="right">Amount</th></tr></thead>
      <tbody>${inv.payments.map(p => `<tr><td>${fmtDateTime(p.paid_at)}</td><td style="text-transform:capitalize;">${esc(p.method)}</td><td class="right">${fmtMoney(p.amount)}</td></tr>`).join('')}</tbody>
    </table>` : ''}
  `;
  printDocument('Invoice ' + inv.invoice_number, body);
}
