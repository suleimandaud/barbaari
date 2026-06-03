# Barbaari Operator Demo Script

Project path: `/Users/pioneer/barbaari`  
API base URL: `http://127.0.0.1:8000/api`  
Demo tenant: Little Lantern Daycare

Use this script to demo Barbaari to a daycare operator. The goal is to show a realistic operator workflow: platform setup, daycare administration, classroom/staff use, parent visibility, attendance compliance, documents, notifications, and audit history.

## 1. Startup Commands

Open separate terminal windows/tabs for each process.

### Backend and Demo Data

```bash
cd /Users/pioneer/barbaari/apps/backend
php artisan config:clear
php artisan cache:clear
php artisan migrate
php artisan barbaari:demo-reset
php artisan serve
```

Expected backend URL:

```text
http://127.0.0.1:8000
```

The demo reset should print:

```text
Barbaari demo data reset. Little Lantern Daycare is active.
```

### Daycare Web App

```bash
cd /Users/pioneer/barbaari
npm --workspace @barbaari/daycare-web run dev
```

Expected local URL is usually:

```text
http://localhost:5173
```

### Super Admin Web App

```bash
cd /Users/pioneer/barbaari
npm --workspace @barbaari/super-admin run dev
```

If the daycare web app already uses `5173`, Vite will choose the next available port, usually:

```text
http://localhost:5174
```

### Mobile App

```bash
cd /Users/pioneer/barbaari/apps/mobile
npx expo start --ios --port 8082
```

If iOS simulator does not open automatically, press `i` in the Expo terminal.

## 2. Demo Accounts

| Role | Email | Password |
| --- | --- | --- |
| Super Admin | `super@barbaari.test` | `Password123!` |
| Daycare Admin | `admin@littlelantern.test` | `Password123!` |
| Teacher | `teacher@littlelantern.test` | `Password123!` |
| Staff | `staff@littlelantern.test` | `Password123!` |
| Parent | `parent@littlelantern.test` | `Password123!` |

## 3. Demo Flow

### A. Super Admin

Login as:

```text
super@barbaari.test / Password123!
```

Demo steps:

1. Open the Platform Dashboard.
   - Say: “This is the SaaS operator view across all daycare organizations.”
   - Point out platform counts, active organizations, users, subscriptions, alerts, and recent activity.

2. Open Organizations.
   - Show Little Lantern Daycare.
   - Confirm status is `active`.
   - Say: “The platform admin can approve, suspend, and reactivate organizations from here.”
   - If demonstrating actions, suspend and immediately reactivate Little Lantern, then show the audit log.

3. Open Pricing Plans.
   - Show available pricing plans.
   - Say: “Plans are managed from the platform admin area. This is local platform billing setup, not live Stripe billing yet.”

4. Open Global Users.
   - Show users by role.
   - Filter by `parent` or `teacher` if useful.
   - Say: “The platform can inspect and support accounts globally, with role and tenant context.”

5. Open Support Tickets.
   - Show support ticket management.
   - Optionally open a ticket detail.

6. Open Security / Audit Logs.
   - Show recent audit events.
   - Say: “Important admin actions are recorded for accountability.”

7. Open Monitoring.
   - Show health status.
   - Disclose: provider checks for Stripe/SMS/email are placeholders until production integrations are connected.

### B. Daycare Web

Login as:

```text
admin@littlelantern.test / Password123!
```

Demo steps:

1. Show Dashboard.
   - Say: “This is the daycare operator dashboard for daily operations.”
   - Point out children, attendance, incidents, invoices, notifications, and occupancy-style information.

2. Open Children.
   - Show existing children.
   - Point out `child_code`, for example `LLD-CH-0001`.
   - Say: “Child names are not treated as unique. Barbaari uses a human-friendly child code to distinguish children safely.”

3. Create or view a child.
   - Use the child form if creating.
   - Show that the operator chooses classrooms/guardians by name rather than typing database IDs.
   - If you create a child, refresh or return to the list and point out the generated child code.

