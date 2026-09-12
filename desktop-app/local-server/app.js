// Local embedded server — runs inside the Electron main process.
// Reuses the exact same route logic as the live backend, but reads/writes
// a LOCAL SQLite database on this computer, and serves the exact same
// web-dashboard UI so the offline experience is identical to the live one.
const express = require('express');
const cors = require('cors');
const path = require('path');

function createLocalApp({ dbPath, uploadsPath, webDashboardPath }) {
  process.env.DB_PATH = dbPath;
  process.env.UPLOAD_DIR = uploadsPath;

  // db/init.js reads DB_PATH from env — must be set before requiring it.
  const { db } = require('./db/init');

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use('/uploads', express.static(uploadsPath));

  app.get('/api/health', (req, res) => res.json({ ok: true, local: true, time: new Date().toISOString() }));

  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/patients', require('./routes/patients'));
  app.use('/api/leads', require('./routes/leads'));
  app.use('/api/services', require('./routes/services'));
  app.use('/api/appointments', require('./routes/appointments'));
  app.use('/api/treatments', require('./routes/treatments'));
  app.use('/api/prescriptions', require('./routes/prescriptions'));
  app.use('/api/billing', require('./routes/billing'));
  app.use('/api/dashboard', require('./routes/dashboard'));
  app.use('/api/website', require('./routes/website'));
  app.use('/api/uploads', require('./routes/uploads'));
  // Note: routes/sync.js is NOT mounted here — this local server IS the
  // offline device; syncing to the remote live server is handled separately
  // by desktop-app/sync-engine.js using this same local `db`.

  // Serve the real web-dashboard UI, unmodified — same look, same code.
  app.use(express.static(webDashboardPath));

  app.use((err, req, res, next) => {
    console.error('[local-server]', err);
    res.status(500).json({ error: 'Something went wrong on this computer' });
  });

  return { app, db };
}

module.exports = { createLocalApp };
