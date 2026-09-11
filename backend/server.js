require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

require('./db/init'); // ensures DB + schema + seed data exist

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

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
app.use('/api/sync', require('./routes/sync'));

// Serve the public website + admin dashboard as static files
app.use(express.static(path.join(__dirname, '..', 'public-website')));
app.use('/admin', express.static(path.join(__dirname, '..', 'web-dashboard')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\nDental Management System backend running on http://localhost:${PORT}`);
  console.log(`  Public website:  http://localhost:${PORT}/`);
  console.log(`  Admin dashboard: http://localhost:${PORT}/admin/`);
});
