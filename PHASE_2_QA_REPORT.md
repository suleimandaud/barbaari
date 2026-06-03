# Barbaari Phase 2 Attendance QA Report

Date: 2026-05-17

## Scope

Focused QA and polish pass for Phase 2 attendance workflows only:
- Daycare admin attendance workflow
- Staff attendance workflow
- Parent attendance workflow
- Guardian / authorized pickup signing
- PIN security
- Daycare web and mobile attendance UX

Not included:
- Stripe
- SMS/email/push providers
- DCYF export
- deployment
- advanced analytics

## Workflows Tested

### 1. Daycare Admin Attendance Workflow

Test account:
- `admin@littlelantern.test / Password123!`

Results:
- Admin login token worked.
- Existing demo child selection worked through API.
- Secure-login check-in for parent-linked child returned `201`.
- Secure-login check-out returned `200`.
- Attendance correction initially failed when the submitted correction time was future relative to backend UTC clock. This was a QA/UI polish issue, not a permission failure.
- Correction rerun with backend-safe time returned `200`.
- Attendance audit logs loaded and now include human-readable actor names.
- Absence creation for parent-linked child worked.
- Parent unread notification count increased after attendance/absence events.
- MySQL persistence confirmed through record counts.

### 2. Staff Attendance Workflow

Test account:
- `teacher@littlelantern.test / Password123!`

Results:
- Teacher login token worked.
- Assigned classroom children endpoint returned 1 child.
- Secure-login checkout for assigned child returned `200`.
- Teacher was blocked from checking in a child outside the assigned classroom: `403`.
- Invalid PIN returned `422`.
- Valid PIN verification worked.
- PIN-based checkout worked with a fresh verification ID.
- Reusing the same PIN verification was blocked: `422`.
- Teacher absence creation for assigned child returned `201`.

### 3. Parent Attendance Workflow

Test account:
- `parent@littlelantern.test / Password123!`

Results:
- Parent login token worked.
- Parent mobile attendance endpoint returned own child attendance records.
- Parent mobile absence endpoint returned own child absence records.
- Parent could sign own child attendance using guardian signing endpoint.
- Parent was blocked from signing attendance for another child: `403`.

### 4. Guardian / Authorized Pickup Workflow

Results:
- Pickup signer lookup for a child returned linked guardian and authorized pickup choices.
- Parent guardian signing returned `200`.
- Admin-assisted authorized pickup signing returned `200`.
- Unauthorized pickup attempt against the wrong child returned `403`.
- Attendance record saved signer name/type/method and signature hash/reference.
- Guardian signing audit log entries persisted.

### 5. PIN Security Workflow

Results:
- Valid PIN works.
- Invalid PIN fails with `422`.
- Reused PIN verification is blocked with `422`.
- Raw PIN storage is cleared; hashed PIN storage is used.
- Failed PIN attempts are logged.
- PIN logs persist in MySQL.

## API QA Summary

Focused API script results:

```text
admin_checkin:201
admin_checkout:200
correction_initial:422 due future UTC validation
correction_rerun:200
absence:200
teacher_children:1
teacher_secure_out:200
teacher_forbidden_child2:403
bad_pin:422
pin_out:200
pin_reuse:422
teacher_absence:201
parent_attendance:2
parent_absence:2
parent_sign:200
parent_other_sign:403
pickup_sign:200
bad_pickup:403
```

MySQL verification after QA:

```text
attendance=2
absences=2
audits=8
signed=1
pin_logs=2
failed_pin=1
absence_notifications=2
```

## Bugs Fixed

### 1. Daycare web lacked staff-assisted guardian signing action

Issue:
- Backend and mobile parent signing existed, but the daycare web Attendance page only displayed signature status. There was no clear staff-assisted front-desk/tablet signing action.

Fix:
- Added a `Guardian / pickup signing` action to the Attendance page.
- Added a modal that loads authorized signers for the selected child.
- Manager can select sign-in/sign-out, choose guardian or authorized pickup, enter typed signature, and save signed attendance.

