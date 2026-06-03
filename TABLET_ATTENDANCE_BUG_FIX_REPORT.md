# Tablet Attendance Bug Fix Report

Date: 2026-05-24

## Summary

Fixed the two manual-testing bugs in the attendance/tablet flow:

- Attendance times now display in the daycare attendance timezone instead of raw UTC.
- Tablet classroom counts and child lists now come from one consistent tablet bootstrap payload with explicit mode permissions.

## Timezone Cause

Attendance records were stored with UTC timestamps, but the backend serialized `check_in_time` and `check_out_time` using `format('H:i')` directly on the stored value. That leaked UTC clock time to Daycare Web and mobile/tablet clients.

Example of the bug:

- Stored UTC: `06:28`
- Expected daycare local time: `09:28`
- UI showed `06:28`

The demo seed also created its prefilled attendance record using a UTC wall-clock time. That made the seeded Blue Room record display wrong after timezone-aware serialization.

## Timezone Used

Default attendance timezone: `Africa/Nairobi`

The backend now reads:

- `organization_settings.attendance_policy.attendance_timezone`
- fallback: `Africa/Nairobi`

Demo reset and the database seeder set:

```json
{
  "attendance_timezone": "Africa/Nairobi"
}
```

## Timezone Fix

The backend still stores timestamps in UTC, but attendance payloads now return:

- `checkInAt`: UTC ISO timestamp
- `checkOutAt`: UTC ISO timestamp
- `checkInLocal`: local ISO timestamp in attendance timezone
- `checkOutLocal`: local ISO timestamp in attendance timezone
- `checkInTime`: local `HH:mm`
- `checkOutTime`: local `HH:mm`
- `timezone`: attendance timezone

Early checkout and missing checkout status now compare against the daycare local time and local attendance date.

Verified via API:

```text
checkInAt=2026-05-24T06:48:24.000000Z
checkInLocal=2026-05-24T09:48:24+03:00
checkInTime=09:48
timezone=Africa/Nairobi
```

## Classroom Loading/Count Cause

The tablet was loading data from separate staff-valid endpoints:

- `/children`
- `/classrooms`
- `/attendance`
- `/absence-records`
- `/guardians`

For `staff@littlelantern.test`, `/children` returned assigned-classroom children only, while `/classrooms` returned all organization classrooms. The UI then counted visible children inside all classrooms, which produced:

- Blue Room: 0
- Sunshine: 1
- Toddler Nest: 0

That was technically staff-scoped child data mixed with all-org classroom data, but the tablet UI presented it as front-desk mode.

There was a second permission gap: after front-desk loading, signer lookup, signed check-in/out, and mark-absent still used assigned-classroom authorization. That would break the full tablet flow for Blue Room/Toddler Nest when unlocked as basic staff.

## Tablet Permissions Now

Added one consistent tablet bootstrap endpoint:

```text
GET /api/tablet/bootstrap?mode=guardian
GET /api/tablet/bootstrap?mode=staff
```

Mode behavior:

- `guardian` / front desk mode: all organization children and classrooms for staff, teacher, manager, and daycare admin.
- `staff` mode: assigned classroom only for basic staff/teacher.
- manager/daycare admin: all organization children.

The payload includes:

- unlocked user
- mode
- scope
- scope label
- timezone
- local date
- visible classrooms
- visible children
- local-day attendance records
- local-day absence records
- guardians for visible children

Added tablet-specific operation endpoints so front-desk tablet mode can complete the full flow:

- `GET /api/tablet/children/{child}/pickup-signers`
- `POST /api/tablet/attendance/guardian-check-in`
- `POST /api/tablet/attendance/guardian-check-out`
- `POST /api/tablet/absence-records`

These endpoints require staff/teacher/daycare_admin/manager auth and still restrict access to the user’s organization.

## Verified Classroom Counts

After demo reset, tablet front-desk mode with `staff@littlelantern.test / 123456` returns:

```text
Front desk mode: all organization children
Blue Room: 1
Sunshine: 1
Toddler Nest: 1
Children: Ayan Hassan, Samira Hassan, Muna Ali
```

Staff mode with the same account returns:

```text
Staff mode: assigned classroom only
Sunshine: 1
Children: Samira Hassan
```

## Verified Attendance Flow By API

Using tablet endpoints after staff PIN unlock:

- Ayan signer lookup returned `200`.
- Samira check-in returned `201`.
- Samira attendance returned local check-in `09:48` in `Africa/Nairobi`.
- Muna mark absent returned `201`.
- Admin attendance API returned Samira and Ayan with local display times.

Permission checks:

- `staff@littlelantern.test / 123456`: `200`
- `teacher@littlelantern.test / 123456`: `200`
- wrong staff PIN: `422`
- `parent@littlelantern.test / 123456`: `403`

## Files Changed

- `apps/backend/app/Http/Controllers/ApiController.php`
- `apps/backend/routes/api.php`
- `apps/backend/app/Console/Commands/DemoResetCommand.php`
- `apps/backend/database/seeders/DatabaseSeeder.php`
- `packages/shared/src/api.ts`
- `packages/shared/src/datetime.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/types.ts`
- `apps/mobile/services/mobileApi.ts`
- `apps/mobile/app/kiosk.tsx`
- `apps/mobile/utils/attendanceSummary.ts`
- `apps/daycare-web/src/pages/AttendancePage.tsx`
- `apps/daycare-web/src/pages/AuditLogsPage.tsx`
- `apps/daycare-web/src/pages/DashboardPage.tsx`

## Tests Passed

- `php artisan migrate`
- `php artisan barbaari:demo-reset`
- Direct API tablet PIN login checks
- Direct API tablet bootstrap checks
- Direct API tablet signer/check-in/absence checks
- Direct API manager attendance timezone check
- `npm --workspace @barbaari/mobile run typecheck`
- `npm --workspace @barbaari/daycare-web run typecheck`
- `npm --workspace @barbaari/daycare-web run build`
- `npm --workspace @barbaari/super-admin run typecheck`
- `npx expo start --ios --port 8082 --clear`

## Remaining Limitations

- Tablet signature drawing still sends the existing tablet signature representation rather than a production native PNG signature artifact.
- The browser and simulator were launched locally, while detailed visual interaction was verified primarily through the same API endpoints used by the tablet and daycare web apps.
- State-specific attendance export rules remain out of scope.
