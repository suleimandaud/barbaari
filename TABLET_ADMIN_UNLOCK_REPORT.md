# Tablet Admin Unlock Report

## Summary

Tablet / Kiosk Mode now requires a daycare admin or manager unlock before attendance tablet records load. Staff and teacher PINs remain available for staff-assisted workflows, but they no longer unlock the full tablet session.

## Why Unlock Changed

The tablet is an organization-level attendance kiosk. Staff, teachers, parents, guardians, and authorized pickups can have partial child/classroom permissions, so they should not control the whole kiosk session. The unlocked admin/manager is the system actor, while the selected signer or assisting staff is recorded separately.

## Unlock Endpoint

`POST /api/auth/tablet-unlock`

Payload:

```json
{
  "email": "admin@littlelantern.test",
  "pin": "123456",
  "purpose": "tablet_attendance"
}
```

Successful response includes token, user, role, organization ID, allowed modes, timezone, and tablet permissions.

## Roles Allowed To Unlock

- `daycare_admin`
- `manager`

## Roles Blocked From Unlock

- `parent`
- `guardian`
- `authorized_pickup`
- `teacher`
- `staff`
- `billing_manager`
- `support_staff`
- `super_admin`

Blocked roles receive role-specific `403` responses. Wrong admin/manager PIN returns `422` with `Incorrect admin/manager PIN.`

## Demo PIN

After `php artisan barbaari:demo-reset`:

- `admin@littlelantern.test / 123456`
- `manager@littlelantern.test / 123456`

PINs are stored only as hashes in `users.pin_hash`.

## Mode Permissions After Unlock

- Parent / Guardian sign-in/out: front desk mode with all organization classrooms and children visible. Authorized signer rules are enforced per child.
- Staff-assisted mode: all organization children are loaded after admin/manager unlock, but the selected staff helper is checked against classroom assignment. Classroom-scoped staff can assist only children in their assigned classroom.
- Admin mode/settings: unlocked admin/manager can view all tablet attendance data and admin-oriented tablet controls.

## Actor Vs Signer

- Actor: daycare admin or manager who unlocked the tablet.
- Signer: selected guardian, parent, authorized pickup, staff helper, or admin-assisted signer.
- Assisting staff: stored separately on tablet attendance and absence records when staff-assisted mode is used.

## Backend APIs Reused Or Changed

- Added `POST /api/auth/tablet-unlock`.
- Kept `POST /api/auth/pin-login` for staff/teacher PIN workflows.
- Kept tablet attendance endpoints and restricted them to admin/manager tablet sessions:
  - `GET /api/tablet/bootstrap?mode=guardian|staff|admin`
  - `GET /api/tablet/children/{child}/pickup-signers`
  - `POST /api/tablet/attendance/guardian-check-in`
  - `POST /api/tablet/attendance/guardian-check-out`
  - `POST /api/tablet/absence-records`

## Files Changed

- `apps/backend/app/Http/Controllers/AuthController.php`
- `apps/backend/app/Http/Controllers/ApiController.php`
- `apps/backend/app/Models/AttendanceRecord.php`
- `apps/backend/app/Models/AbsenceRecord.php`
- `apps/backend/app/Console/Commands/DemoResetCommand.php`
- `apps/backend/database/seeders/DatabaseSeeder.php`
- `apps/backend/database/migrations/2026_05_24_000001_add_assisting_staff_to_attendance_records.php`
- `apps/backend/database/migrations/2026_05_24_000002_add_assisting_staff_to_absence_records.php`
- `apps/backend/routes/api.php`
- `apps/mobile/app/kiosk.tsx`
- `apps/mobile/services/auth.ts`
- `packages/shared/src/api.ts`
- `packages/shared/src/types.ts`
- `ATTENDANCE_PERMISSION_LOGIC.md`
- `OPERATOR_DEMO_SCRIPT.md`
- `TABLET_ADMIN_UNLOCK_REPORT.md`

## Tests Passed

- `php artisan migrate`
- `php artisan barbaari:demo-reset`
- `POST /api/auth/tablet-unlock` admin unlock returned `200`.
- `POST /api/auth/tablet-unlock` manager unlock returned `200`.
- `POST /api/auth/tablet-unlock` teacher unlock returned `403`.
- `POST /api/auth/tablet-unlock` staff unlock returned `403`.
- `POST /api/auth/tablet-unlock` parent unlock returned `403`.
- `POST /api/auth/tablet-unlock` super admin unlock returned `403`.
- Wrong admin PIN returned `422`.
- Existing `POST /api/auth/pin-login` still accepts teacher PIN for staff-assisted workflows.
- `GET /api/tablet/bootstrap?mode=guardian` with admin token returned all three classrooms and all three children.
- `GET /api/tablet/bootstrap?mode=staff` with admin token returned staff-assisted scope, staff list, all three classrooms, and all three children.
- Staff-assisted checkout with wrong classroom staff returned `403`.
- Staff-assisted checkout with matching classroom teacher returned `200` and stored `assistingStaffId`.
- Tablet absence with manager assisting staff returned `201` and stored `assistingStaffId`.

## Remaining Limitations

- QR verification is still a clearly blocked placeholder.
- The tablet lock button resets local kiosk state but does not revoke the stored API token.
- Production kiosk hardening, device binding, and idle token expiry remain future work.
