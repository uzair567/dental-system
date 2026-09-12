# Dentist Management System

A real, working system with three parts that share one backend:

1. **Public website** — home, about, services (+ individual service pages), dentist profiles,
   FAQs, blog, contact form, and online appointment booking.
2. **Admin/staff dashboard** — patients, leads/CRM, appointments, treatment records + dental
   chart, prescriptions, billing/invoices, doctors & staff, services, website messages inbox,
   reports, and an activity log.
3. **Desktop app (Electron)** — lets staff enter patients, leads, and appointments **offline**
   on a clinic computer. Everything is saved locally first; when the internet is back, it syncs
   automatically to the live server (and pulls down anything created on the website or the web
   dashboard).

Everything runs on a real backend: Node.js + Express + SQLite, with JWT-based login and
role-based permissions (Super Admin, Dentist, Receptionist, Staff).

---

## 1. Run the backend (does the website + dashboard both)

```bash
cd backend
npm install
npm start
```

This starts everything on **http://localhost:4000**:
- Public website → `http://localhost:4000/`
- Staff dashboard → `http://localhost:4000/admin/`
- API → `http://localhost:4000/api/...`

On first run it creates `backend/db/dental.db` (SQLite) and seeds demo accounts:

| Role          | Email                  | Password      |
|---------------|-------------------------|---------------|
| Super Admin   | admin@clinic.com        | admin123      |
| Dentist       | dr.sara@clinic.com      | dentist123    |
| Dentist       | dr.bilal@clinic.com     | dentist123    |
| Receptionist  | reception@clinic.com    | reception123  |

**Change these passwords (or deactivate/recreate the accounts from Doctors & Staff) before
using this with real patient data.**

To deploy this for real, put it on a small server or VPS with a persistent disk (for
`db/dental.db` and the `uploads/` folder), put it behind HTTPS, and set a strong `JWT_SECRET`
environment variable (see `backend/.env.example`... create one — `JWT_SECRET=<random-string>`).

## 2. Desktop app (offline-capable)

```bash
cd desktop-app
npm install
npm start
```

On first launch it asks for:
- **Live server URL** — e.g. `http://localhost:4000` while testing, or your real server's
  address/domain once deployed.
- **Staff email & password** — the same accounts as the dashboard.

From there, staff can add patients, leads, and appointments even with no internet — they're
saved to a local file on that computer (`app.getPath('userData')/offline-data`). Every 20
seconds, and whenever "Sync Now" is pressed, the app:

1. Checks whether the live server is reachable.
2. **Pushes** anything entered locally that hasn't been synced yet.
3. **Pulls** anything new from the server (bookings from the website, edits from the web
   dashboard, etc.) into the local copy.

Records keep their own ID from the moment they're created offline, so there's no
duplicate-record problem when they reach the server — the sync endpoint just upserts by ID.

To package the desktop app into an installer (.exe / .dmg / .AppImage) for staff computers,
add [`electron-builder`](https://www.electron.build/) and run it against this folder — it
wasn't included here to keep the download light, but the app itself is ready to package as-is.

## 3. Project structure

```
backend/            Express API + SQLite database + file uploads
  db/schema.sql      Full data model (patients, appointments, treatments, dental chart,
                      prescriptions, invoices/payments, leads, messages, activity log, sync log)
  routes/            One file per module (patients, appointments, billing, sync, etc.)
public-website/      Static site consuming the public API endpoints
web-dashboard/       Staff dashboard (vanilla JS, no build step) consuming the authenticated API
desktop-app/         Electron app: local offline store + sync engine + its own UI
```

## 4. What's implemented vs. what's stubbed

**Fully working:** patient records (phone-first duplicate check), leads/CRM with conversion to
patient, appointments (website booking + manual + reschedule/cancel/status), treatment records,
tooth-by-tooth dental chart, prescriptions, invoices + partial/full payments, doctors/staff
management with roles, services management, website contact-form inbox, dashboard stats,
basic reports, activity log, file uploads (X-rays/scans/documents) per patient, and the
offline-sync desktop app.

**Intentionally left as future work** (per the original "Future Expansion" list): SMS/WhatsApp
automation, online payment gateway, multi-branch support, insurance management, medicine
inventory levels, dental lab integration, and a separate patient-facing portal. The system is
structured (one route/table per module) so any of these can be added without restructuring
what's already here.
