const express = require('express');
const { db, logActivity } = require('../db/init');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Top-level tables: each has its own timestamp column and can be pushed/pulled independently.
const SYNCABLE = {
  patients: { cols: ['id', 'patient_code', 'phone', 'name', 'email', 'address', 'dob', 'gender', 'medical_history',
    'allergies', 'notes', 'created_by', 'created_at', 'updated_at'], timeCol: 'updated_at' },
  leads: { cols: ['id', 'name', 'phone', 'email', 'source', 'interested_service', 'status', 'notes', 'follow_up_date',
    'converted_patient_id', 'assigned_to', 'created_at', 'updated_at'], timeCol: 'updated_at' },
  appointments: { cols: ['id', 'patient_id', 'dentist_id', 'service_id', 'date', 'time', 'duration_minutes', 'status',
    'source', 'notes', 'created_at', 'updated_at'], timeCol: 'updated_at' },
  treatments: { cols: ['id', 'patient_id', 'appointment_id', 'dentist_id', 'diagnosis', 'complaint',
    'treatment_performed', 'treatment_plan', 'notes', 'follow_up_date', 'cost', 'created_at'], timeCol: 'created_at' },
  tooth_records: { cols: ['id', 'patient_id', 'treatment_id', 'tooth_number', 'condition', 'notes', 'recorded_by',
    'recorded_at'], timeCol: 'recorded_at' },
  prescriptions: { cols: ['id', 'patient_id', 'treatment_id', 'dentist_id', 'prescription_date', 'uploaded_file',
    'created_at'], timeCol: 'created_at', children: { table: 'prescription_items', fk: 'prescription_id',
    cols: ['id', 'prescription_id', 'medicine_name', 'dosage', 'frequency', 'duration', 'instructions'] } },
  invoices: { cols: ['id', 'invoice_number', 'patient_id', 'treatment_id', 'subtotal', 'discount', 'total',
    'paid_amount', 'status', 'created_at'], timeCol: 'created_at', children: { table: 'invoice_items', fk: 'invoice_id',
    cols: ['id', 'invoice_id', 'description', 'amount'] } },
  payments: { cols: ['id', 'invoice_id', 'patient_id', 'amount', 'method', 'paid_at', 'recorded_by'], timeCol: 'paid_at' },
  website_messages: { cols: ['id', 'name', 'phone', 'email', 'subject', 'message', 'status', 'created_at'],
    timeCol: 'created_at' },
};

function replaceChildren(child, parentId, rows) {
  db.prepare(`DELETE FROM ${child.table} WHERE ${child.fk}=?`).run(parentId);
  if (!rows || !rows.length) return;
  const placeholders = child.cols.map(c => `@${c}`).join(', ');
  const insert = db.prepare(`INSERT INTO ${child.table} (${child.cols.join(', ')}) VALUES (${placeholders})`);
  for (const row of rows) insert.run(Object.fromEntries(child.cols.map(c => [c, row[c] ?? null])));
}

// POST /api/sync/push  { deviceId, entities: { patients: [...], invoices: [{...,_items:[...]}], ... } }
// Client (desktop app) generates its own UUIDs offline, so we can safely upsert by id —
// last-write-wins on the table's time column, which is enough for a single-clinic, few-staff setup.
router.post('/push', (req, res) => {
  const { deviceId, entities } = req.body;
  if (!deviceId || !entities) return res.status(400).json({ error: 'deviceId and entities are required' });

  const results = {};
  const txn = db.transaction(() => {
    for (const [table, rows] of Object.entries(entities)) {
      const spec = SYNCABLE[table];
      if (!spec || !Array.isArray(rows)) continue;
      const { cols, timeCol, children } = spec;
      let count = 0;
      for (const row of rows) {
        const existing = db.prepare(`SELECT id, ${timeCol} AS t FROM ${table} WHERE id=?`).get(row.id);
        const incomingTime = row[timeCol] || new Date().toISOString();
        if (existing) {
          if (!(existing.t && incomingTime <= existing.t)) {
            const setCols = cols.filter(c => c !== 'id').map(c => `${c}=@${c}`).join(', ');
            db.prepare(`UPDATE ${table} SET ${setCols}, origin_device=@origin_device, synced_at=datetime('now') WHERE id=@id`)
              .run({ ...Object.fromEntries(cols.map(c => [c, row[c] ?? null])), id: row.id, origin_device: deviceId });
          }
        } else {
          const placeholders = cols.map(c => `@${c}`).join(', ');
          db.prepare(`INSERT INTO ${table} (${cols.join(', ')}, origin_device, synced_at)
            VALUES (${placeholders}, @origin_device, datetime('now'))`)
            .run({ ...Object.fromEntries(cols.map(c => [c, row[c] ?? null])), origin_device: deviceId });
        }
        if (children && Array.isArray(row._items)) {
          replaceChildren(children, row.id, row._items);
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
  for (const [table, spec] of Object.entries(SYNCABLE)) {
    const rows = db.prepare(`SELECT * FROM ${table} WHERE ${spec.timeCol} > ? ORDER BY ${spec.timeCol}`).all(since);
    if (spec.children) {
      for (const row of rows) {
        row._items = db.prepare(`SELECT * FROM ${spec.children.table} WHERE ${spec.children.fk}=?`).all(row.id);
      }
    }
    out[table] = rows;
  }
  // small reference tables always included in full (cheap, and desktop needs them for dropdowns)
  out.services = db.prepare('SELECT * FROM services WHERE active=1').all();
  out.users = db.prepare('SELECT id,name,role,specialty,active FROM users WHERE active=1').all();

  res.json({ since, pulledAt: new Date().toISOString(), data: out });
});

module.exports = router;
