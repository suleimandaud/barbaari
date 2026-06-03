# Attendance Operations Redesign Report

## Summary

Barbaari now presents daycare attendance work through one main daycare web page, `Attendance Operations`, and the tablet/kiosk flow has been polished around the attendance-first mode model. Absence records now carry a validated absence type from the web/tablet UI through the API, database, reports, and audit activity.

## Sidebar Pages Unified

The daycare web sidebar no longer shows these as separate main items:

- Live Check-ins
- Kiosk / Tablet Mode
- Attendance Records

They are unified under:

- Attendance Operations

Old routes are preserved as redirects:

- `/live-check-ins` -> `/attendance-operations?tab=live`
- `/kiosk` -> `/attendance-operations?tab=kiosk`
- `/attendance` -> `/attendance-operations?tab=records`
- `/attendance/absences` -> `/attendance-operations?tab=absences`
- `/attendance/early-checkouts` -> `/attendance-operations?tab=early`
- `/attendance/missing-checkouts` -> `/attendance-operations?tab=missing`

## Attendance Operations Tabs

The new page includes:

- Live Status
- Kiosk / Tablet
- Records
- Absences
- Early Checkouts
- Missing Checkouts
- Corrections

Live Status summarizes currently checked-in children, checked-out children, absences, missing checkouts, early checkouts, and recent check-in/check-out activity. Kiosk / Tablet launches the tablet app and explains the Parent / Guardian, Staff, and Admin tablet modes. Records, Absences, Early Checkouts, Missing Checkouts, and Corrections reuse the existing attendance data with tab-specific filters and panels.

## Absence Type Recording

Absence type is stored in:

- Table: `absence_records`
- Field: `absence_type`

Supported API values:

- `excused`
- `unexcused`
- `sick`
- `vacation`
- `no_show`
- `other`

Display labels:

- Excused
- Unexcused
- Sick
- Vacation
- No-show
- Other

`POST /api/tablet/absence-records` and the manager absence endpoint validate the value and reject unsupported types. The API also accepts `date` as an alias for `absence_date` for tablet payloads.

Absence type is now shown in:

- Attendance Operations Absences tab
- Tablet/kiosk confirmation screen
- Attendance Reports absence section
- Attendance audit activity for absence creation/update

## Tablet / Kiosk Design

The tablet/kiosk screen was restyled for a calmer iPad-first attendance kiosk:

- Large mode cards with icons
- Clear selected state
- Touch-friendly spacing
- Elevated top bar
- Larger classroom/child/action cards
- Staff assigned-classroom notice
- Child cards with code, classroom, age/DOB, guardian, and status
- Action colors by attendance intent
- Larger signature pad
- Absence type cards plus reason/notes fields
- Confirmation screen includes absence type when applicable

Brand colors used:

- Primary: `#2A7B88`
- Secondary: `#FF9E80`
- Tertiary: `#FFD54F`
- Neutral: `#455A64`
- Dark text: `#0E2A33`
- Light background: `#F3FBFD`

## Permission Model

Existing mode permissions remain in place:

- Parent / Guardian mode: parent/guardian sees only linked children and their classrooms.
- Staff mode: staff/teacher sees only assigned classroom children.
- Admin mode: daycare admin/manager sees all organization classrooms and children.
- Super admin remains blocked from daily attendance tablet mode.

## Files Changed

- `apps/backend/app/Http/Controllers/ApiController.php`
- `apps/daycare-web/src/App.tsx`
- `apps/daycare-web/src/layouts/AppLayout.tsx`
- `apps/daycare-web/src/pages/AttendancePage.tsx`
- `apps/daycare-web/src/pages/ReportsPage.tsx`
- `apps/mobile/app/kiosk.tsx`
- `e2e/daycare.spec.ts`
- `ATTENDANCE_PERMISSION_LOGIC.md`
- `OPERATOR_DEMO_SCRIPT.md`
- `ATTENDANCE_OPERATIONS_REDESIGN_REPORT.md`

## Tests Passed

- `php artisan migrate`
- `php artisan barbaari:demo-reset`
- `php -l apps/backend/app/Http/Controllers/ApiController.php`
- API: admin tablet unlock returned 200
- API: `POST /api/tablet/absence-records` with `absence_type=sick` returned 201
- API: `POST /api/tablet/absence-records` with `absence_type=vacation` returned 201
- API: invalid `absence_type=field_trip` returned 422
- API/model verification confirmed `sick,vacation` persisted in `absence_records.absence_type`
- API: attendance audit logs include absence type activity
- `npm --workspace @barbaari/mobile run typecheck`
- `npm --workspace @barbaari/daycare-web run typecheck`
- `npm --workspace @barbaari/daycare-web run build`
- `npm --workspace @barbaari/super-admin run typecheck`
- `npm --workspace @barbaari/daycare-web run test:e2e`
- `npm --workspace @barbaari/super-admin run test:e2e`
- `npx expo start --ios --port 8082 --clear` bundled successfully for the iPad simulator

## Remaining Limitations

- Expo/iPad was verified by simulator launch and bundle success; full manual tap-through still needs a human pass on the simulator/device.
- Parent phone unlock and standalone authorized-pickup unlock remain future work.
- QR verification is still a labeled placeholder.
- The internal daycare web kiosk modal remains an admin convenience workflow; the mobile/tablet app is the primary kiosk experience.
