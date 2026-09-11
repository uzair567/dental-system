const express = require('express');
const { db, uuid, nextPatientCode, logActivity } = require('../db/init');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/patients/check-phone/:phone  -> used BEFORE creating, per spec (phone entered first)
router.get('/check-phone/:phone', (req, res) => {
  const phone = req.params.phone.trim();
  const existing = db.prepare('SELECT * FROM patients WHERE phone = ?').get(phone);
  if (existing) return res.json({ exists: true, patient: existing });
  res.json({ exists: false });
});

// GET /api/patients  ?q=search&phone=&name=&id=
router.get('/', (req, res) => {
  const { q } = req.query;
  let rows;
  if (q) {
    const like = `%${q}%`;
    rows = db.prepare(`SELECT * FROM patients WHERE phone LIKE ? OR name LIKE ? OR email LIKE ? OR patient_code LIKE ?
      ORDER BY created_at DESC LIMIT 200`).all(like, like, like, like);
  } else {
    rows = db.prepare('SELECT * FROM patients ORDER BY created_at DESC LIMIT 200').all();
  }
  res.json(rows);
});

// GET /api/patients/:id  -> full profile incl. history
router.get('/:id', (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });

  const appointments = db.prepare(`SELECT a.*, s.name AS service_name, u.name AS dentist_name
    FROM appointments a LEFT JOIN services s ON s.id=a.service_id LEFT JOIN users u ON u.id=a.dentist_id
    WHERE a.patient_id=? ORDER BY a.date DESC, a.time DESC`).all(req.params.id);

  const treatments = db.prepare(`SELECT t.*, u.name AS dentist_name FROM treatments t
    LEFT JOIN users u ON u.id=t.dentist_id WHERE t.patient_id=? ORDER BY t.created_at DESC`).all(req.params.id);

  const toothRecords = db.prepare(`SELECT * FROM tooth_records WHERE patient_id=? ORDER BY recorded_at DESC`).all(req.params.id);

  const prescriptions = db.prepare(`SELECT p.*, u.name AS dentist_name FROM prescriptions p
    LEFT JOIN users u ON u.id=p.dentist_id WHERE p.patient_id=? ORDER BY p.created_at DESC`).all(req.params.id);
  for (const p of prescriptions) {
    p.items = db.prepare('SELECT * FROM prescription_items WHERE prescription_id=?').all(p.id);
  }

  const invoices = db.prepare('SELECT * FROM invoices WHERE patient_id=? ORDER BY created_at DESC').all(req.params.id);
  const payments = db.prepare('SELECT * FROM payments WHERE patient_id=? ORDER BY paid_at DESC').all(req.params.id);
  const documents = db.prepare('SELECT * FROM patient_documents WHERE patient_id=? ORDER BY uploaded_at DESC').all(req.params.id);

  res.json({ patient, appointments, treatments, toothRecords, prescriptions, invoices, payments, documents });
});

// POST /api/patients  -> create new (phone must not already exist; check-phone should be called first)
router.post('/', (req, res) => {
  const { phone, name, email, address, dob, gender, medical_history, allergies, notes } = req.body;
  if (!phone || !name) return res.status(400).json({ error: 'Phone and name are required' });

  const existing = db.prepare('SELECT id FROM patients WHERE phone = ?').get(phone.trim());
  if (existing) return res.status(409).json({ error: 'A patient with this phone number already exists', patientId: existing.id });

  const id = uuid();
  const code = nextPatientCode();
  db.prepare(`INSERT INTO patients (id,patient_code,phone,name,email,address,dob,gender,medical_history,allergies,notes,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, code, phone.trim(), name, email || null, address || null, dob || null, gender || null,
      medical_history || null, allergies || null, notes || null, req.user.id);

  logActivity(req.user.id, 'created patient', 'patient', id, { name, phone });
  res.status(201).json({ id, patient_code: code });
});

// PUT /api/patients/:id
router.put('/:id', (req, res) => {
  const { name, email, address, dob, gender, medical_history, allergies, notes } = req.body;
  db.prepare(`UPDATE patients SET name=COALESCE(?,name), email=COALESCE(?,email), address=COALESCE(?,address),
    dob=COALESCE(?,dob), gender=COALESCE(?,gender), medical_history=COALESCE(?,medical_history),
    allergies=COALESCE(?,allergies), notes=COALESCE(?,notes), updated_at=datetime('now') WHERE id=?`)
    .run(name, email, address, dob, gender, medical_history, allergies, notes, req.params.id);
  logActivity(req.user.id, 'updated patient', 'patient', req.params.id, req.body);
  res.json({ ok: true });
});

module.exports = router;
