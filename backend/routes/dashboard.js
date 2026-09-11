const express = require('express');
const { db } = require('../db/init');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/overview', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + '-01';

  const todaysAppointments = db.prepare(`SELECT COUNT(*) c FROM appointments WHERE date=?`).get(today).c;
  const upcomingAppointments = db.prepare(`SELECT COUNT(*) c FROM appointments WHERE date>? AND status IN ('pending','confirmed')`).get(today).c;
  const newPatientsToday = db.prepare(`SELECT COUNT(*) c FROM patients WHERE date(created_at)=?`).get(today).c;
  const totalPatients = db.prepare(`SELECT COUNT(*) c FROM patients`).get().c;
  const newLeads = db.prepare(`SELECT COUNT(*) c FROM leads WHERE status='new'`).get().c;
  const pendingBookings = db.prepare(`SELECT COUNT(*) c FROM appointments WHERE status='pending'`).get().c;
  const completedTreatments = db.prepare(`SELECT COUNT(*) c FROM treatments WHERE date(created_at)>=?`).get(monthStart).c;
  const todaysRevenue = db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM payments WHERE date(paid_at)=?`).get(today).s;
  const outstanding = db.prepare(`SELECT COALESCE(SUM(total-paid_amount),0) s FROM invoices WHERE status!='paid'`).get().s;
  const unreadMessages = db.prepare(`SELECT COUNT(*) c FROM website_messages WHERE status='new'`).get().c;

  const todaySchedule = db.prepare(`SELECT a.*, p.name AS patient_name, u.name AS dentist_name, s.name AS service_name
    FROM appointments a LEFT JOIN patients p ON p.id=a.patient_id LEFT JOIN users u ON u.id=a.dentist_id
    LEFT JOIN services s ON s.id=a.service_id WHERE a.date=? ORDER BY a.time`).all(today);

  res.json({
    todaysAppointments, upcomingAppointments, newPatientsToday, totalPatients, newLeads,
    pendingBookings, completedTreatments, todaysRevenue, outstanding, unreadMessages, todaySchedule
  });
});

// GET /api/dashboard/reports?type=revenue|patients|appointments|leads&from=&to=
router.get('/reports', (req, res) => {
  const { type, from, to } = req.query;
  const start = from || '2000-01-01';
  const end = to || '2100-01-01';

  if (type === 'revenue') {
    return res.json(db.prepare(`SELECT date(paid_at) AS day, SUM(amount) AS total FROM payments
      WHERE date(paid_at) BETWEEN ? AND ? GROUP BY day ORDER BY day`).all(start, end));
  }
  if (type === 'patients') {
    return res.json(db.prepare(`SELECT date(created_at) AS day, COUNT(*) AS total FROM patients
      WHERE date(created_at) BETWEEN ? AND ? GROUP BY day ORDER BY day`).all(start, end));
  }
  if (type === 'appointments') {
    return res.json(db.prepare(`SELECT status, COUNT(*) AS total FROM appointments
      WHERE date BETWEEN ? AND ? GROUP BY status`).all(start, end));
  }
  if (type === 'leads') {
    return res.json(db.prepare(`SELECT status, COUNT(*) AS total FROM leads
      WHERE date(created_at) BETWEEN ? AND ? GROUP BY status`).all(start, end));
  }
  if (type === 'treatments') {
    return res.json(db.prepare(`SELECT treatment_performed, COUNT(*) AS total FROM treatments
      WHERE date(created_at) BETWEEN ? AND ? GROUP BY treatment_performed`).all(start, end));
  }
  res.status(400).json({ error: 'Unknown report type' });
});

// Activity log (audit trail)
router.get('/activity-log', (req, res) => {
  res.json(db.prepare(`SELECT al.*, u.name AS user_name FROM activity_log al
    LEFT JOIN users u ON u.id=al.user_id ORDER BY al.created_at DESC LIMIT 300`).all());
});

module.exports = router;
