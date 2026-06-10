# Guardian PIN Signer Flow Report

## Summary

Tablet/kiosk attendance now treats guardians as selected signers, not login users. A provider staff/admin/owner unlocks the tablet, chooses a child, chooses a guardian signer, verifies that guardian's tablet PIN from the `guardians.pin_hash` field, captures a signature, and submits attendance.

## Root Cause

The old implementation mixed two models:

- Guardian records stored guardian details and sometimes a `pin_hash`.
- Tablet unlock/signing still expected linked `users` rows with `role=parent`, active status, and `users.pin_hash`.

That caused guardians with a valid guardian PIN to fail tablet flows if their linked user was pending/inactive/missing. It also forced an email invite/login model that the product no longer wants.

## Backend Fix

- Guardian signer list now reports `pin_configured` from `guardians.pin_hash`.
- Guardian signer list no longer exposes guardian email.
- `POST /api/tablet/signers/verify-pin` resolves guardian signers from the selected child's linked active guardians.
- Guardian PIN verification uses `guardians.pin_hash`.
- Guardian PIN logs use a guardian-specific purpose:
  - `tablet_signer:guardian:{guardian_id}`
- Attendance save consumes the same guardian-specific PIN verification log.
- Missing guardian PIN returns:
  - `This signer does not have a tablet PIN yet. Please set a PIN first.`
- Wrong guardian PIN returns:
  - `Incorrect signer PIN.`
- Parent/guardian account unlock is blocked:
  - `Parents and guardians do not unlock tablet mode. Ask provider staff to open the tablet and select you as the signer.`

## Tablet Flow

Current tablet flow:

1. Staff/teacher/admin/owner unlocks the tablet.
2. Center Daycare: select classroom, then child.
3. Family Child Care: select child directly.
4. Select check-in/check-out/absence.
5. Select signer.
6. Enter selected signer PIN.
7. Capture signature.
8. Submit.

Guardian signing:

- Uses `Guardian` model/table.
- Uses `guardians.pin_hash`.
- Does not require guardian email.
- Does not require guardian user account.
- Does not require invite acceptance.
- Still enforces child-guardian link and pickup authorization.

## Expo Kiosk Changes

- Removed parent/guardian unlock mode from Expo kiosk.
- Staff/admin unlock remains.
- Guardian is selected later as signer.
- Expo kiosk now calls tablet signer list endpoint and selected signer PIN verification.
- Absence now follows the same signer -> PIN -> signature path.

## Files Changed

- `apps/backend/app/Http/Controllers/ApiController.php`
- `apps/backend/app/Http/Controllers/AuthController.php`
- `apps/daycare-web/src/pages/TabletPortalPage.tsx`
- `apps/mobile/app/kiosk.tsx`
- `apps/mobile/services/auth.ts`
- `apps/mobile/services/mobileApi.ts`

## Targeted API Verification

- Created no-email guardian linked to Ayan Hassan: passed.
- Tablet admin unlock with `admin@littlelantern.test`: passed.
- `GET /api/tablet/children/33/signers` includes linked guardians and Blue Room teacher: passed.
- New guardian signer appears with `email: null` and `pin_configured: true`: passed.
- Wrong guardian PIN returns 422 with clear error: passed.
- Correct guardian PIN returns 200 and a `pin_verification_id`: passed.
- Missing guardian PIN returns 422 with clear missing-PIN message: passed.
- Parent account tablet unlock is blocked with clear message: passed.
- Tablet guardian check-in using guardian PIN verification and geofence coordinates saved attendance: passed.

## Remaining Notes

- The old `/api/tablet/children/{child}/pickup-signers` endpoint remains for backward compatibility, but the updated tablet flows use `/api/tablet/children/{child}/signers`.
- Legacy parent-user mobile areas may still exist in code for old features, but the current attendance tablet signer flow no longer relies on parent/guardian login.
