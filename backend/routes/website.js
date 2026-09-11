const express = require('express');
const { db, uuid, logActivity } = require('../db/init');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// PUBLIC: contact form submission
router.post('/contact', (req, res) => {
  const { name, phone, email, subject, message } = req.body;
  if (!name || !message) return res.status(400).json({ error: 'Name and message are required' });
  const id = uuid();
  db.prepare(`INSERT INTO website_messages (id,name,phone,email,subject,message) VALUES (?,?,?,?,?,?)`)
    .run(id, name, phone || null, email || null, subject || null, message);

  // also drop it into the CRM as a lead so it's followed up
  db.prepare(`INSERT INTO leads (id,name,phone,email,source,notes) VALUES (?,?,?,?,?,?)`)
    .run(uuid(), name, phone || null, email || null, 'contact_form', message);

  res.status(201).json({ id, message: 'Thanks for reaching out — our team will get back to you shortly.' });
});

// ADMIN: view / manage inbox
router.get('/messages', authenticate, (req, res) => {
  const { status } = req.query;
  let rows;
  if (status) rows = db.prepare('SELECT * FROM website_messages WHERE status=? ORDER BY created_at DESC').all(status);
  else rows = db.prepare('SELECT * FROM website_messages ORDER BY created_at DESC').all();
  res.json(rows);
});

router.put('/messages/:id', authenticate, (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE website_messages SET status=? WHERE id=?').run(status, req.params.id);
  logActivity(req.user.id, 'updated message status', 'website_message', req.params.id, { status });
  res.json({ ok: true });
});

module.exports = router;
