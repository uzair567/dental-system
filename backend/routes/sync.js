const express = require('express');
const { db, logActivity } = require('../db/init');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Tables the desktop app is allowed to push/pull. Each must have: id, updated_at (or created_at),
// origin_device, synced_at columns as defined in schema.sql.
const SYNCABLE = {
  patients: ['id', 'patient_code', 'phone', 'name', 'email', 'address', 'dob', 'gender', 'medical_history',
    'allergies', 'notes', 'created_by', 'created_at', 'updated_at'],
  leads: ['id', 'name', 'phone', 'email', 'source', 'interested_service', 'status', 'notes', 'follow_up_date',
    'converted_patient_id', 'assigned_to', 'created_at', 'updated_at'],
  appointments: ['id', 'patient_id', 'dentist_id', 'service_id', 'date', 'time', 'duration_minutes', 'status',
    'source', 'notes', 'created_at', 'updated_at'],
  treatments: ['id', 'patient_id', 'appointment_id', 'dentist_id', 'diagnosis', 'complaint',
    'treatment_performed', 'treatment_plan', 'notes', 'follow_up_date', 'cost', 'created_at'],
  invoices: ['id', 'invoice_number', 'patient_id', 'treatment_id', 'subtotal', 'discount', 'total',
    'paid_amount', 'status', 'created_at'],
};

// POST /api/sync/push  { deviceId, entities: { patients: [...], appointments: [...], ... } }
// Client (Electron app) generates its own UUIDs offline, so we can safely upsert by id —
// last-write-wins on updated_at, which is enough for a single-clinic, few-staff setup.
router.post('/push', (req, res) => {
  const { deviceId, entities } = req.body;
  if (!deviceId || !entities) return res.status(400).json({ error: 'deviceId and entities are required' });

  const results = {};
  const txn = db.transaction(() => {
    for (const [table, rows] of Object.entries(entities)) {
      if (!SYNCABLE[table] || !Array.isArray(rows)) continue;
      const cols = SYNCABLE[table];
      let count = 0;
      for (const row of rows) {
        const existing = db.prepare(`SELECT id, updated_at, created_at FROM ${table} WHERE id=?`).get(row.id);
        const incomingTime = row.updated_at || row.created_at || new Date().toISOString();
        if (existing) {
          const existingTime = existing.updated_at || existing.created_at;
          if (existingTime && incomingTime <= existingTime) continue; // server copy is newer/equal, skip
          const setCols = cols.filter(c => c !== 'id').map(c => `${c}=@${c}`).join(', ');
          db.prepare(`UPDATE ${table} SET ${setCols}, origin_device=@origin_device, synced_at=datetime('now') WHERE id=@id`)
            .run({ ...row, origin_device: deviceId });
        } else {
          const placeholders = cols.map(c => `@${c}`).join(', ');
          db.prepare(`INSERT INTO ${table} (${cols.join(', ')}, origin_device, synced_at)
            VALUES (${placeholders}, @origin_device, datetime('now'))`)
            .run({ ...Object.fromEntries(cols.map(c => [c, row[c] ?? null])), origin_device: deviceId });
        }
        count++;
      }
      results[table] = count;
      logActivity(req.user.id, `synced ${table} from desktop`, table, null, { deviceId, count });
    }
  });
  txn();

  res.json({ ok: true, synced: results, syncedAt: new Date().toISOString() });
});

// GET /api/sync/pull?since=ISO_TIMESTAMP  -> everything changed on the server since that time,
// so the desktop app can catch up on records created via the website or the web dashboard.
router.get('/pull', (req, res) => {
  const since = req.query.since || '1970-01-01T00:00:00.000Z';
  const out = {};
  for (const table of Object.keys(SYNCABLE)) {
    const timeCol = SYNCABLE[table].includes('updated_at') ? 'updated_at' : 'created_at';
    out[table] = db.prepare(`SELECT * FROM ${table} WHERE ${timeCol} > ? ORDER BY ${timeCol}`).all(since);
  }
  // small reference tables always included in full (cheap, and desktop needs them for dropdowns)
  out.services = db.prepare('SELECT * FROM services WHERE active=1').all();
  out.users = db.prepare('SELECT id,name,role,specialty,active FROM users WHERE active=1').all();

  res.json({ since, pulledAt: new Date().toISOString(), data: out });
});

module.exports = router;
