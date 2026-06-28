# Tablet Attendance Geofence Enforcement Report

## What Changed

- Enforced backend geofence validation before tablet attendance actions are saved.
- Protected tablet check-in, check-out, and absence flows.
- Required tablet attendance submissions to include device latitude and longitude.
- Blocked attendance saves when:
  - Device location is missing.
  - Organization attendance location is not configured.
  - Device location is outside the configured organization attendance radius.
- Updated tablet frontend submission so GPS location is requested before submitting check-in, check-out, or absence.
- Stored absence device location metadata in audit logs because the current absence table does not expose dedicated latitude/longitude columns.
- Kept existing PIN and signature verification behavior unchanged.

## Backend Enforcement

- `apps/backend/app/Http/Controllers/ApiController.php`
  - `calculateLocationData()` now returns the required friendly validation messages:
    - `Device location is required for attendance.`
    - `Attendance location is not configured. Please update it in Settings.`
    - `You are outside the allowed attendance location radius.`
  - Tablet check-in and check-out continue using `calculateLocationData()` before attendance records are saved.
  - Tablet absence now validates latitude/longitude and calls `calculateLocationData()` before creating or updating an absence record.
  - Rejected location attempts are audited through the existing location rejection audit path.

## Frontend Enforcement

- `apps/daycare-web/src/pages/TabletPortalPage.tsx`
  - Tablet attendance now calls browser geolocation before submitting any action.
  - Check-in, check-out, and absence all send device latitude and longitude to the backend.
  - Existing PIN/signature collection remains unchanged.

- `packages/shared/src/api.ts`
  - `tabletApi.markAbsent()` now accepts optional latitude and longitude in the typed payload.

## Metadata Storage

- Check-in/check-out continue saving location metadata through the existing attendance record fields.
- Tablet absence stores device latitude, longitude, distance, and geofence result in the absence audit log metadata.
- No schema migration was added for this task.

## Tests Added

- `apps/backend/tests/Feature/TabletAttendanceGeofenceEnforcementTest.php`
  - Check-in inside radius saves.
  - Check-in outside radius is blocked.
  - Check-out inside radius saves.
  - Check-out outside radius is blocked.
  - Absence inside radius saves and writes location audit metadata.
  - Absence outside radius is blocked.
  - Missing device location is blocked.
  - Missing organization location is blocked.
  - Staff/admin/owner signer flow still works.
  - Guardian signer PIN/signature flow still works.

## Tests Passed

- `php artisan test --filter=TabletAttendanceGeofenceEnforcementTest`
  - 10 passed, 41 assertions.
- `php artisan test`
  - 24 passed, 135 assertions.
- `php -l apps/backend/app/Http/Controllers/ApiController.php`
  - No syntax errors detected.
- `npm --workspace @barbaari/daycare-web run typecheck`
  - Passed.

## Remaining Notes

- Browser GPS permission is required on tablet devices before an attendance action can be submitted.
- Existing organizations must have attendance latitude, longitude, and radius configured in Settings before tablet attendance can be saved.
- Absence-specific latitude/longitude columns were not added because audit metadata already supports storing the geofence result for this flow.
