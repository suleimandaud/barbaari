# Tablet / Kiosk Flow Rework Report

## Summary

The tablet/kiosk portal was reworked from a mode-card workflow into a reception-style attendance workflow:

1. Unlock the provider account.
2. Load the organization only if the organization and subscription are active.
3. Start from classrooms for Center Daycare.
4. Start from children for Family Child Care.
5. Select action.
6. Select signer.
7. Verify signer PIN.
8. Capture signature.
9. Submit attendance.

The old verification choice cards were removed from the tablet portal. QR is not shown as an operational choice.

## Backend/API Changes

Added tablet-specific signer support:

- `GET /api/tablet/children/{child}/signers`
- `POST /api/tablet/signers/verify-pin`

Updated tablet unlock:

- `POST /api/auth/tablet-unlock` now accepts a single account credential flow without requiring `mode`.
- Backend infers mode from role:
  - `parent` -> guardian scope
  - `staff` / `teacher` -> staff scope
  - `daycare_admin` / `manager` -> admin scope

Updated tablet bootstrap:

- `GET /api/tablet/bootstrap` now infers the mode from the authenticated user if `mode` is omitted.
- Returns `facility_type`, `uses_classrooms`, scoped classrooms, scoped children, guardians, staff, attendance, and absences.

Signer list rules:

- Center Daycare:
  - linked guardians/parents for the selected child
  - active staff/teachers assigned to the child's classroom
- Family Child Care:
  - linked guardians/parents for the selected child
  - active owner/admin users for the organization

PIN enforcement:

- Signer PIN is verified against the selected signer, not only the tablet actor.
- Missing PIN returns: `This signer does not have a tablet PIN yet. Please set a PIN first.`
- Wrong PIN returns: `Incorrect signer PIN.`
- Attendance check-in/check-out and tablet absence require a PIN verification record before saving.

## Center Daycare Flow

After unlock, Center Daycare opens at classroom selection.

Flow:

1. Select classroom.
2. Select child.
3. Select check-in, check-out, or absence.
4. Select signer from linked guardians and assigned classroom staff/teacher.
5. Enter signer PIN.
6. Enter signature.
7. Submit.

Verified locally:

- `admin@littlelantern.test / 123456` unlocks as admin.
- Bootstrap returned `uses_classrooms: true`.
- Classroom counts returned:
  - Blue Room: 1
  - Sunshine: 1
  - Toddler Nest: 1
- `staff@littlelantern.test / 123456` unlocks as staff and sees only Sunshine/Samira.
- `GET /api/tablet/children/34/signers` returned Amina Hassan and Staff Assistant.
- Wrong signer PIN returned 422.
- Correct staff signer PIN returned a `pin_verification_id`.

## Family Child Care Flow

After unlock, Family Child Care opens directly at child selection.

Flow:

1. Select child.
2. Select check-in, check-out, or absence.
3. Select signer from linked guardians and owner/admin.
4. Enter signer PIN.
5. Enter signature.
6. Submit.

Verified locally:

- Created and approved a Family Child Care registration.
- Accepted owner invite.
- Unpaid organization was blocked from tablet unlock with HTTP 402.
- Local test payment activated the subscription and organization.
- Child creation worked without `classroom_id`.
- Tablet unlock worked after activation.
- Bootstrap returned `uses_classrooms: false`, no classrooms, and the family child list.
- Family signer list included the owner/admin signer.
- Missing owner/admin PIN returned the required clear 422 message.

## Geofence

Tablet check-in/check-out still requests browser geolocation and sends `latitude` / `longitude` to the backend. Backend geofence validation remains authoritative.

Absence records now require signer PIN and signature in tablet mode, but absence records do not currently store location metadata.

## Files Changed

- `apps/backend/app/Http/Controllers/AuthController.php`
- `apps/backend/app/Http/Controllers/ApiController.php`
- `apps/backend/routes/api.php`
- `apps/daycare-web/src/pages/TabletPortalPage.tsx`
- `packages/shared/src/api.ts`

## Remaining Notes

- Newly invited owner/admin users do not automatically receive a tablet PIN. They must set one before owner/admin can be selected as a signer.
- The tablet signature screen currently captures a required typed signature name/reference. A drawn canvas signature can be added later if the web tablet portal must match the mobile drawn-signature pad exactly.
- Staging must set `DAYCARE_WEB_URL=https://barbaari.pioneeriya.com` so generated invite links do not inherit local development values from `.env`.