4. Link guardian.
   - Use the row action or child workflow to link an existing guardian.
   - Say: “Guardians are selected by name/contact details. The system stores the internal ID silently.”

5. Assign classroom.
   - Use the classroom dropdown.
   - Say: “Classroom assignment is operator-friendly and does not expose database IDs.”

6. Open Documents.
   - Upload a small demo document.
   - Download the document.
   - Say: “Document upload and download are real local backend storage with role-based access.”
   - Disclosure: “For production, this should move to private cloud storage such as S3 with backup and retention policies.”

7. Open Attendance Operations.
   - Show the top tabs: Live Status, Kiosk / Tablet, Records, Absences, Early Checkouts, Missing Checkouts, and Corrections.
   - In Records, show today’s attendance table.
   - Point out child name, child code, classroom, check-in/out, signer, verification method, and signature status.
   - Say: “Attendance Operations keeps live status, tablet launch, records, absences, early checkout, missing checkout, and corrections in one workspace.”

8. Open the Kiosk / Tablet tab.
   - Click `Open Tablet / Kiosk Mode`.
   - Say: “This is the front-desk or classroom tablet workflow.”
   - Choose Parent / Guardian, Staff, or Admin mode and unlock with the matching demo credentials.
   - Select classroom.
   - Select child using name, child code, and classroom.
   - Choose `Check in`.
   - Select signer: parent/guardian, authorized pickup, or staff-assisted.
   - Choose verification method:
     - Secure login
     - PIN
     - Signature
     - QR is visibly marked as a placeholder
   - Choose `Signature`.
   - Type the signer name.
   - Draw a signature with mouse/touch.
   - Submit.
   - Show confirmation screen.
   - Say: “The drawn signature is saved as an image reference and hash on the attendance record.”

9. Check out with drawn signature.
   - Repeat kiosk/tablet mode.
   - Choose `Check out`.
   - Select the same child.
   - Select authorized guardian/pickup.
   - Draw signature and submit.

10. Mark absent.
   - In kiosk/tablet mode or the Attendance Operations Absences tab, select a child.
   - Choose `Mark absent`.
   - Select an absence type such as `Sick` or `Vacation`.
   - Enter reason/notes.
   - Submit.
   - Show the absence type badge in the absence records table.
   - Say: “Absences are first-class records, not just missing check-ins, and the absence type is saved.”

11. View Attendance Audit Log.
   - Open audit log from the attendance row or audit section.
   - Show signer details, correction/audit entries, and actor names.
   - Say: “Attendance changes and signed attendance actions are auditable.”

12. Show Notification Count.
   - Point out the notification badge/count.
   - Open Notifications.
   - Show attendance/absence/document/incident notifications.
   - Mark one as read.
   - Say: “In-app notifications are real. External SMS/email/push delivery is not connected yet.”

13. Show Billing / Invoices.
   - Open Billing.
   - Show invoices and payments.
   - If creating an invoice, choose a child from the dropdown rather than typing an ID.
   - Disclosure: “Stripe payments are a placeholder in this demo.”

14. Show Incidents and Daily Notes.
   - Open Incidents.
   - Create or view an incident for a child selected by name/code.
   - Open Daily Notes.
   - Create or view a note.
   - Say: “Parents can see related notes/incidents from mobile.”

### C. Mobile Staff

In the iOS simulator, select the Staff auth tab and login as:

```text
teacher@littlelantern.test / Password123!
```

Demo steps:

1. Show Staff Home.
   - Say: “Staff see classroom-focused workflows, not billing or platform settings.”

2. Show Classroom Children.
   - Open Kids/Children.
   - Point out assigned classroom children.

3. Check child in/out.
   - Open Attend.
   - Select a child.
   - Use secure-login check-in/out or PIN verification if demonstrating PIN.
   - Say: “Staff can only operate on assigned/visible children.”

