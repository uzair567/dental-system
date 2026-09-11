const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db, uuid, logActivity } = require('../db/init');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuid()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB cap

// POST /api/uploads/:patientId  (multipart form: file, file_type, visit_id)
router.post('/:patientId', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { file_type, visit_id } = req.body;
  const id = uuid();
  db.prepare(`INSERT INTO patient_documents (id,patient_id,visit_id,file_name,file_path,file_type,uploaded_by)
    VALUES (?,?,?,?,?,?,?)`)
    .run(id, req.params.patientId, visit_id || null, req.file.originalname, req.file.filename,
      file_type || 'other', req.user.id);

  logActivity(req.user.id, 'uploaded file', 'patient_document', id, { patient_id: req.params.patientId, file_type });
  res.status(201).json({ id, file_name: req.file.originalname, url: `/uploads/${req.file.filename}` });
});

router.get('/:patientId', (req, res) => {
  res.json(db.prepare('SELECT * FROM patient_documents WHERE patient_id=? ORDER BY uploaded_at DESC').all(req.params.patientId));
});

module.exports = router;
