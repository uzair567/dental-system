const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, uuid, logActivity } = require('../db/init');
const { authenticate, requireRole, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
  logActivity(user.id, 'logged in', 'user', user.id, {});
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, specialty: user.specialty }
  });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  const user = db.prepare('SELECT id,name,email,phone,role,specialty FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// ---- Staff / Doctor management (Super Admin only creates users) ----
// GET /api/auth/users
router.get('/users', authenticate, (req, res) => {
  const users = db.prepare(`SELECT id,name,email,phone,role,specialty,active,created_at FROM users ORDER BY created_at DESC`).all();
  res.json(users);
});

// POST /api/auth/users  (create dentist/staff/receptionist)
router.post('/users', authenticate, requireRole('super_admin'), (req, res) => {
  const { name, email, phone, password, role, specialty } = req.body;
  if (!name || !email || !password || !role) return res.status(400).json({ error: 'Missing required fields' });
  const id = uuid();
  try {
    db.prepare(`INSERT INTO users (id,name,email,phone,password_hash,role,specialty) VALUES (?,?,?,?,?,?,?)`)
      .run(id, name, email.toLowerCase().trim(), phone || null, bcrypt.hashSync(password, 10), role, specialty || null);
    logActivity(req.user.id, 'created user', 'user', id, { name, role });
    res.status(201).json({ id });
  } catch (e) {
    res.status(400).json({ error: 'Could not create user (email may already exist)' });
  }
});

// PUT /api/auth/users/:id
router.put('/users/:id', authenticate, requireRole('super_admin'), (req, res) => {
  const { name, phone, role, specialty, active } = req.body;
  db.prepare(`UPDATE users SET name=COALESCE(?,name), phone=COALESCE(?,phone), role=COALESCE(?,role),
    specialty=COALESCE(?,specialty), active=COALESCE(?,active), updated_at=datetime('now') WHERE id=?`)
    .run(name, phone, role, specialty, active, req.params.id);
  logActivity(req.user.id, 'updated user', 'user', req.params.id, req.body);
  res.json({ ok: true });
});

// Public list of dentists (for website "meet the doctors" + booking dropdown)
router.get('/dentists/public', (req, res) => {
  const dentists = db.prepare(`SELECT id,name,specialty FROM users WHERE role='dentist' AND active=1`).all();
  res.json(dentists);
});

module.exports = router;
