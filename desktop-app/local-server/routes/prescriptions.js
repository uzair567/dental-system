const express = require('express');
const { db, uuid, logActivity } = require('../db/init');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// POST /api/prescriptions  { patient_id, treatment_id, items:[{medicine_name,dosage,frequency,duration,instructions}] }
router.post('/', (req, res) => {
  const { patient_id, treatment_id, items, uploaded_file } = req.body;
  if (!patient_id) return res.status(400).json({ error: 'Patient is required' });
  const id = uuid();
  db.prepare(`INSERT INTO prescriptions (id,patient_id,treatment_id,dentist_id,uploaded_file) VALUES (?,?,?,?,?)`)
    .run(id, patient_id, treatment_id || null, req.user.id, uploaded_file || null);

  if (Array.isArray(items)) {
    const insertItem = db.prepare(`INSERT INTO prescription_items (id,prescription_id,medicine_name,dosage,frequency,duration,instructions)
      VALUES (?,?,?,?,?,?,?)`);
    for (const it of items) {
      insertItem.run(uuid(), id, it.medicine_name, it.dosage || null, it.frequency || null, it.duration || null, it.instructions || null);
    }
  }
  logActivity(req.user.id, 'created prescription', 'prescription', id, { patient_id });
  res.status(201).json({ id });
});

router.get('/:id', (req, res) => {
  const p = db.prepare(`SELECT p.*, u.name AS dentist_name, pt.name AS patient_name FROM prescriptions p
    LEFT JOIN users u ON u.id=p.dentist_id LEFT JOIN patients pt ON pt.id=p.patient_id WHERE p.id=?`).get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  p.items = db.prepare('SELECT * FROM prescription_items WHERE prescription_id=?').all(req.params.id);
  res.json(p);
});

// Medicine catalogue (for autocomplete)
router.get('/medicines/list', (req, res) => {
  res.json(db.prepare('SELECT * FROM medicines ORDER BY name').all());
});
router.post('/medicines', (req, res) => {
  const { name, strength, notes } = req.body;
  const id = uuid();
  db.prepare('INSERT INTO medicines (id,name,strength,notes) VALUES (?,?,?,?)').run(id, name, strength || null, notes || null);
  res.status(201).json({ id });
});

module.exports = router;
