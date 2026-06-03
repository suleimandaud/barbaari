# Barbaari Attendance-First Refocus Report

Date: 2026-05-23

## Summary

Barbaari is now refocused around attendance and attendance-related workflows for the main demo path. Existing mobile app code, backend modules, and older daycare management features were preserved. Non-attendance features are hidden from the main daycare sidebar instead of deleted.

## What Was Hidden From Main Navigation

The following modules remain in code and routes, but are no longer shown in the primary daycare demo sidebar:

- Billing
- Payments
- Incidents
- Daily Notes
- General Documents
- General Messages
- General Notifications entry as a standalone main module

Their route files and backend APIs were not deleted.

## What Remains Active

The main attendance-first surface keeps these modules active:

- Attendance Dashboard
- Live Check-ins
- Kiosk / Tablet Mode
- Children
- Guardians / Authorized Pickups
- Classrooms
- Staff Access
- Absences
- Early Checkouts
- Missing Checkouts
- Attendance Audit Logs
- Attendance Reports
- Devices / Tablets
- Settings

## New Daycare Attendance Navigation

The daycare web sidebar now labels the product as `Attendance Ops` and prioritizes attendance workflows. Several sidebar entries point into the existing attendance surface because check-ins, absences, early checkout, missing checkout, and kiosk/tablet mode are all part of the same attendance operations module.

## Daycare Attendance Dashboard

The dashboard was changed from a broad daycare management dashboard into an attendance operations dashboard. It now shows:

- Present today
- Checked out today
- Absent today
- Early checkouts
- Missing checkouts
- Children not checked in yet
- Tablet/kiosk status
- Audit activity
- Who is currently inside
- Children needing attention
- Classroom attendance summary
- Recent attendance actions
- Recent absences
- Signature and audit activity

The dashboard is intended to answer:

- Who is currently inside the daycare?
- Who has not arrived yet?
- Who left early?
- Who is absent?
- Who is missing checkout?
- Which classroom has how many children present?
- What actions happened recently?

## Tablet / iPad Flow

A new tablet-first route was added to the existing mobile app without deleting the mobile app:

- `apps/mobile/app/index.tsx` now presents `Attendance Tablet Mode` as the primary visible flow.
- `apps/mobile/app/kiosk.tsx` implements a full-screen tablet/kiosk flow.

Tablet flow:

1. Welcome / choose mode
2. Staff/admin unlock with PIN if needed
3. Select classroom or all classrooms
4. Select child
5. Choose action: check in, check out, mark absent, early checkout
6. Select signer: guardian, authorized pickup, or staff-assisted
7. Verification: secure login, PIN, drawn signature, QR placeholder
8. Signature screen with typed signer name and drawn signature pad
9. Confirmation screen with child, action, time, signer, and verification method
10. Automatic reset after confirmation

Unauthorized pickup signers are blocked before submission when `can_pickup` is false.

## Backend APIs Reused

No duplicate backend attendance logic was added. The refocus reuses existing APIs:

- `GET /manager/attendance`
- `GET /mobile/attendance`
- `POST /attendance/check-in`
- `POST /attendance/check-out`
- `POST /attendance/guardian-check-in`
- `POST /attendance/guardian-check-out`
- `GET /children/{child}/pickup-signers`
- `GET /absence-records`
- `POST /absence-records`
- `PATCH /absence-records/{absence}`
- `DELETE /absence-records/{absence}`
- `GET /attendance/audit-logs`
- `GET /attendance/export`
- `POST /auth/verify-pin`
- `POST /auth/pin-login`
- `GET /manager/classrooms`
- `GET /manager/children`
- `GET /manager/devices`

The mobile API wrapper was extended to call existing manager attendance/classroom/child/absence/guardian endpoints for tablet mode. The auth service was extended with PIN login storage for the tablet unlock flow.

## Files Changed

- `apps/daycare-web/src/layouts/AppLayout.tsx`
- `apps/daycare-web/src/pages/DashboardPage.tsx`
- `apps/daycare-web/src/pages/ReportsPage.tsx`
- `apps/daycare-web/src/styles.css`
- `apps/mobile/app/index.tsx`
- `apps/mobile/app/kiosk.tsx`
- `apps/mobile/components/Ui.tsx`
- `apps/mobile/services/auth.ts`
- `apps/mobile/services/mobileApi.ts`
- `OPERATOR_DEMO_SCRIPT.md`
- `ATTENDANCE_PERMISSION_LOGIC.md`
- `ATTENDANCE_FIRST_REFOCUS_REPORT.md`

## Tests Passed

Validation completed:

- `php artisan migrate`
- `php artisan barbaari:demo-reset`
- `npm --workspace @barbaari/daycare-web run typecheck`
- `npm --workspace @barbaari/daycare-web run build`
- `npm --workspace @barbaari/mobile run typecheck`
- `npm --workspace @barbaari/super-admin run typecheck`
- `npm --workspace @barbaari/daycare-web run test:e2e`
- `npm --workspace @barbaari/super-admin run test:e2e`
- `npx expo start --ios --port 8082`

Notes:

- `php artisan migrate` needed local MySQL access and completed with `Nothing to migrate`.
- `php artisan barbaari:demo-reset` completed and reseeded Little Lantern Daycare.
- Playwright e2e needed local Vite server port access and passed after updating daycare assertions for the renamed attendance dashboard.
- Expo started Metro on port `8082`, opened the iOS simulator target, and bundled successfully. The dev server was stopped after verification.

## Remaining Limitations

- QR verification remains a clearly labeled placeholder.
- Tablet drawn signature is captured in React Native as point data and sent through the existing signature field/reference path. A production tablet app should replace this with a native signature canvas that uploads a PNG artifact.
- The web attendance page already has a canvas PNG signature flow and remains the strongest signature demo path today.
- The sidebar hides non-attendance modules, but their direct routes still work intentionally.
- Production integrations such as SMS/email/push delivery, cloud file storage, and state-specific attendance exports are not connected.

## Attendance-Only Focus

The main demo experience is now attendance-first. The daycare dashboard, sidebar, reports, and mobile landing flow focus on attendance and attendance-related configuration. Old modules were preserved but removed from the main attendance demo path.