4. Create Incident.
   - Open More or Incidents.
   - Create a simple incident report if available in the current mobile route.
   - Say: “Incident creation triggers internal parent notifications.”

5. Create Daily Note.
   - Open Notes.
   - Add a note for a child.
   - Say: “Daily notes are saved to the backend and visible to parents.”

6. View Notifications.
   - Open More or Alerts/Notifications.
   - Show staff notifications.
   - Mark one as read if available.

7. Logout.
   - Show that staff can return to login.

### D. Mobile Parent

In the iOS simulator, select the Parent auth tab and login as:

```text
parent@littlelantern.test / Password123!
```

Demo steps:

1. Show Parent Home.
   - Say: “Parents see only their own child-related information.”

2. Show Child Profile.
   - Open Child.
   - Show child name, child code, classroom, DOB/age, and guardian context.

3. Show Attendance Status and History.
   - Open Attend.
   - Show current attendance status and history.
   - Point out check-in/check-out events from the daycare web kiosk flow.

4. Show Absence History.
   - On Attendance, show recorded absences.
   - Say: “Absences are visible to parents and stored separately from attendance records.”

5. Show Document Download.
   - Open More > Documents, or the relevant document screen.
   - Download/view the uploaded demo document if available.

6. Show Incident and Daily Note.
   - Open More > Incidents and Daily Notes.
   - Show the records created from daycare/staff workflows.

7. Show Notifications.
   - Open More > Notifications/Alerts.
   - Show notifications from attendance, absence, document upload, incident, or daily note events.
   - Mark a notification as read.

8. Logout.

## 4. What To Say Is Real

Use these points confidently:

- Real Laravel backend in `apps/backend`.
- Real MySQL database: `barbaari_db`.
- Real Laravel Sanctum token authentication.
- Real role-based permissions for super admin, daycare admin, staff/teacher, and parent workflows.
- Real tenant-scoped daycare data.
- Real unique child codes per organization.
- Real document upload/download using Laravel storage.
- Real internal in-app notifications with read/unread state.
- Real attendance check-in/check-out records.
- Real attendance audit logs.
- Real absence tracking.
- Real staff PIN verification with hashed PINs and verification logs.
- Real guardian/authorized pickup signing flow.
- Real drawn signature capture in kiosk/tablet mode.
- Real signature file reference and SHA-256 hash saved on attendance records.

## 5. What To Disclose As Not Production Yet

Be explicit about these items:

- Stripe is a placeholder. Real payment processing is not connected yet.
- SMS/email/push notification providers are placeholders. In-app notifications are real.
- QR verification is a placeholder.
- DCYF/WCCC export is a placeholder.
- Document storage is local Laravel storage for pilot/demo, not production cloud storage.
- Kiosk/tablet mode is not a locked-down device mode.
- Receipt PDF generation is not production-ready.
- Monitoring provider checks for Stripe/SMS/email are placeholders.
- Backups, production deployment, error monitoring, and cloud security hardening are not complete.

## 6. Common Demo Problems And Fixes

### XAMPP MySQL Not Running

Symptom:
- Laravel returns database connection errors.
- `php artisan migrate` fails with MySQL connection errors.

Fix:
- Open XAMPP.
- Start MySQL.
- Rerun:

```bash
cd /Users/pioneer/barbaari/apps/backend
php artisan migrate
php artisan barbaari:demo-reset
```

### Laravel Server Not Running

Symptom:
- Frontend login fails.
- API requests fail.

Fix:

```bash
cd /Users/pioneer/barbaari/apps/backend
php artisan serve
```

### Wrong Port

Symptom:
- Browser opens a stale app or cannot connect.

Fix:
- Backend should be `http://127.0.0.1:8000`.
- Daycare web is usually `http://localhost:5173`.
- Super admin may be `http://localhost:5174` if daycare web is already running.
- Check the Vite terminal output for the exact URL.

### Little Lantern Appears Suspended

