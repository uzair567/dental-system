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

// ---- Seed demo patients, appointments, treatments, billing, leads, messages (fresh DB only) ----
const patientCount = db.prepare('SELECT COUNT(*) AS c FROM patients').get().c;
if (patientCount === 0) {
  const admin = db.prepare(`SELECT id FROM users WHERE email='admin@clinic.com'`).get()?.id;
  const drSara = db.prepare(`SELECT id FROM users WHERE email='dr.sara@clinic.com'`).get()?.id;
  const drBilal = db.prepare(`SELECT id FROM users WHERE email='dr.bilal@clinic.com'`).get()?.id;
  const services = db.prepare('SELECT id, name, price FROM services').all();
  const svc = (slugPart) => services.find(s => s.name.toLowerCase().includes(slugPart)) || services[0];

  if (admin && drSara && drBilal && services.length) {
    const today = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return iso(d); };
    const daysAhead = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d); };

    const insertPatient = db.prepare(`INSERT INTO patients
      (id,patient_code,phone,name,email,address,dob,gender,medical_history,allergies,created_by,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`);

    const demoPatients = [
      ['03011234501', 'Ahmed Raza', 'ahmed.raza@example.com', 'House 12, F-10, Islamabad', '1990-04-12', 'Male', null, null],
      ['03021234502', 'Sana Malik', 'sana.malik@example.com', 'Street 4, G-9, Islamabad', '1995-08-22', 'Female', 'Mild hypertension', null],
      ['03031234503', 'Bilal Hussain', 'bilal.h@example.com', 'DHA Phase 2, Islamabad', '1988-01-30', 'Male', null, 'Penicillin'],
      ['03041234504', 'Ayesha Tariq', 'ayesha.tariq@example.com', 'Bahria Town, Rawalpindi', '2001-11-05', 'Female', null, null],
      ['03051234505', 'Usman Farooq', 'usman.farooq@example.com', 'I-8 Markaz, Islamabad', '1979-06-18', 'Male', 'Diabetic (Type 2)', null],
      ['03061234506', 'Mahnoor Iqbal', 'mahnoor.iqbal@example.com', 'E-11, Islamabad', '2010-03-09', 'Female', null, null],
      ['03071234507', 'Hamza Sheikh', 'hamza.sheikh@example.com', 'G-13, Islamabad', '1993-09-27', 'Male', null, 'Latex'],
      ['03081234508', 'Zara Ahmed', 'zara.ahmed@example.com', 'Blue Area, Islamabad', '1985-12-14', 'Female', null, null],
    ];
    const patientIds = demoPatients.map(([phone, name, email, address, dob, gender, history, allergy]) => {
      const id = uuid();
      insertPatient.run(id, nextPatientCode(), phone, name, email, address, dob, gender, history, allergy, admin);
      return { id, name };
    });

    // ---- Leads ----
    const insertLead = db.prepare(`INSERT INTO leads (id,name,phone,email,source,interested_service,status,notes,follow_up_date)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    insertLead.run(uuid(), 'Fatima Yousaf', '03091234509', 'fatima.y@example.com', 'contact_form', 'Teeth Whitening', 'new', 'Asked about whitening pricing via the contact form.', daysAhead(2));
    insertLead.run(uuid(), 'Omar Siddiqui', '03101234510', null, 'phone', 'Braces / Orthodontics', 'contacted', 'Called about braces for his teenage daughter, said he\'ll visit next week.', daysAhead(5));
    insertLead.run(uuid(), 'Nadia Chaudhry', '03111234511', 'nadia.c@example.com', 'walk_in', 'Dental Implant', 'follow_up', 'Walked in asking about implant cost, needs a follow-up call.', daysAhead(1));
    insertLead.run(uuid(), 'Kamran Butt', '03121234512', null, 'referral', 'Root Canal Treatment', 'new', 'Referred by an existing patient.', null);

    // ---- Appointments (past completed, today, upcoming) ----
    const insertAppt = db.prepare(`INSERT INTO appointments
      (id,patient_id,dentist_id,service_id,date,time,duration_minutes,status,source,notes,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))`);

    const apptPlan = [
      [patientIds[0].id, drSara, svc('check-up'), daysAgo(20), '10:00', 'completed', 'dashboard'],
      [patientIds[1].id, drBilal, svc('filling'), daysAgo(14), '11:30', 'completed', 'website'],
      [patientIds[2].id, drSara, svc('root canal'), daysAgo(7), '09:00', 'completed', 'dashboard'],
      [patientIds[3].id, drBilal, svc('cleaning'), daysAgo(3), '14:00', 'completed', 'website'],
      [patientIds[4].id, drSara, svc('extraction'), daysAgo(1), '10:30', 'completed', 'dashboard'],
      [patientIds[5].id, drBilal, svc('whitening'), iso(today), '15:00', 'confirmed', 'website'],
      [patientIds[6].id, drSara, svc('check-up'), daysAhead(1), '09:30', 'confirmed', 'dashboard'],
      [patientIds[7].id, drBilal, svc('crown'), daysAhead(3), '13:00', 'pending', 'website'],
      [patientIds[0].id, drSara, svc('implant'), daysAhead(6), '11:00', 'pending', 'website'],
    ];
    const apptIds = apptPlan.map(([pid, did, service, date, time, status, source]) => {
      const id = uuid();
      insertAppt.run(id, pid, did, service.id, date, time, 30, status, source, null);
      return { id, pid, did, service, date, status };
    });

    // ---- Treatments + tooth records for the completed appointments ----
    const insertTreatment = db.prepare(`INSERT INTO treatments
      (id,patient_id,appointment_id,dentist_id,diagnosis,complaint,treatment_performed,treatment_plan,notes,follow_up_date,cost,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`);
    const insertTooth = db.prepare(`INSERT INTO tooth_records (id,patient_id,treatment_id,tooth_number,condition,notes,recorded_by,recorded_at)
      VALUES (?,?,?,?,?,?,?,datetime('now'))`);

    const treatmentPlan = [
      [0, 'Routine check-up, no major issues', 'Sensitivity to cold', 'Scaling and polishing', null, null, 3000, [[16, 'healthy']]],
      [1, 'Cavity in lower left molar', 'Pain while chewing', 'Composite filling', null, null, 4000, [[36, 'filling']]],
      [2, 'Deep caries reaching the pulp', 'Severe toothache at night', 'Root canal treatment', 'Crown recommended in 2 weeks', daysAhead(14), 15000, [[46, 'root_canal']]],
      [3, 'Plaque build-up', 'Bleeding gums', 'Deep cleaning', null, null, 3000, [[11, 'healthy'], [21, 'healthy']]],
      [4, 'Impacted wisdom tooth', 'Swelling and pain', 'Surgical extraction', 'Follow-up in 1 week to check healing', daysAhead(6), 8000, [[48, 'extraction']]],
    ];
    const treatmentIds = treatmentPlan.map(([apptIdx, diagnosis, complaint, performed, plan, followUp, cost, teeth]) => {
      const appt = apptIds[apptIdx];
      const id = uuid();
      insertTreatment.run(id, appt.pid, appt.id, appt.did, diagnosis, complaint, performed, plan, null, followUp, cost);
      for (const [toothNum, condition] of teeth) insertTooth.run(uuid(), appt.pid, id, toothNum, condition, null, appt.did);
      return { id, pid: appt.pid, cost };
    });

    // ---- Prescriptions for a couple of the treatments ----
    const insertRx = db.prepare(`INSERT INTO prescriptions (id,patient_id,treatment_id,dentist_id,prescription_date,created_at)
      VALUES (?,?,?,?,datetime('now'),datetime('now'))`);
    const insertRxItem = db.prepare(`INSERT INTO prescription_items (id,prescription_id,medicine_name,dosage,frequency,duration,instructions)
      VALUES (?,?,?,?,?,?,?)`);

    const rx1 = uuid();
    insertRx.run(rx1, treatmentIds[2].pid, treatmentIds[2].id, drSara);
    insertRxItem.run(uuid(), rx1, 'Amoxicillin', '500mg', '3 times a day', '5 days', 'Take after meals');
    insertRxItem.run(uuid(), rx1, 'Ibuprofen', '400mg', 'As needed for pain', '3 days', 'Do not exceed 3 tablets/day');

    const rx2 = uuid();
    insertRx.run(rx2, treatmentIds[4].pid, treatmentIds[4].id, drSara);
    insertRxItem.run(uuid(), rx2, 'Amoxicillin', '500mg', '3 times a day', '7 days', 'Complete the full course');
    insertRxItem.run(uuid(), rx2, 'Paracetamol', '500mg', 'Every 6 hours as needed', '3 days', null);

    // ---- Invoices + payments (some paid, some partial, some unpaid) ----
    const insertInvoice = db.prepare(`INSERT INTO invoices
      (id,invoice_number,patient_id,treatment_id,subtotal,discount,total,paid_amount,status,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))`);
    const insertInvItem = db.prepare(`INSERT INTO invoice_items (id,invoice_id,description,amount) VALUES (?,?,?,?)`);
    const insertPayment = db.prepare(`INSERT INTO payments (id,invoice_id,patient_id,amount,method,paid_at,recorded_by)
      VALUES (?,?,?,?,?,datetime('now'),?)`);

    const invoicePlan = [
      [treatmentIds[0], 'Scaling and polishing', 3000, 0, 3000, 'paid'],
      [treatmentIds[1], 'Composite filling', 4000, 0, 4000, 'paid'],
      [treatmentIds[2], 'Root canal treatment', 15000, 1000, 7000, 'partial'],
      [treatmentIds[3], 'Deep cleaning', 3000, 0, 0, 'unpaid'],
      [treatmentIds[4], 'Surgical extraction', 8000, 500, 8000, 'paid'],
    ];
    for (const [t, desc, amount, discount, paidAmount, status] of invoicePlan) {
      const invId = uuid();
      const total = amount - discount;
      insertInvoice.run(invId, nextInvoiceNumber(), t.pid, t.id, amount, discount, total, paidAmount, status);
      insertInvItem.run(uuid(), invId, desc, amount);
      if (paidAmount > 0) insertPayment.run(uuid(), invId, t.pid, paidAmount, 'cash', admin);
    }

    // ---- Website messages (inbox) ----
    const insertMsg = db.prepare(`INSERT INTO website_messages (id,name,phone,email,subject,message,status,created_at)
      VALUES (?,?,?,?,?,?,?,datetime('now'))`);
    insertMsg.run(uuid(), 'Fatima Yousaf', '03091234509', 'fatima.y@example.com', 'Question about whitening pricing', 'Hi, I wanted to ask how much teeth whitening costs and how long the appointment takes.', 'new');
    insertMsg.run(uuid(), 'Ali Raza', '03131234513', 'ali.raza@example.com', 'Weekend availability', 'Are you open on Saturdays? I can only come in on weekends.', 'read');

    console.log('Seeded demo data: 8 patients, 4 leads, 9 appointments, 5 treatments, 2 prescriptions, 5 invoices, 2 website messages.');
  }
}

module.exports = { db, uuid, nextPatientCode, nextInvoiceNumber, logActivity };
