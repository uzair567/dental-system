// Runs in the Electron main process. Keeps the LOCAL SQLite database (used by
// the embedded local-server) in agreement with the REMOTE live server's database,
// using the same /api/sync/push and /api/sync/pull endpoints the remote server exposes.
//
// This mirrors backend/routes/sync.js's SYNCABLE spec — keep the two in sync if the
// schema changes.
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

const bcrypt = require('bcryptjs');
const crypto = require('crypto');

async function isOnline(serverUrl) {
  if (!serverUrl) return false;
  try {
    const res = await fetch(serverUrl.replace(/\/$/, '') + '/api/health', { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch (e) { return false; }
}

async function login(serverUrl, email, password) {
  const res = await fetch(serverUrl.replace(/\/$/, '') + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Login failed');
  return res.json();
}

function collectChangedRows(localDb, since) {
  const entities = {};
  for (const [table, spec] of Object.entries(SYNCABLE)) {
    const rows = localDb.prepare(`SELECT * FROM ${table} WHERE ${spec.timeCol} > ? ORDER BY ${spec.timeCol}`).all(since);
    if (spec.children) {
      for (const row of rows) {
        row._items = localDb.prepare(`SELECT * FROM ${spec.children.table} WHERE ${spec.children.fk}=?`).all(row.id);
      }
    }
    if (rows.length) entities[table] = rows;
  }
  return entities;
}

function replaceChildren(localDb, child, parentId, rows) {
  localDb.prepare(`DELETE FROM ${child.table} WHERE ${child.fk}=?`).run(parentId);
  if (!rows || !rows.length) return;
  const placeholders = child.cols.map(c => `@${c}`).join(', ');
  const insert = localDb.prepare(`INSERT INTO ${child.table} (${child.cols.join(', ')}) VALUES (${placeholders})`);
  for (const row of rows) insert.run(Object.fromEntries(child.cols.map(c => [c, row[c] ?? null])));
}

function applyPulledRows(localDb, table, spec, rows) {
  const txn = localDb.transaction(() => {
    for (const row of rows) {
      const existing = localDb.prepare(`SELECT id, ${spec.timeCol} AS t FROM ${table} WHERE id=?`).get(row.id);
      const incomingTime = row[spec.timeCol];
      if (existing) {
        if (!(existing.t && incomingTime && incomingTime <= existing.t)) {
          const setCols = spec.cols.filter(c => c !== 'id').map(c => `${c}=@${c}`).join(', ');
          localDb.prepare(`UPDATE ${table} SET ${setCols} WHERE id=@id`)
            .run({ ...Object.fromEntries(spec.cols.map(c => [c, row[c] ?? null])), id: row.id });
        }
      } else {
        const placeholders = spec.cols.map(c => `@${c}`).join(', ');
        localDb.prepare(`INSERT INTO ${table} (${spec.cols.join(', ')}) VALUES (${placeholders})`)
          .run(Object.fromEntries(spec.cols.map(c => [c, row[c] ?? null])));
      }
      if (spec.children && Array.isArray(row._items)) {
        replaceChildren(localDb, spec.children, row.id, row._items);
      }
    }
  });
  txn();
}

function upsertReferenceTable(localDb, table, cols, rows, extraDefaults) {
  const txn = localDb.transaction(() => {
    for (const row of rows) {
      const existing = localDb.prepare(`SELECT id FROM ${table} WHERE id=?`).get(row.id);
      if (existing) {
        const setCols = cols.filter(c => c !== 'id').map(c => `${c}=@${c}`).join(', ');
        localDb.prepare(`UPDATE ${table} SET ${setCols} WHERE id=@id`).run(Object.fromEntries(cols.map(c => [c, row[c] ?? null])));
      } else {
        const allCols = extraDefaults ? [...cols, ...Object.keys(extraDefaults)] : cols;
        const placeholders = allCols.map(c => `@${c}`).join(', ');
        const values = Object.fromEntries(cols.map(c => [c, row[c] ?? null]));
        if (extraDefaults) for (const [k, v] of Object.entries(extraDefaults)) values[k] = typeof v === 'function' ? v(row) : v;
        localDb.prepare(`INSERT INTO ${table} (${allCols.join(', ')}) VALUES (${placeholders})`).run(values);
      }
    }
  });
  txn();
}

async function syncNow(localDb, serverUrl, authToken, meta, onLog) {
  const log = onLog || (() => {});
  if (!(await isOnline(serverUrl))) {
    log('Offline — changes are saved locally and will sync automatically once you\'re back online.');
    return { ok: false, reason: 'offline' };
  }
  if (!authToken) {
    log('Not signed in to the live server — sign in once to enable syncing.');
    return { ok: false, reason: 'unauthenticated' };
  }

  const base = serverUrl.replace(/\/$/, '');
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authToken };

  // 1) PUSH — anything changed locally since the last successful sync
  const entities = collectChangedRows(localDb, meta.lastSyncAt || '1970-01-01T00:00:00.000Z');
  if (Object.keys(entities).length) {
    const res = await fetch(base + '/api/sync/push', {
      method: 'POST', headers, body: JSON.stringify({ deviceId: meta.deviceId, entities })
    });
    if (!res.ok) { log('Push failed: ' + (await res.text())); return { ok: false, reason: 'push_failed' }; }
    const result = await res.json();
    const total = Object.values(result.synced || {}).reduce((a, b) => a + b, 0);
    log(total ? `Pushed ${total} record(s) to the server.` : 'Nothing new to push.');
  } else {
    log('Nothing new to push.');
  }

  // 2) PULL — anything changed on the server since the last successful sync
  const since = meta.lastSyncAt || '1970-01-01T00:00:00.000Z';
  const pullRes = await fetch(base + '/api/sync/pull?since=' + encodeURIComponent(since), { headers });
  if (!pullRes.ok) { log('Pull failed: ' + (await pullRes.text())); return { ok: false, reason: 'pull_failed' }; }
  const pulled = await pullRes.json();
  let pulledCount = 0;
  for (const [table, spec] of Object.entries(SYNCABLE)) {
    const rows = pulled.data[table];
    if (rows && rows.length) { applyPulledRows(localDb, table, spec, rows); pulledCount += rows.length; }
  }
  if (pulled.data.services?.length) upsertReferenceTable(localDb, 'services',
    ['id', 'name', 'slug', 'description', 'duration_minutes', 'price', 'active'], pulled.data.services);
  if (pulled.data.users?.length) upsertReferenceTable(localDb, 'users',
    ['id', 'name', 'role', 'specialty', 'active'], pulled.data.users, {
      email: (row) => `synced-${row.id}@no-login.local`,
      password_hash: () => bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10),
    });
  log(pulledCount ? `Pulled ${pulledCount} updated record(s) from the server.` : 'Already up to date with the server.');

  return { ok: true, newLastSyncAt: pulled.pulledAt };
}

module.exports = { isOnline, login, syncNow, SYNCABLE };