Symptom:
- Demo data shows Little Lantern Daycare as suspended.

Fix:

```bash
cd /Users/pioneer/barbaari/apps/backend
php artisan barbaari:demo-reset
```

Then refresh the super admin Organizations page.

### Expo Port Busy

Symptom:
- Expo cannot start on the requested port.

Fix:

```bash
cd /Users/pioneer/barbaari/apps/mobile
npx expo start --ios --port 8083
```

### Old Dev Server Still Running

Symptom:
- App shows old behavior after changes.
- Login works but screens look stale.

Fix:
- Stop old terminal sessions with `Ctrl+C`.
- Restart backend and Vite/Expo.
- Hard refresh browser.
- In Expo, reload the app from the simulator.

### Login Fails After Reset

Symptom:
- Demo password does not work.

Fix:
- Rerun demo reset:

```bash
cd /Users/pioneer/barbaari/apps/backend
php artisan barbaari:demo-reset
```

Use `Password123!` exactly.

## 7. Final Demo Checklist

Run this checklist before showing the system.

### Backend

- [ ] XAMPP MySQL is running.
- [ ] `php artisan migrate` completed.
- [ ] `php artisan barbaari:demo-reset` completed.
- [ ] `php artisan serve` is running on `127.0.0.1:8000`.
- [ ] API login works for all demo accounts.

### Daycare Web

- [ ] Daycare web opens.
- [ ] Daycare admin login works.
- [ ] No blank page after login.
- [ ] Dashboard loads.
- [ ] Children page loads and shows child codes.
- [ ] Guardian linking uses dropdowns, not raw IDs.
- [ ] Classroom assignment uses dropdowns, not raw IDs.
- [ ] Documents upload and download.
- [ ] Attendance Operations page loads.
- [ ] Attendance Operations tabs render.
- [ ] Kiosk / Tablet tab opens tablet mode.
- [ ] Guardian check-in with drawn signature works.
- [ ] Check-out with drawn signature works.
- [ ] Mark absent saves and displays absence type.
- [ ] Notifications appear after attendance/absence/document actions.
- [ ] Audit logs show attendance actions.

### Super Admin

- [ ] Super admin app opens.
- [ ] Super admin login works.
- [ ] Platform dashboard loads.
- [ ] Organizations page shows Little Lantern Daycare as active.
- [ ] Pricing plans page loads.
- [ ] Global users page loads.
- [ ] Support tickets page loads.
- [ ] Audit logs page loads.
- [ ] Monitoring page loads.

### Mobile Staff

- [ ] Expo starts.
- [ ] Staff login works.
- [ ] Staff sees staff tabs only.
- [ ] Classroom children load.
- [ ] Staff attendance actions work.
- [ ] Staff notifications load.
- [ ] Staff logout works.

### Mobile Parent

- [ ] Parent login works.
- [ ] Parent sees parent tabs only.
- [ ] Child profile loads.
- [ ] Attendance status/history loads.
- [ ] Absence history loads.
- [ ] Documents are visible/downloadable if uploaded for the child.
- [ ] Incidents/daily notes load.
- [ ] Notifications load and can be marked read.
- [ ] Parent logout works.

### Disclosure Reminders

- [ ] Say Stripe is a placeholder.
- [ ] Say SMS/email/push providers are placeholders.
- [ ] Say QR is a placeholder.
- [ ] Say DCYF/WCCC export is a placeholder.
- [ ] Say local document/signature storage should move to private cloud storage for production.
- [ ] Say kiosk mode is not locked device mode yet.

## 8. Recommended Demo Close

Close with:

> “Barbaari is currently ready for a controlled operator demo and pilot discussion. The core daycare workflows are backed by Laravel, MySQL, real authentication, role permissions, document storage, notifications, attendance audit logs, PIN verification, absence tracking, and drawn signature capture. The remaining production work is mostly external integrations, compliance exports, cloud storage, locked-down kiosk mode, deployment, and operational hardening.”
