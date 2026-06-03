# Barbaari Attendance Permission Logic

Barbaari is designed to support common childcare attendance compliance workflows. Final legal compliance depends on each state’s licensing and subsidy rules.

## 1. Attendance States

- **Not checked in**: No attendance record exists for the child today.
- **Checked in**: The child has a check-in time today and no check-out time yet.
- **Checked out**: The child has both check-in and check-out times today.
- **Checked out early**: The child has both check-in and check-out times today, and the check-out time is before the configured daycare day end time. The default day end time is `17:00`.
- **Absent**: A separate absence record exists for the child and date.
- **Missing checkout**: The child was checked in but no check-out was recorded after the expected day end time.

## 2. Important Differences

- **Absent** means staff/admin recorded that the child did not attend for a date.
- **Not checked in yet** means no attendance has been recorded today. It is not automatically an absence.
- **Checked out early** means the child attended part of the day and left before the normal day end. It is not an absence.
- **Missing checkout** means the child was checked in but no checkout was recorded when one should exist.

## 3. Who Can Check In

- Parent linked to the child.
- Guardian linked to the child.
- Authorized pickup linked to the child.
- Staff/teacher for assigned or visible classroom children.
- Daycare admin/manager for children in their organization.
- Tablet/kiosk users only after unlocking the selected tablet mode with a role appropriate to that mode.

## 4. Who Can Check Out

- Parent linked to the child.
- Guardian linked to the child.
- Authorized pickup linked to the child.
- Staff-assisted checkout when daycare policy allows staff to help record the signer.
- Daycare admin/manager for children in their organization.
- Tablet/kiosk checkout must still identify the signer and block unauthorized pickup people.

## 5. Who Can Mark Absent

- Daycare admin/manager can mark absences for the organization.
- Teacher/staff can mark absences for assigned or visible classroom children.
- Parent absence reporting may be added later. In the current pilot model, parents can view absences but do not finalize attendance absences.
- Absence records must store an absence type in `absence_records.absence_type`.
- Supported absence type values are `excused`, `unexcused`, `sick`, `vacation`, `no_show`, and `other`.
- Invalid absence type values are rejected by the attendance APIs.
- Attendance Operations, Attendance Reports, and Attendance Audit Logs display the saved absence type so the reason category remains visible after recording.

## 6. Who Should Not Manage Daily Attendance

- Super admin should not normally check children in/out or mark daycare-level absences. Super admin manages platform accounts, subscriptions, settings, and support.
- Super admin, billing manager, and support staff accounts cannot unlock daily attendance tablet modes.

## 7. Actor vs Signer

- **Actor**: The logged-in user who performed the system action.
- **Signer**: The person responsible for drop-off or pickup.

Example:

```text
Actor: Blue Room Teacher
Signer: Amina Hassan
Signer type: Guardian
Verification: Drawn signature
```

This distinction matters because staff may operate the tablet while the parent/guardian signs.

For tablet/iPad attendance mode:

- Actor is the account that unlocked the selected tablet mode.
- Signer is selected from the child’s authorized guardians/pickups, the staff helper, or the admin/manager depending on the mode.
- Staff-assisted does not turn the staff user into a parent/guardian. It records that staff helped complete the signing workflow while actor and signer remain separate.
- Signer name and signature data must remain attached to the attendance record separately from actor identity.

## 8. Tablet Unlock And Mode Permissions

Tablet unlock uses `POST /api/auth/tablet-unlock` with `mode` plus the credential fields for that mode.

Mode unlock rules:

- `guardian`: parent/guardian account with `password_or_pin`. Demo uses `parent@littlelantern.test / Password123!` and `omar@example.test / Password123!`.
- `staff`: staff or teacher account with staff PIN. Demo uses `teacher@littlelantern.test / 123456` and `staff@littlelantern.test / 123456`.
- `admin`: daycare admin or manager account with admin/manager PIN. Demo uses `admin@littlelantern.test / 123456` and `manager@littlelantern.test / 123456`.

Blocked cross-mode examples:

- Parent cannot unlock staff/admin mode.
- Staff and teacher cannot unlock parent/admin mode.
- Daycare admin/manager cannot unlock staff mode as if they were assigned classroom staff.
- Super admin cannot unlock any daily attendance tablet mode.

Mode permissions:

- **Parent / Guardian sign-in/out**: only linked children and their classrooms are visible. Parent/guardian can check in/out linked children and sign with drawn signature. They cannot mark absences.
- **Staff mode**: only the assigned classroom and assigned classroom children are visible. Staff/teacher can check in/out and mark absent for that classroom. Attempts outside the assigned classroom are blocked.
- **Admin mode/settings**: daycare admin/manager can view all classrooms and children, use full attendance operations, and assist any classroom.

## 9. Verification Methods

- **Secure login**: The logged-in user session verifies the actor.
- **PIN**: A staff PIN verification is completed and logged before the action.
- **Drawn signature**: A signature image is captured, stored, and hashed.
- **Digital signature / signature image**: The saved drawn signature artifact and hash on the attendance record.
- **QR placeholder**: QR is labeled in the demo but is not production-connected yet.

## 10. Security Rules

- Parent can only manage/sign attendance for their own linked child.
- Guardian or authorized pickup must be linked to the child.
- Teacher/staff can operate only assigned or visible classroom children.
- Manager/admin can operate children in their daycare organization.
- Unauthorized pickup is blocked.
- Future attendance is blocked.
- Attendance correction requires a reason and creates an audit log.
- Signer identity, signer type, verification method, device/signature references, and audit entries should be retained.
- Kiosk/tablet mode must not expose billing, incidents, daily notes, documents, or general messages as primary workflows.
- QR is a labeled placeholder and must not be treated as completed production verification.

## 11. Attendance-First Active Modules

The active attendance-first surface is:

- Children: child name, child code, DOB/age, classroom, guardians, attendance status.
- Guardians / Authorized Pickups: name, contact, relationship, pickup permission, active status, linked child.
- Classrooms: assigned staff, children count, present count, absent count.
- Staff Access: role, assigned classroom, PIN status, active status, tablet/kiosk permission.
- Attendance: check-in, checkout, early checkout, absence, missing checkout, corrections, audit logs.
- Devices / Tablets: device name, classroom/location, last active, assigned kiosk/tablet status.
- Reports: attendance summaries, date ranges, signature records, audit history.

## 12. State / Legal Note

Barbaari is designed to support common childcare attendance compliance workflows. Final legal compliance depends on each state’s licensing and subsidy rules.

## 13. Remaining Production Improvements

- State-specific compliance settings.
- DCYF/WCCC exports.
- Record retention policy.
- Locked kiosk mode.
- Real QR verification.
- Production cloud storage for documents/signatures.
- Multi-session attendance if a child leaves and returns the same day.
- More detailed scheduled day start/end and classroom-specific schedules.
