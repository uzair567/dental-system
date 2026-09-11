const express = require('express');
const { db, uuid, nextPatientCode, logActivity } = require('../db/init');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const { status } = req.query;
  let rows;
  if (status) rows = db.prepare('SELECT * FROM leads WHERE status=? ORDER BY created_at DESC').all(status);
  else rows = db.prepare('SELECT * FROM leads ORDER BY created_at DESC').all();
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id=?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  lead.activities = db.prepare('SELECT * FROM lead_activities WHERE lead_id=? ORDER BY created_at DESC').all(req.params.id);
  res.json(lead);
});

router.post('/', (req, res) => {
  const { name, phone, email, source, interested_service, notes, follow_up_date, assigned_to } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const id = uuid();
  db.prepare(`INSERT INTO leads (id,name,phone,email,source,interested_service,notes,follow_up_date,assigned_to)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, name, phone || null, email || null, source || 'manual', interested_service || null, notes || null,
      follow_up_date || null, assigned_to || null);
  logActivity(req.user.id, 'created lead', 'lead', id, { name, source });
  res.status(201).json({ id });
});

router.put('/:id', (req, res) => {
  const { status, notes, follow_up_date, assigned_to } = req.body;
  db.prepare(`UPDATE leads SET status=COALESCE(?,status), notes=COALESCE(?,notes),
    follow_up_date=COALESCE(?,follow_up_date), assigned_to=COALESCE(?,assigned_to), updated_at=datetime('now')
    WHERE id=?`).run(status, notes, follow_up_date, assigned_to, req.params.id);
  logActivity(req.user.id, 'updated lead', 'lead', req.params.id, req.body);
  res.json({ ok: true });
});

router.post('/:id/activity', (req, res) => {
  const { note } = req.body;
  const id = uuid();
  db.prepare('INSERT INTO lead_activities (id,lead_id,note,created_by) VALUES (?,?,?,?)')
    .run(id, req.params.id, note, req.user.id);
  res.status(201).json({ id });
});

// Convert a lead into a full patient record
router.post('/:id/convert', (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id=?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  if (!lead.phone) return res.status(400).json({ error: 'Lead has no phone number — required to create a patient' });

  let patient = db.prepare('SELECT * FROM patients WHERE phone=?').get(lead.phone);
  if (!patient) {
    const id = uuid();
    const code = nextPatientCode();
    db.prepare(`INSERT INTO patients (id,patient_code,phone,name,email,created_by) VALUES (?,?,?,?,?,?)`)
      .run(id, code, lead.phone, lead.name, lead.email || null, req.user.id);
    patient = { id, patient_code: code };
  }
  db.prepare(`UPDATE leads SET status='converted', converted_patient_id=?, updated_at=datetime('now') WHERE id=?`)
    .run(patient.id, req.params.id);
  logActivity(req.user.id, 'converted lead to patient', 'lead', req.params.id, { patient_id: patient.id });
  res.json({ patientId: patient.id });
});

module.exports = router;
