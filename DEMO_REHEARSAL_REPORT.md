# Barbaari Demo Rehearsal Report

Date: 2026-05-18  
Project path: `/Users/pioneer/barbaari`

## 1. Overall Demo Readiness

Status: **Ready for a controlled operator demo**

Reason:
- Backend demo reset, auth, role checks, daycare web smoke tests, super admin smoke tests, Expo bundling, and core operator workflow API checks passed.
- Little Lantern Daycare is active after the final reset.
- The operator-facing daycare web pages opened without blank screens or captured browser console errors.
- Super admin pages opened without blank screens or captured browser console errors.
- Attendance kiosk/tablet signing, document upload/download, internal notifications, absences, audit logs, incidents, daily notes, invoices, and payment recording were rehearsed.

Not production-ready:
- Stripe, SMS/email/push, QR scanning, DCYF/WCCC exports, cloud storage, locked kiosk mode, and production monitoring remain placeholders or production hardening items.

## 2. Environment Tested

Backend:
- URL: `http://127.0.0.1:8000`
- Existing listener detected on port `8000`.
- Commands run:
  - `php artisan config:clear`
  - `php artisan cache:clear`
  - `php artisan migrate`
  - `php artisan barbaari:demo-reset`

Daycare web:
- URL: `http://localhost:5173`
- Existing Vite listener detected on port `5173`.

Super admin:
- URL: `http://localhost:5174`
- Started during rehearsal with `npm --workspace @barbaari/super-admin run dev`.

Mobile:
- Expo port: `8082`
- Command run: `npx expo start --ios --port 8082`
- Expo opened `exp://192.168.100.59:8082` on iPhone 16 Pro and bundled successfully.

Final reset:
- `php artisan barbaari:demo-reset` was run again after workflow mutation tests.
- Final platform organization check: `Little Lantern Daycare|active`.
- Final organization count: `1`.

## 3. Accounts Tested

All demo accounts logged in successfully through the local Laravel API:

| Account | Result | Role | User status | Organization status |
| --- | --- | --- | --- | --- |
| `super@barbaari.test` | Passed | `super_admin` | active | platform |
| `admin@littlelantern.test` | Passed | `daycare_admin` | active | active |
| `teacher@littlelantern.test` | Passed | `teacher` | active | active |
| `staff@littlelantern.test` | Passed | `staff` | active | active |
| `parent@littlelantern.test` | Passed | `parent` | active | active |

## 4. Super Admin Rehearsal Result

Pages rehearsed with Playwright browser click-through:
- Platform Dashboard
- Organizations
- Subscriptions
- Pricing Plans
- Analytics
- Global Users
- Support
- Security / Audit Logs
- Settings
- System Alerts
- Monitoring

Result:
- All pages opened.
- No blank screens found.
- Captured browser console errors: `0`.
- Little Lantern Daycare is visible and active.
- Organization row actions are row-level actions: View, Approve, Suspend, Reactivate.
- API test confirmed suspend/reactivate applies to Little Lantern and creates audit logs.

Super admin action check:

```text
org_status_after_reactivate=active
audit_status_updates=2
```

Issue fixed:
- Demo reset was leaving old test organizations (`API Test Org`, `human test`) in the platform Organizations page. This was confusing for a daycare operator demo. The reset command now removes obvious stray demo/test organizations and leaves a clean Little Lantern platform view.

Remaining notes:
- Monitoring page correctly labels provider checks as placeholders.
- Stripe/subscription behavior remains local demo behavior, not real Stripe billing.

## 5. Daycare Web Rehearsal Result

Pages rehearsed with Playwright browser click-through:
- Dashboard
- Organization
- Users & Staff
- Children
- Guardians
- Attendance
- Classrooms
- Billing
- Reports
- Incidents
- Documents
- Audit Logs
- Devices
- Payments
- Daily Notes
- Messages
- Notifications

Result:
- All pages opened.
- No blank screens found.
- Captured browser console errors: `0`.
- Children page shows child codes.
- Attendance page and kiosk/tablet flow are present.
- Placeholder disclosure is visible for QR and export/provider items.

Operator workflow API rehearsal:

```text
children=49,50,51
guardian=32
checkin=201
checkout=200
missing_signature=422
absence=201
doc_upload=201
doc_download=200
incident=201
note=201
invoice=201
payment_initial=404
payment_fixed=200
admin_unread=9
audit_logs=3
```

Attendance/kiosk result:
- Guardian drawn-signature check-in returned `201`.
- Guardian drawn-signature check-out returned `200`.
- Missing signature returned `422` with a friendly blocking path in the UI.
- Attendance audit logs were present.
- Unauthorized pickup behavior was previously verified in Phase 2 QA and remains covered by the API.

Documents result:
- Document upload returned `201`.
- Document download returned `200`.

Notifications result:
- Attendance/document/incident/note/invoice/payment actions created unread notifications.
- Parent notification read-all returned `200` and unread count changed from `9` to `0`.

Audit log result:
- Attendance audit log endpoint returned entries after signed attendance workflow.

Issues fixed:
1. Payments page asked for “Invoice database ID.”
   - Severity: High for demo UX.
   - Fix: Replaced raw ID input with a human-readable invoice dropdown. The UI now sends the internal `databaseId` silently.
2. Payment API rehearsal initially failed with `404` when using the visible invoice number.
   - Severity: High for payment workflow demo.
   - Fix: Same Payments page fix above; API retest with `databaseId` returned `200`.
