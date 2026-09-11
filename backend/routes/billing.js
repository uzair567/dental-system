const express = require('express');
const { db, uuid, nextInvoiceNumber, logActivity } = require('../db/init');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// POST /api/billing/invoices  { patient_id, treatment_id, items:[{description,amount}], discount }
router.post('/invoices', (req, res) => {
  const { patient_id, treatment_id, items, discount } = req.body;
  if (!patient_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Patient and at least one line item are required' });
  }
  const subtotal = items.reduce((s, it) => s + Number(it.amount || 0), 0);
  const disc = Number(discount || 0);
  const total = Math.max(subtotal - disc, 0);

  const id = uuid();
  const invoiceNumber = nextInvoiceNumber();
  db.prepare(`INSERT INTO invoices (id,invoice_number,patient_id,treatment_id,subtotal,discount,total,paid_amount,status)
    VALUES (?,?,?,?,?,?,?,0,'unpaid')`)
    .run(id, invoiceNumber, patient_id, treatment_id || null, subtotal, disc, total);

  const insertItem = db.prepare('INSERT INTO invoice_items (id,invoice_id,description,amount) VALUES (?,?,?,?)');
  for (const it of items) insertItem.run(uuid(), id, it.description, it.amount);

  logActivity(req.user.id, 'created invoice', 'invoice', id, { invoiceNumber, total });
  res.status(201).json({ id, invoice_number: invoiceNumber, total });
});

router.get('/invoices', (req, res) => {
  const { patient_id, status } = req.query;
  let sql = `SELECT i.*, p.name AS patient_name, p.phone AS patient_phone FROM invoices i
    LEFT JOIN patients p ON p.id=i.patient_id WHERE 1=1`;
  const params = [];
  if (patient_id) { sql += ' AND i.patient_id=?'; params.push(patient_id); }
  if (status) { sql += ' AND i.status=?'; params.push(status); }
  sql += ' ORDER BY i.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/invoices/:id', (req, res) => {
  const invoice = db.prepare(`SELECT i.*, p.name AS patient_name, p.phone AS patient_phone FROM invoices i
    LEFT JOIN patients p ON p.id=i.patient_id WHERE i.id=?`).get(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Not found' });
  invoice.items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id=?').all(req.params.id);
  invoice.payments = db.prepare('SELECT * FROM payments WHERE invoice_id=? ORDER BY paid_at DESC').all(req.params.id);
  res.json(invoice);
});

// POST /api/billing/payments  { invoice_id, amount, method }
router.post('/payments', (req, res) => {
  const { invoice_id, amount, method } = req.body;
  const invoice = db.prepare('SELECT * FROM invoices WHERE id=?').get(invoice_id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Amount must be greater than zero' });

  const id = uuid();
  db.prepare(`INSERT INTO payments (id,invoice_id,patient_id,amount,method,recorded_by) VALUES (?,?,?,?,?,?)`)
    .run(id, invoice_id, invoice.patient_id, amount, method || 'cash', req.user.id);

  const newPaid = invoice.paid_amount + Number(amount);
  const status = newPaid >= invoice.total ? 'paid' : (newPaid > 0 ? 'partial' : 'unpaid');
  db.prepare('UPDATE invoices SET paid_amount=?, status=? WHERE id=?').run(newPaid, status, invoice_id);

  logActivity(req.user.id, 'recorded payment', 'payment', id, { invoice_id, amount });
  res.status(201).json({ id, status, paid_amount: newPaid, outstanding: Math.max(invoice.total - newPaid, 0) });
});

module.exports = router;