Files changed:
- `apps/daycare-web/src/pages/AttendancePage.tsx`

### 2. Attendance audit log showed raw user IDs

Issue:
- Audit log modal showed `edited_by_user_id`, which is not manager-friendly.

Fix:
- Added `editedBy` relation on `AttendanceAuditLog`.
- API now includes actor name/email in audit payload.
- Daycare web audit modal now displays actor name.

Files changed:
- `apps/backend/app/Models/AttendanceAuditLog.php`
- `apps/backend/app/Http/Controllers/ApiController.php`
- `apps/daycare-web/src/pages/AttendancePage.tsx`

### 3. Correction modal could submit future local time

Issue:
- The browser local time could be ahead of the Laravel UTC clock, causing correction validation to fail as “future” even when the operator intended current local time.

Fix:
- Daycare web correction datetime inputs now cap at backend-safe UTC current datetime.
- Added a friendlier error message: `Correction time cannot be in the future.`

Files changed:
- `apps/daycare-web/src/pages/AttendancePage.tsx`
- `apps/daycare-web/src/utils/labels.ts`

### 4. Added full-screen kiosk/tablet attendance mode

Issue:
- The prior staff-assisted signing workflow was functional but lived inside the normal Attendance page/modal. It was not touch-friendly enough for a classroom tablet or front-desk flow.

Fix:
- Added a full-screen kiosk/tablet overlay from the Attendance page.
- Flow uses large touch targets and clear steps:
  - classroom
  - child
  - action
  - signer
  - verification method
  - typed signature
  - confirmation
- Supports:
  - check-in
  - check-out
  - mark absent
  - parent/guardian signer
  - authorized pickup signer
  - staff-assisted signer
  - secure login
  - PIN verification
  - QR placeholder clearly blocked/labeled
  - typed signature hash/reference
- The kiosk flow does not expose database IDs to the operator.

Files changed:
- `apps/daycare-web/src/pages/AttendancePage.tsx`
- `apps/daycare-web/src/styles.css`

### 5. Staff-assisted signing backend insert bug

Issue:
- Kiosk-equivalent API test for `signer_type=staff` returned `500` because `firstOrCreate` inserted an attendance record before required signer fields were present.

Fix:
- Updated the signed attendance creation path to include signer name, signer type, verification method, signature reference, and signature hash during record insert.

Files changed:
- `apps/backend/app/Http/Controllers/ApiController.php`

## Checks Run

Backend:
- `php artisan migrate`
- `php artisan barbaari:demo-reset`
- `php -l app/Http/Controllers/ApiController.php`
- `php -l app/Models/AttendanceAuditLog.php`

Frontend/mobile:
- `npm --workspace @barbaari/daycare-web run typecheck`
- `npm --workspace @barbaari/daycare-web run build`
- `npm --workspace @barbaari/mobile run typecheck`
- `npm --workspace @barbaari/super-admin run typecheck`
- `npm --workspace @barbaari/daycare-web run test:e2e`
- `npx expo start --ios --port 8082`

Results:
- All listed checks passed.
- Daycare Playwright smoke tests passed: `2 passed`.
- Expo bundled successfully.

Additional kiosk/tablet API verification:

```text
staff_signin:201
staff_signout:200
guardian_sign:200
pickup_sign:200
bad_pickup:403
absence:201
unread_before:2
unread_after:7
kiosk_signed=2
signed=2
audits=4
absences=2
```

Additional final checks:
- `npm --workspace @barbaari/daycare-web run typecheck`
- `npm --workspace @barbaari/daycare-web run build`
- `npm --workspace @barbaari/mobile run typecheck`
- `npm --workspace @barbaari/super-admin run typecheck`
- final `php artisan migrate`
- final `php artisan barbaari:demo-reset`

All passed.

