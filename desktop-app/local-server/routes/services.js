const express = require('express');
const { db, uuid, logActivity } = require('../db/init');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// Public: list active services (for website)
router.get('/public', (req, res) => {
  res.json(db.prepare('SELECT * FROM services WHERE active=1 ORDER BY name').all());
});
router.get('/public/:slug', (req, res) => {
  const svc = db.prepare('SELECT * FROM services WHERE slug=? AND active=1').get(req.params.slug);
  if (!svc) return res.status(404).json({ error: 'Service not found' });
  res.json(svc);
});

// Admin: full CRUD
router.get('/', authenticate, (req, res) => {
  res.json(db.prepare('SELECT * FROM services ORDER BY name').all());
});

router.post('/', authenticate, requireRole('super_admin'), (req, res) => {
  const { name, slug, description, duration_minutes, price } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const id = uuid();
  db.prepare(`INSERT INTO services (id,name,slug,description,duration_minutes,price) VALUES (?,?,?,?,?,?)`)
    .run(id, name, slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), description || null,
      duration_minutes || 30, price || 0);
  logActivity(req.user.id, 'created service', 'service', id, { name });
  res.status(201).json({ id });
});

router.put('/:id', authenticate, requireRole('super_admin'), (req, res) => {
  const { name, description, duration_minutes, price, active } = req.body;
  db.prepare(`UPDATE services SET name=COALESCE(?,name), description=COALESCE(?,description),
    duration_minutes=COALESCE(?,duration_minutes), price=COALESCE(?,price), active=COALESCE(?,active) WHERE id=?`)
    .run(name, description, duration_minutes, price, active, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
