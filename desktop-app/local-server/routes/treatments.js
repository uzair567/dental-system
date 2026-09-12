const express = require('express');
const { db, uuid, logActivity } = require('../db/init');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// POST /api/treatments  -> create a treatment record (+ optional tooth entries)
router.post('/', (req, res) => {
  const { patient_id, appointment_id, diagnosis, complaint, treatment_performed, treatment_plan,
    notes, follow_up_date, cost, teeth } = req.body;
  if (!patient_id) return res.status(400).json({ error: 'Patient is required' });

  const id = uuid();
  db.prepare(`INSERT INTO treatments (id,patient_id,appointment_id,dentist_id,diagnosis,complaint,
    treatment_performed,treatment_plan,notes,follow_up_date,cost)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, patient_id, appointment_id || null, req.user.id, diagnosis || null, complaint || null,
      treatment_performed || null, treatment_plan || null, notes || null, follow_up_date || null, cost || 0);

  // If this treatment came from a booked appointment, mark it completed
  if (appointment_id) {
    db.prepare(`UPDATE appointments SET status='completed', updated_at=datetime('now') WHERE id=?`).run(appointment_id);
  }

  if (Array.isArray(teeth)) {
    const insertTooth = db.prepare(`INSERT INTO tooth_records (id,patient_id,treatment_id,tooth_number,condition,notes,recorded_by)
      VALUES (?,?,?,?,?,?,?)`);
    for (const t of teeth) {
      insertTooth.run(uuid(), patient_id, id, t.tooth_number, t.condition, t.notes || null, req.user.id);
    }
  }

  logActivity(req.user.id, 'created treatment record', 'treatment', id, { patient_id });
  res.status(201).json({ id });
});

// GET /api/treatments/:id
router.get('/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM treatments WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  t.teeth = db.prepare('SELECT * FROM tooth_records WHERE treatment_id=?').all(req.params.id);
  res.json(t);
});

// GET /api/treatments/chart/:patientId -> latest condition per tooth (1-32, FDI-ish simplified 11-48)
router.get('/chart/:patientId', (req, res) => {
  const rows = db.prepare(`SELECT tooth_number, condition, notes, recorded_at FROM tooth_records
    WHERE patient_id=? ORDER BY recorded_at DESC`).all(req.params.patientId);
  const latestByTooth = {};
  for (const r of rows) {
    if (!latestByTooth[r.tooth_number]) latestByTooth[r.tooth_number] = r;
  }
  res.json(Object.values(latestByTooth));
});

// POST /api/treatments/tooth  -> add/update a single tooth entry outside a full treatment record
router.post('/tooth', (req, res) => {
  const { patient_id, tooth_number, condition, notes } = req.body;
  if (!patient_id || !tooth_number || !condition) return res.status(400).json({ error: 'Missing fields' });
  const id = uuid();
  db.prepare(`INSERT INTO tooth_records (id,patient_id,tooth_number,condition,notes,recorded_by) VALUES (?,?,?,?,?,?)`)
    .run(id, patient_id, tooth_number, condition, notes || null, req.user.id);
  logActivity(req.user.id, 'updated tooth record', 'tooth_record', id, { patient_id, tooth_number, condition });
  res.status(201).json({ id });
});

module.exports = router;
