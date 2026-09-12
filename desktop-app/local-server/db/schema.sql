-- Dentist Management System — SQLite schema
PRAGMA foreign_keys = ON;

-- ===================== USERS / ROLES =====================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin','dentist','receptionist','staff')),
  specialty TEXT,             -- for dentists
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  -- offline-sync bookkeeping
  origin_device TEXT DEFAULT 'server',
  synced_at TEXT
);

-- ===================== PATIENTS =====================
CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  patient_code TEXT UNIQUE,          -- human friendly ID e.g. P-00001
  phone TEXT NOT NULL,               -- entered FIRST in UI, deduped on
  name TEXT NOT NULL,
  email TEXT,
  address TEXT,
  dob TEXT,
  gender TEXT,
  medical_history TEXT,
  allergies TEXT,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  origin_device TEXT DEFAULT 'server',
  synced_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(name);

CREATE TABLE IF NOT EXISTS patient_documents (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
  visit_id TEXT,                     -- optional link to a treatment/appointment
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,                    -- xray, scan, photo, report, document, video, other
  uploaded_by TEXT REFERENCES users(id),
  uploaded_at TEXT DEFAULT (datetime('now'))
);

-- ===================== LEADS / CRM =====================
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  source TEXT,                       -- website_form, booking_enquiry, phone, whatsapp, walk_in, referral
  interested_service TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new','contacted','follow_up','converted','lost')),
  notes TEXT,
  follow_up_date TEXT,
  converted_patient_id TEXT REFERENCES patients(id),
  assigned_to TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  origin_device TEXT DEFAULT 'server',
  synced_at TEXT
);

CREATE TABLE IF NOT EXISTS lead_activities (
  id TEXT PRIMARY KEY,
  lead_id TEXT REFERENCES leads(id) ON DELETE CASCADE,
  note TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- ===================== SERVICES =====================
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  duration_minutes INTEGER DEFAULT 30,
  price REAL DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ===================== APPOINTMENTS =====================
CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES patients(id),
  dentist_id TEXT REFERENCES users(id),
  service_id TEXT REFERENCES services(id),
  date TEXT NOT NULL,                -- YYYY-MM-DD
  time TEXT NOT NULL,                -- HH:MM
  duration_minutes INTEGER DEFAULT 30,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','completed','cancelled','no_show')),
  source TEXT DEFAULT 'dashboard',   -- website, dashboard
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  origin_device TEXT DEFAULT 'server',
  synced_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_appt_date ON appointments(date);
CREATE INDEX IF NOT EXISTS idx_appt_dentist ON appointments(dentist_id);

-- ===================== TREATMENT RECORDS =====================
CREATE TABLE IF NOT EXISTS treatments (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES patients(id),
  appointment_id TEXT REFERENCES appointments(id),
  dentist_id TEXT REFERENCES users(id),
  diagnosis TEXT,
  complaint TEXT,
  treatment_performed TEXT,
  treatment_plan TEXT,
  notes TEXT,
  follow_up_date TEXT,
  cost REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  origin_device TEXT DEFAULT 'server',
  synced_at TEXT
);

-- Dental chart: one row per tooth condition entry (history-preserving)
CREATE TABLE IF NOT EXISTS tooth_records (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES patients(id),
  treatment_id TEXT REFERENCES treatments(id),
  tooth_number INTEGER NOT NULL,      -- FDI notation 11-48
  condition TEXT NOT NULL,            -- healthy, cavity, filling, extraction, root_canal, crown, implant, missing, other
  notes TEXT,
  recorded_by TEXT REFERENCES users(id),
  recorded_at TEXT DEFAULT (datetime('now')),
  origin_device TEXT DEFAULT 'server',
  synced_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tooth_patient ON tooth_records(patient_id);

-- ===================== PRESCRIPTIONS =====================
CREATE TABLE IF NOT EXISTS prescriptions (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES patients(id),
  treatment_id TEXT REFERENCES treatments(id),
  dentist_id TEXT REFERENCES users(id),
  prescription_date TEXT DEFAULT (datetime('now')),
  uploaded_file TEXT,                 -- if a slip was uploaded instead of typed
  created_at TEXT DEFAULT (datetime('now')),
  origin_device TEXT DEFAULT 'server',
  synced_at TEXT
);

CREATE TABLE IF NOT EXISTS prescription_items (
  id TEXT PRIMARY KEY,
  prescription_id TEXT REFERENCES prescriptions(id) ON DELETE CASCADE,
  medicine_name TEXT NOT NULL,
  dosage TEXT,
  frequency TEXT,
  duration TEXT,
  instructions TEXT
);

CREATE TABLE IF NOT EXISTS medicines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  strength TEXT,
  notes TEXT
);

-- ===================== BILLING =====================
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT UNIQUE,
  patient_id TEXT REFERENCES patients(id),
  treatment_id TEXT REFERENCES treatments(id),
  subtotal REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  total REAL DEFAULT 0,
  paid_amount REAL DEFAULT 0,
  status TEXT DEFAULT 'unpaid' CHECK (status IN ('unpaid','partial','paid')),
  created_at TEXT DEFAULT (datetime('now')),
  origin_device TEXT DEFAULT 'server',
  synced_at TEXT
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT,
  amount REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT REFERENCES invoices(id),
  patient_id TEXT REFERENCES patients(id),
  amount REAL NOT NULL,
  method TEXT DEFAULT 'cash',        -- cash, card, bank_transfer, other
  paid_at TEXT DEFAULT (datetime('now')),
  recorded_by TEXT REFERENCES users(id),
  origin_device TEXT DEFAULT 'server',
  synced_at TEXT
);

-- ===================== WEBSITE MESSAGES / CONTACT FORM =====================
CREATE TABLE IF NOT EXISTS website_messages (
  id TEXT PRIMARY KEY,
  name TEXT,
  phone TEXT,
  email TEXT,
  subject TEXT,
  message TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new','read','replied','archived')),
  created_at TEXT DEFAULT (datetime('now'))
);

-- ===================== ACTIVITY LOG =====================
CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,               -- e.g. "created patient", "updated appointment"
  entity_type TEXT,
  entity_id TEXT,
  details TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ===================== SYNC LOG (for desktop offline app) =====================
CREATE TABLE IF NOT EXISTS sync_log (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  synced_at TEXT DEFAULT (datetime('now')),
  status TEXT DEFAULT 'ok'
);