## UI / UX Findings

Daycare web Attendance page:
- No raw child/classroom/guardian IDs are required for normal attendance, absence, correction, or signer selection.
- Child labels use the shared child label format with name, classroom, DOB, guardian, and child code.
- Absence form is understandable.
- Correction modal is understandable after UTC max-time polish.
- Guardian signing action is now visible and understandable.
- Full-screen kiosk/tablet mode is available from the Attendance page and uses large touch-friendly controls.
- Audit actor names are now human-readable.

Mobile:
- Parent attendance screen shows attendance and absence history.
- Parent signing is available from Attendance.
- Staff screen has real PIN verification and marks the next attendance action as PIN-based.
- Bottom navigation and safe area were not changed in this pass; Expo bundle passed.

## Drawn Signature Capture Polish

Focused kiosk/tablet signing polish was completed after the initial Phase 2 QA pass.

What changed:
- Daycare web kiosk/tablet mode now includes a large touch-friendly signature pad.
- Signers can draw with mouse, trackpad, or touch.
- Staff can clear and redraw the signature before submitting.
- Typed signer name is still kept as the signer identity.
- Drawn signature data is sent to the backend as a PNG data URL.
- Backend stores the signature image on Laravel's local disk under `attendance-signatures/{organization_id}/{child_id}/...png`.
- Backend validates the submitted data decodes as an actual image before storing it.
- `attendance_records.signature_reference` stores the saved file path.
- `attendance_records.signature_hash` stores a SHA-256 hash of the signature image bytes.
- Digital-signature attendance now rejects missing signature data unless the legacy typed-signature fallback is explicitly supplied.
- Attendance audit logs are still created for signed check-in/check-out actions.

Focused verification:

```text
missing_signature:422
guardian_drawn_checkout:200
staff_assisted_drawn_checkin:201
authorized_pickup_drawn_signing:200
unauthorized_pickup:403
typed_signature_fallback:201
valid_png_signature_after_image_validation:200
signature_file_exists:true
signature_hash_present:true
guardian_signing_audits:3
```

Checks after drawn signature capture:
- `php artisan migrate` passed with no pending migrations.
- `php artisan barbaari:demo-reset` passed and restored demo accounts.
- `npm --workspace @barbaari/daycare-web run typecheck` passed.
- `npm --workspace @barbaari/daycare-web run build` passed.
- `npm --workspace @barbaari/mobile run typecheck` passed.
- `npm --workspace @barbaari/super-admin run typecheck` passed.

## Remaining Attendance Risks

- Signature capture is now drawn and stored, but there is not yet a dedicated authenticated signature viewer/download screen for operators.
- Kiosk/tablet mode is now a full-screen operator flow, but it is not a locked-down device mode.
- QR verification remains a placeholder.
- PIN lockout exists, but needs broader automated tests and a manager unlock/reset workflow before production.
- Attendance supports one record per child per day. Multiple in/out sessions in one day are not modeled.
- Timezone policy needs product-level decision before production because Laravel validates against backend time.
- Daycare web kiosk flow is pilot-ready, but still uses typed signatures rather than drawn signatures.

## Pilot Readiness

Phase 2 attendance workflows are ready for a controlled client pilot with clear disclosure:
- in-app notifications are real
- documents are stored/downloaded
- absences are real
- staff PIN verification is real
- guardian/authorized pickup signing is recorded with drawn signature capture

Not production-ready yet:
- no real QR verification
- no dedicated signature review/download workflow
- no kiosk lock-down mode
- no DCYF/WCCC export bundle
- no anti-fraud/anomaly workflow

Recommended before showing a daycare operator:
1. Use the full-screen kiosk/tablet mode from the Attendance page.
2. Explain that drawn signatures are stored and hashed, but formal signature review/download screens are still limited.
3. Avoid presenting QR as complete; the UI blocks it as a placeholder.
4. Confirm timezone expectations for the daycare location.
