// A dependency-free, file-backed local "database" for offline use.
// Each table is a JSON array on disk. Records use the SAME id/columns the
// live server expects, so pushing them via /api/sync/push is a direct upsert
// with no ID remapping needed (the desktop app mints its own UUIDs).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TABLES = ['patients', 'leads', 'appointments', 'treatments', 'invoices'];

function uuid() { return crypto.randomUUID(); }

class LocalStore {
  constructor(dataDir) {
    this.dir = dataDir;
    fs.mkdirSync(this.dir, { recursive: true });
    this.files = Object.fromEntries(TABLES.map(t => [t, path.join(this.dir, `${t}.json`)]));
    for (const t of TABLES) {
      if (!fs.existsSync(this.files[t])) fs.writeFileSync(this.files[t], '[]');
    }
    this.metaFile = path.join(this.dir, 'meta.json');
    if (!fs.existsSync(this.metaFile)) fs.writeFileSync(this.metaFile, JSON.stringify({ deviceId: uuid(), lastPullAt: null }, null, 2));
  }

  _read(table) { return JSON.parse(fs.readFileSync(this.files[table], 'utf8')); }
  _write(table, rows) { fs.writeFileSync(this.files[table], JSON.stringify(rows, null, 2)); }

  getMeta() { return JSON.parse(fs.readFileSync(this.metaFile, 'utf8')); }
  setMeta(patch) {
    const m = { ...this.getMeta(), ...patch };
    fs.writeFileSync(this.metaFile, JSON.stringify(m, null, 2));
    return m;
  }

  list(table, filter) {
    const rows = this._read(table);
    return filter ? rows.filter(filter) : rows;
  }

  get(table, id) { return this._read(table).find(r => r.id === id) || null; }

  insert(table, record) {
    const rows = this._read(table);
    const now = new Date().toISOString();
    const full = { id: uuid(), created_at: now, updated_at: now, _synced: false, ...record };
    rows.push(full);
    this._write(table, rows);
    return full;
  }

  update(table, id, patch) {
    const rows = this._read(table);
    const idx = rows.findIndex(r => r.id === id);
    if (idx === -1) return null;
    rows[idx] = { ...rows[idx], ...patch, updated_at: new Date().toISOString(), _synced: false };
    this._write(table, rows);
    return rows[idx];
  }

  // records not yet pushed to the server
  unsynced(table) { return this.list(table, r => r._synced === false); }

  markSynced(table, ids) {
    const rows = this._read(table);
    for (const r of rows) if (ids.includes(r.id)) r._synced = true;
    this._write(table, rows);
  }

  // upsert incoming rows from the server (pull), never overwriting local unsynced edits
  upsertFromServer(table, rows) {
    const local = this._read(table);
    const byId = Object.fromEntries(local.map(r => [r.id, r]));
    for (const row of rows) {
      const existing = byId[row.id];
      if (existing && existing._synced === false) continue; // local edit not yet pushed — keep it, will resolve on next push
      byId[row.id] = { ...row, _synced: true };
    }
    this._write(table, Object.values(byId));
  }
}

module.exports = { LocalStore, TABLES };
