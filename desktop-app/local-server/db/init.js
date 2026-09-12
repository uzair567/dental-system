const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'dental.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// ---- Seed a default Super Admin + demo services if empty ----
const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (userCount === 0) {
  const insertUser = db.prepare(`INSERT INTO users (id,name,email,phone,password_hash,role,specialty)
    VALUES (?,?,?,?,?,?,?)`);

  const admin = uuid();
  insertUser.run(admin, 'Clinic Admin', 'admin@clinic.com', '03000000000',
    bcrypt.hashSync('admin123', 10), 'super_admin', null);

  const dentist1 = uuid();
  insertUser.run(dentist1, 'Dr. Sara Ahmed', 'dr.sara@clinic.com', '03001111111',
    bcrypt.hashSync('dentist123', 10), 'dentist', 'General & Cosmetic Dentistry');

  const dentist2 = uuid();
  insertUser.run(dentist2, 'Dr. Bilal Khan', 'dr.bilal@clinic.com', '03002222222',
    bcrypt.hashSync('dentist123', 10), 'dentist', 'Orthodontics');

  const reception = uuid();
  insertUser.run(reception, 'Ayesha (Front Desk)', 'reception@clinic.com', '03003333333',
    bcrypt.hashSync('reception123', 10), 'receptionist', null);

  console.log('Seeded default users:');
  console.log('  Super Admin   -> admin@clinic.com / admin123');
  console.log('  Dentist       -> dr.sara@clinic.com / dentist123');
  console.log('  Dentist       -> dr.bilal@clinic.com / dentist123');
  console.log('  Receptionist  -> reception@clinic.com / reception123');
}

const svcCount = db.prepare('SELECT COUNT(*) AS c FROM services').get().c;
if (svcCount === 0) {
  const insertSvc = db.prepare(`INSERT INTO services (id,name,slug,description,duration_minutes,price)
    VALUES (?,?,?,?,?,?)`);
  const demoServices = [
    ['Dental Check-up & Cleaning', 'checkup-cleaning', 'Routine oral exam, scaling and polishing to keep your teeth and gums healthy.', 30, 3000],
    ['Tooth Filling', 'tooth-filling', 'Composite or amalgam filling to restore a decayed or damaged tooth.', 30, 4000],
    ['Root Canal Treatment', 'root-canal', 'Removes infected pulp and seals the tooth to relieve pain and save it from extraction.', 60, 15000],
    ['Tooth Extraction', 'extraction', 'Safe removal of a damaged, impacted or infected tooth.', 30, 5000],
    ['Braces / Orthodontics', 'braces', 'Metal or ceramic braces to gradually straighten and align teeth.', 45, 80000],
    ['Teeth Whitening', 'whitening', 'In-clinic whitening treatment for a brighter, whiter smile.', 45, 12000],
    ['Dental Implant', 'implant', 'Permanent titanium implant to replace a missing tooth.', 90, 60000],
    ['Crowns & Bridges', 'crowns-bridges', 'Custom-made crowns and bridges to restore damaged or missing teeth.', 60, 20000],
  ];
  for (const [name, slug, description, duration_minutes, price] of demoServices) {
    insertSvc.run(uuid(), name, slug, description, duration_minutes, price);
  }
}

function nextPatientCode() {
  const row = db.prepare('SELECT COUNT(*) AS c FROM patients').get();
  return 'P-' + String(row.c + 1).padStart(5, '0');
}

function nextInvoiceNumber() {
  const row = db.prepare('SELECT COUNT(*) AS c FROM invoices').get();
  return 'INV-' + String(row.c + 1).padStart(5, '0');
}

function logActivity(userId, action, entityType, entityId, details) {
  db.prepare(`INSERT INTO activity_log (id,user_id,action,entity_type,entity_id,details)
    VALUES (?,?,?,?,?,?)`).run(uuid(), userId || null, action, entityType || null, entityId || null,
    typeof details === 'string' ? details : JSON.stringify(details || {}));
}

module.exports = { db, uuid, nextPatientCode, nextInvoiceNumber, logActivity };
