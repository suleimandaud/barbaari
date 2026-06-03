# Tablet Mode Permissions Rework Report

## Summary

Tablet / Kiosk Mode now selects a mode first, then unlocks with credentials appropriate to that mode. Bootstrap and tablet attendance APIs scope classrooms, children, signers, attendance records, and absence records by the unlocked user and selected mode.

## New Mode Unlock Logic

Endpoint: `POST /api/auth/tablet-unlock`

Parent / Guardian mode:

```json
{
  "mode": "guardian",
  "email": "parent@littlelantern.test",
  "password_or_pin": "Password123!"
}
```

Staff mode:

```json
{
  "mode": "staff",
  "email": "staff@littlelantern.test",
  "pin": "123456"
}
```

Admin mode:

```json
{
  "mode": "admin",
  "email": "admin@littlelantern.test",
  "pin": "123456"
}
```

The response includes token, user, role, mode, organization ID, allowed modes, visible classroom IDs, visible child IDs, timezone, and permissions.

## Parent / Guardian Permissions

- Unlocks with parent/guardian account password or PIN.
- Demo accounts:
  - `parent@littlelantern.test / Password123!`
  - `omar@example.test / Password123!`
- Sees only linked children.
- Sees only classrooms containing linked children.
- Can check in/out linked children and sign with drawn signature.
- Cannot mark absences.
- Cannot unlock staff or admin modes.

## Staff Permissions

- Unlocks with staff/teacher email and staff PIN.
- Demo accounts:
  - `teacher@littlelantern.test / 123456`
  - `staff@littlelantern.test / 123456`
- Teacher sees Blue Room only.
- Staff Assistant sees Sunshine only.
- Can check in/out and mark absent for assigned classroom children.
- Attempts outside assigned classroom return `403`.
- Cannot unlock parent or admin modes.
- Staff-assisted records store `assisting_staff_id` where applicable.

## Admin Permissions

- Unlocks with daycare admin or manager email and PIN.
- Demo accounts:
  - `admin@littlelantern.test / 123456`
  - `manager@littlelantern.test / 123456`
- Sees all organization classrooms and children.
- Can use full tablet attendance flow.
- Can assist any classroom.
- Super admin remains blocked from daily attendance tablet mode.

## Actor Vs Signer

- Actor is the account that unlocked the selected tablet mode.
- Signer is the person selected during the signing flow.
- Parent mode usually has the same actor and signer, unless an authorized pickup is selected.
- Staff mode records the staff/teacher actor and staff-assisted signer as appropriate.
- Admin mode records the admin/manager actor and the selected guardian, authorized pickup, or staff/admin signer.

## Daycare Sidebar Cleanup

Removed these duplicate main sidebar items:

- Absences
- Early Checkouts
- Missing Checkouts

Added/kept one unified item:

- Attendance Records

The Attendance Records page now has tabs:

- All records
- Checked in
- Checked out
- Absences
- Early checkouts
- Missing checkouts
- Corrections

Direct old routes redirect to filtered Attendance Records views:

- `/attendance/absences` -> `/attendance?view=absences`
- `/attendance/early-checkouts` -> `/attendance?view=early`
- `/attendance/missing-checkouts` -> `/attendance?view=missing`

## Files Changed

- `apps/backend/app/Http/Controllers/AuthController.php`
- `apps/backend/app/Http/Controllers/ApiController.php`
- `apps/backend/app/Console/Commands/DemoResetCommand.php`
- `apps/backend/database/seeders/DatabaseSeeder.php`
- `apps/backend/routes/api.php`
- `apps/mobile/app/kiosk.tsx`
- `apps/mobile/services/auth.ts`
- `packages/shared/src/api.ts`
- `apps/daycare-web/src/layouts/AppLayout.tsx`
- `apps/daycare-web/src/pages/AttendancePage.tsx`
- `apps/daycare-web/src/App.tsx`
- `apps/daycare-web/src/styles.css`
- `ATTENDANCE_PERMISSION_LOGIC.md`
- `OPERATOR_DEMO_SCRIPT.md`
- `TABLET_MODE_PERMISSIONS_REWORK_REPORT.md`

## Tests Passed

- `php artisan migrate`
- `php artisan barbaari:demo-reset`
- Parent mode unlock returned `200`.
- Staff mode unlock for staff returned `200`.
- Staff mode unlock for teacher returned `200`.
- Admin mode unlock returned `200`.
- Parent attempting staff mode returned `403`.
- Staff attempting admin mode returned `403`.
- Teacher attempting admin mode returned `403`.
- Super admin attempting admin mode returned `403`.
- Parent bootstrap returned only Amina-linked children and classrooms.
- Staff bootstrap returned Sunshine only and Samira only.
- Teacher bootstrap returned Blue Room only and Ayan only.
- Admin bootstrap returned all three classrooms and all three children.
- Parent direct access to unrelated child pickup signers returned `403`.
- Staff direct action against outside-classroom child returned `403`.
- Staff absence for assigned classroom child returned `201`.
- Parent absence attempt returned `403`.
- Parent checkout for linked child returned `200`.
- Admin check-in for any child returned `201`.

## Remaining Limitations

- Parent/guardian phone-based unlock is not fully wired; demo uses email plus password/PIN.
- Authorized pickup unlock without a user account is still future work.
- QR verification remains a blocked placeholder.
- Full simulator tap-through was smoke-started, but detailed visual tap automation is not currently scripted.
