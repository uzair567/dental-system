const express = require('express');
const { db, uuid, nextPatientCode, logActivity } = require('../db/init');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ---------- PUBLIC: website online booking ----------
// POST /api/appointments/book  (no auth — public website form)
router.post('/book', (req, res) => {
  const { name, phone, email, service_id, dentist_id, date, time, notes } = req.body;
  if (!name || !phone || !service_id || !date || !time) {
    return res.status(400).json({ error: 'Name, phone, service, date and time are required' });
  }

  // find or create a lightweight patient record from the booking
  let patient = db.prepare('SELECT * FROM patients WHERE phone=?').get(phone.trim());
  if (!patient) {
    const id = uuid();
    const code = nextPatientCode();
    db.prepare(`INSERT INTO patients (id,patient_code,phone,name,email) VALUES (?,?,?,?,?)`)
      .run(id, code, phone.trim(), name, email || null);
    patient = { id };
  }

  const service = db.prepare('SELECT * FROM services WHERE id=?').get(service_id);
  const id = uuid();
  db.prepare(`INSERT INTO appointments (id,patient_id,dentist_id,service_id,date,time,duration_minutes,status,source,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, patient.id, dentist_id || null, service_id, date, time,
      service ? service.duration_minutes : 30, 'pending', 'website', notes || null);

  logActivity(null, 'website booking received', 'appointment', id, { name, phone, date, time });
  res.status(201).json({
    id,
    confirmation: {
      name, phone, date, time,
      service: service ? service.name : null,
      status: 'pending',
      message: 'Your appointment request has been received. Our team will confirm it shortly.'
    }
  });
});

router.use(authenticate); // everything below requires login

// GET /api/appointments  ?date=&dentist_id=&status=&service_id=
router.get('/', (req, res) => {
  const { date, dentist_id, status, service_id, from, to } = req.query;
  let sql = `SELECT a.*, p.name AS patient_name, p.phone AS patient_phone, u.name AS dentist_name, s.name AS service_name
    FROM appointments a
    LEFT JOIN patients p ON p.id=a.patient_id
    LEFT JOIN users u ON u.id=a.dentist_id
    LEFT JOIN services s ON s.id=a.service_id
    WHERE 1=1`;
  const params = [];
  if (date) { sql += ' AND a.date=?'; params.push(date); }
  if (from) { sql += ' AND a.date>=?'; params.push(from); }
  if (to) { sql += ' AND a.date<=?'; params.push(to); }
  if (dentist_id) { sql += ' AND a.dentist_id=?'; params.push(dentist_id); }
  if (status) { sql += ' AND a.status=?'; params.push(status); }
  if (service_id) { sql += ' AND a.service_id=?'; params.push(service_id); }
  sql += ' ORDER BY a.date, a.time';
  res.json(db.prepare(sql).all(...params));
});

// POST /api/appointments  -> staff manually creates
router.post('/', (req, res) => {
  const { patient_id, dentist_id, service_id, date, time, duration_minutes, notes } = req.body;
  if (!patient_id || !date || !time) return res.status(400).json({ error: 'Patient, date and time are required' });
  const id = uuid();
  db.prepare(`INSERT INTO appointments (id,patient_id,dentist_id,service_id,date,time,duration_minutes,status,source,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, patient_id, dentist_id || null, service_id || null, date, time, duration_minutes || 30,
      'confirmed', 'dashboard', notes || null);
  logActivity(req.user.id, 'created appointment', 'appointment', id, { date, time });
  res.status(201).json({ id });
});

// PUT /api/appointments/:id  -> reschedule / change status / edit
router.put('/:id', (req, res) => {
  const { date, time, status, dentist_id, service_id, notes } = req.body;
  db.prepare(`UPDATE appointments SET date=COALESCE(?,date), time=COALESCE(?,time), status=COALESCE(?,status),
    dentist_id=COALESCE(?,dentist_id), service_id=COALESCE(?,service_id), notes=COALESCE(?,notes),
    updated_at=datetime('now') WHERE id=?`)
    .run(date, time, status, dentist_id, service_id, notes, req.params.id);
  logActivity(req.user.id, 'updated appointment', 'appointment', req.params.id, req.body);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare(`UPDATE appointments SET status='cancelled', updated_at=datetime('now') WHERE id=?`).run(req.params.id);
  logActivity(req.user.id, 'cancelled appointment', 'appointment', req.params.id, {});
  res.json({ ok: true });
});

module.exports = router;