3. Attendance page warning said PIN and digital signatures were not connected.
   - Severity: Medium, misleading demo disclosure.
   - Fix: Updated wording to say secure login, staff PIN, and drawn digital signatures are active for pilot; QR remains a placeholder.

## 6. Mobile Staff Result

Mobile app:
- Expo started on port `8082`.
- Expo opened iOS simulator target and bundled successfully.
- No bundler error was observed during startup.

Staff/teacher API workflow:

```text
teacher_children=1
valid_pin=200
invalid_pin=422
parent_staff_api=403
staff_parent_invoice_api=403
```

Result:
- Teacher login works.
- Teacher sees assigned classroom children through the staff endpoint.
- Valid PIN verification works.
- Invalid PIN is blocked.
- Parent token is blocked from staff classroom children endpoint.
- Staff token is blocked from parent-only mobile invoices endpoint.

Notes:
- This rehearsal validated mobile role behavior through API and Expo bundling. Visual simulator inspection was limited to successful Expo open/bundle logs in this environment.
- Existing Phase 2 QA already confirmed staff mobile screens and tab separation after implementation.

## 7. Mobile Parent Result

Parent API workflow:

```text
parent_children=2
parent_attendance=2
parent_absences=1
parent_docs=2
parent_notifications=9
parent_unread_before=9
mark_all=200
parent_unread_after=0
```

Result:
- Parent login works.
- Parent sees own children only through mobile children endpoint.
- Parent attendance history loads.
- Parent absence history loads.
- Parent documents load.
- Parent notifications load.
- Mark all notifications read works.
- Parent token is blocked from staff-only endpoint.

Notes:
- Existing mobile navigation work keeps parent tabs separate from staff tabs.
- Visual simulator inspection was limited to Expo open/bundle logs in this environment.

## 8. Bugs Found

### Bug 1: Demo reset left old test organizations

- App/page: Super Admin / Organizations
- Issue: Old test organizations appeared next to Little Lantern Daycare.
- Severity: Medium
- Status: Fixed
- Fix: `barbaari:demo-reset` now removes obvious stray demo/test organizations before restoring Little Lantern.
- Files changed:
  - `apps/backend/app/Console/Commands/DemoResetCommand.php`

### Bug 2: Payments page exposed internal invoice database ID

- App/page: Daycare Web / Payments
- Issue: Payment form asked for “Invoice database ID.”
- Severity: High
- Status: Fixed
- Fix: Replaced raw ID input with a human-readable invoice dropdown and silently submits `databaseId`.
- Files changed:
  - `apps/daycare-web/src/pages/PaymentsPage.tsx`

### Bug 3: Recording payment with visible invoice number failed

- App/page: Daycare Web / Payments / API workflow
- Issue: API route expects the database invoice ID, but the visible invoice ID is the invoice number.
- Severity: High
- Status: Fixed in frontend workflow
- Fix: Payments page now uses `invoice.databaseId` from the invoice list.
- Verification: Retest returned `payment_fixed=200`.

### Bug 4: Attendance placeholder warning was stale

- App/page: Daycare Web / Attendance
- Issue: Warning claimed PIN and digital signature were not connected, but both are now pilot-active.
- Severity: Medium
- Status: Fixed
- Fix: Updated copy to clarify secure login, staff PIN, and drawn digital signatures are active; QR remains placeholder.
- Files changed:
  - `apps/daycare-web/src/pages/AttendancePage.tsx`

## 9. Remaining Demo Risks

- Mobile visual QA was limited by the environment. Expo opened and bundled, and mobile role workflows were API-tested, but this report does not include fresh simulator screenshots.
- Payment page now works for recording local payments, but Stripe is still not real.
- QR verification remains a visible placeholder.
- DCYF/WCCC export remains a placeholder.
- Documents and signatures use local Laravel storage, not production cloud storage.
- Kiosk/tablet mode is not locked device mode.
- Receipt PDF generation remains placeholder-level.
- The daycare web top search field is visually present but not a full global search workflow.

## 10. Final Demo Checklist

| Check | Result |
| --- | --- |
| Backend running on `127.0.0.1:8000` | Yes |
| Daycare web available on `localhost:5173` | Yes |
| Super admin available on `localhost:5174` | Yes |
| Expo started on port `8082` | Yes |
| Demo reset run after rehearsal | Yes |
| Little Lantern active | Yes |
| Only Little Lantern shown after final reset | Yes |
| All demo logins work | Yes |
| Daycare web no blank pages in click-through | Yes |
| Super admin no blank pages in click-through | Yes |
| Browser console errors in web click-through | None captured |
| Attendance signing works | Yes |
| Missing signature blocked | Yes |
| Documents upload/download | Yes |
| Notifications appear/read state works | Yes |
| Audit logs show attendance actions | Yes |
| Payment recording works without raw ID input | Yes |
| Typecheck/build passed | Yes |
| Playwright smoke tests passed | Yes |
| Remaining placeholders disclosed | Yes |

## 11. Final Check Commands

Passed:

```text
php -l app/Console/Commands/DemoResetCommand.php
php -l app/Http/Controllers/ApiController.php
npm --workspace @barbaari/daycare-web run typecheck
npm --workspace @barbaari/daycare-web run build
npm --workspace @barbaari/super-admin run typecheck
npm --workspace @barbaari/super-admin run build
npm --workspace @barbaari/mobile run typecheck
npm --workspace @barbaari/daycare-web run test:e2e
npm --workspace @barbaari/super-admin run test:e2e
```

Playwright:

```text
daycare: 2 passed
super-admin: 2 passed
```

