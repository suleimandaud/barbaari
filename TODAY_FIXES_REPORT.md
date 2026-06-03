# Barbaari Today Fixes Report

Date: 2026-05-19  
Project: `/Users/pioneer/barbaari`

## Issues Fixed

### 1. Daycare Documents Upload

Status: Fixed and tested from browser UI.

Cause:
- The shared Axios client had a default JSON `Content-Type`. The Documents page was storing the selected file, but the multipart request could still inherit the JSON header, causing Laravel to receive no `file` field.

Fix:
- `documentsApi.upload()` now sends `FormData` while deleting the default `Content-Type` so the browser sets the multipart boundary.
- The Documents page now keeps a real `File` object, validates that a file exists before submit, refreshes after success, clears the file input, and shows friendly success/error messages.

Browser UI test:

```text
browser_upload_ok errors=0
browser_child_upload_ok
parent_child_document_visible=1
parent_download=200
storage_file_exists=true
```

## 2. Users & Staff Management

Status: Fixed.

Added to Daycare Web → Users & Staff:
- Add staff form.
- Edit staff form.
- Classroom dropdown.
- Role dropdown with friendly labels.
- Job title.
- Status: active/inactive/blocked.
- Activate/deactivate action.
- Reset PIN action.
- Demo invite/reset email placeholder label.
- Row actions without exposing database IDs.

Backend/API updates:
- Added staff management routes:
  - `POST /api/staff`
  - `PATCH /api/staff/{user}`
  - `PATCH /api/staff/{user}/assign-classroom`
  - `PATCH /api/staff/{user}/activate`
  - `PATCH /api/staff/{user}/deactivate`
  - `POST /api/staff/{user}/reset-pin`
- Existing organization scoping is enforced.
- Inactive staff login is blocked by existing auth status checks.
- Staff changes create audit log entries.

API test:

```text
staff_create=201
update=200
deactivate=200
inactive_login=403
activate=200
reset_pin=200
active_login=200
```

## 3. Mobile Secondary Page Navigation

Status: Fixed structurally and typechecked.

Changes:
- Secondary screens now exist as root stack routes outside `(tabs)`:
  - `/notifications`
  - `/documents`
  - `/messages`
  - `/incidents`
  - `/daily-notes`
  - `/profile`
  - `/receipts`
- More screen now routes to root stack pages instead of hidden tab pages.
- Root stack shows headers/back controls for secondary screens.
- Primary bottom tabs remain:
  - Parent: Home, Child, Billing, Attend, More
  - Staff: Home, Kids, Attend, Notes, More

Verification:
- `npm --workspace @barbaari/mobile run typecheck` passed.
- `npx expo start --ios --port 8082` started Metro and opened the iOS simulator target with no immediate bundler errors.

Remaining manual QA:
- Tap through secondary pages on the simulator and confirm no bottom tab bar is visible. The code structure now uses root stack routes, but a fresh simulator click pass is still recommended before a live demo.

## 4. Parent Mobile Attendance Card

Status: Fixed.

Changes:
- Added `apps/mobile/utils/attendanceSummary.ts`.
- Parent home now separates:
  - current status
  - today’s attendance details
  - last attendance if no record today
  - absence today
  - checked out early
- Parent attendance screen now includes a summary card per child before history.
- Yesterday or older attendance no longer appears as today’s current status.

States supported:
- `not_checked_in`
- `checked_in`
- `checked_out`
- `checked_out_early`
- `absent`
- `missing_checkout` documented for policy/UI use.

API verification:

```text
parent_children=2
parent_attendance=2|checked_out_early
parent_other_child_retry=403
```

## 5. Early Checkout / Partial Day Logic

Status: Added.

Backend:
- Attendance API payload now includes:
  - `status`
  - `statusLabel`
- Basic default day end time: `17:00`.
- If a child has check-in and check-out and the checkout time is before the day end time, status is `checked_out_early`.
- If organization attendance policy later defines `attendance_day_end_time` or `day_end_time`, that value is used.

Daycare web:
- Attendance filters include `Checked out early`.
- Attendance table shows an early checkout badge instead of treating the child as absent.

Mobile:
- Parent summary card shows `Checked out early` and the in/out times.

Remaining limitation:
- There is no `checkout_reason` field yet.
- There is no classroom-specific schedule yet.
- Missing-checkout display still needs a scheduled close-time UI decision.

## 6. Attendance Permission Documentation

Status: Created.

File:
- `ATTENDANCE_PERMISSION_LOGIC.md`

Also updated:
- `OPERATOR_DEMO_SCRIPT.md`

The documentation explains:
- Attendance states.
- Difference between absent, not checked in, checked out early, and missing checkout.
- Who can check in/out.
- Who can mark absent.
- Actor vs signer.
- Verification methods.
- Security rules.
- Legal/compliance caveat.
- Remaining production improvements.

## 7. Role-Based Attendance Tests

### Daycare Admin / Manager

```text
admin_in=201
admin_out=200
correction_retry=200
absence=201
audits=6
```

Passed:
- Check-in.
- Check-out.
- Correct attendance with reason.
- Mark absent.
- View audit logs.
- Parent notification creation was covered through notification count checks in prior rehearsal and remains wired through attendance/absence services.

### Staff / Teacher

```text
teacher_children=1
teacher_out=200
teacher_forbidden=403
pin=200
teacher_absence=201
```

Passed:
- Teacher sees assigned classroom children.
- Teacher can check out assigned child.
- Teacher is blocked from child outside assigned classroom.
- Teacher PIN verification works.
- Teacher can mark assigned child absent.

### Parent

```text
parent_children=2
parent_attendance=2|checked_out_early
parent_other_child_retry=403
```

Passed:
- Parent sees own children.
- Parent sees attendance status from API with early checkout status.
- Parent cannot sign for another child.

### Guardian / Authorized Pickup

```text
pickup_sign=200
bad_pickup=403
signature_hash_present=true
```

Passed:
- Authorized pickup can sign with drawn signature data.
- Unauthorized pickup is blocked.
- Signature reference/hash persisted.
- Audit logs persisted.

## Files Changed

Backend:
- `apps/backend/app/Http/Controllers/ApiController.php`
- `apps/backend/routes/api.php`

Shared:
- `packages/shared/src/api.ts`

Daycare web:
- `apps/daycare-web/src/pages/DocumentsPage.tsx`
- `apps/daycare-web/src/pages/StaffPage.tsx`
- `apps/daycare-web/src/pages/AttendancePage.tsx`

Mobile:
- `apps/mobile/app/_layout.tsx`
- `apps/mobile/app/(tabs)/more.tsx`
- `apps/mobile/app/(tabs)/index.tsx`
- `apps/mobile/app/(tabs)/attendance.tsx`
- `apps/mobile/app/notifications.tsx`
- `apps/mobile/app/messages.tsx`
- `apps/mobile/app/documents.tsx`
- `apps/mobile/app/incidents.tsx`
- `apps/mobile/app/daily-notes.tsx`
- `apps/mobile/app/profile.tsx`
- `apps/mobile/app/receipts.tsx`
- `apps/mobile/utils/attendanceSummary.ts`

Tests:
- `e2e/super-admin.spec.ts`

Docs:
- `ATTENDANCE_PERMISSION_LOGIC.md`
- `OPERATOR_DEMO_SCRIPT.md`
- `TODAY_FIXES_REPORT.md`

## Final Checks

Passed:

```text
php artisan migrate
php artisan barbaari:demo-reset
php -l app/Http/Controllers/ApiController.php
npm --workspace @barbaari/daycare-web run typecheck
npm --workspace @barbaari/daycare-web run build
npm --workspace @barbaari/mobile run typecheck
npm --workspace @barbaari/super-admin run typecheck
npm --workspace @barbaari/daycare-web run test:e2e
npm --workspace @barbaari/super-admin run test:e2e
```

Playwright:

```text
daycare: 2 passed
super-admin: 2 passed
```

Expo:

```text
npx expo start --ios --port 8082
Metro started and opened iPhone simulator target.
```

Warnings:
- Playwright/Expo still show the existing `NO_COLOR` / `FORCE_COLOR` warning. It did not block tests.

## Remaining Limitations

- Mobile secondary navigation was rechecked by route structure and Expo startup. Root stack pages are outside `(tabs)` and have back headers, so they should not show the bottom tab bar. A literal visual tap-through on the simulator could not be observed from this CLI session.
- Early checkout uses a simple default `17:00` day end and does not yet model classroom-specific schedules.
- Checkout reason is not modeled yet.
- Missing checkout is now returned by the backend for prior-day or after-day-end open records and appears in the daycare status filter/table and mobile summary helper.
- QR remains a placeholder.
- Stripe, SMS/email/push, DCYF export, deployment, cloud storage, and analytics remain out of scope for today.

## Final Mobile Navigation And Attendance Clarity QA

Date: 2026-05-19

Scope:
- Remaining mobile secondary navigation issue.
- Early checkout display.
- Missing checkout display.
- Checkout reason limitation.

Mobile secondary navigation:
- Parent main tabs remain: Home, Child, Billing, Attend, More.
- Staff main tabs remain: Home, Kids, Attend, Notes, More.
- Secondary routes are root stack routes, not tab screens:
  - `/notifications`
  - `/documents`
  - `/messages`
  - `/incidents`
  - `/daily-notes`
  - `/profile`
  - `/receipts`
- Root stack headers/back buttons are configured for secondary routes.
- More screen routes now point to those root stack routes.
- `npm --workspace @barbaari/mobile run typecheck` passed.
- `npx expo start --ios --port 8082` started Metro and opened the iPhone simulator target.

Attendance clarity:
- Backend now returns `missing_checkout` when a child has a check-in without checkout on a prior date, or after the configured day end time.
- Daycare web Attendance status filter includes `Missing checkout`.
- Daycare web Attendance table shows `Missing Checkout` with a danger badge.
- Mobile parent summary helper now shows:
  - `No attendance recorded today.`
  - check-in time for checked-in records.
  - check-in and checkout time for checked-out records.
  - `Checked out early` when checkout is before `17:00`.
  - absence type/reason when absent today.
  - `Missing checkout` for old open records or after day end.

Targeted QA results:

```text
missing_checkout_backend=LLD-CH-0003|2026-05-18|missing_checkout|Missing Checkout
checkout_http=200
parent_early_status=checked_out_early|08:12|10:18
absence_http=201
parent_absence_today=sick|QA absence state
```

Additional checks passed:

```text
php -l app/Http/Controllers/ApiController.php
npm --workspace @barbaari/mobile run typecheck
npm --workspace @barbaari/daycare-web run typecheck
npm --workspace @barbaari/daycare-web run build
npm --workspace @barbaari/super-admin run typecheck
```

Still remaining:
- Checkout reason field is not implemented yet.
- Day end time is still a simple default/config value, not a classroom schedule.
- A human should still do one visual simulator tap-through immediately before the live demo to confirm the native tab bar is hidden on every secondary screen.
