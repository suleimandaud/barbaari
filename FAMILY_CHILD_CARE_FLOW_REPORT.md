# Family Child Care Flow Report

## Overview

Family Child Care is now a first-class Barbaari facility type. It is designed for home-based providers who do not use classrooms. The flow keeps attendance, signatures, geofence verification, reports, audit, notifications, and subscription billing, but removes classroom-based workflow from the main provider experience.

## Registration and Approval

1. Provider opens `/register` or `/apply`.
2. Provider selects `Family Child Care`.
3. Provider enters business/facility details, owner/admin contact, location, optional license, desired plan, billing cycle, and notes.
4. Backend creates a pending registration application.
5. Super Admin reviews the application in Registration Applications.
6. Super Admin approves the application.
7. Approval creates:
   - family child care organization
   - owner/admin invitation
   - pending subscription
   - initial invoice
8. Owner accepts invite and creates password.
9. Owner logs in and sees subscription payment gate.
10. After payment activation, the family child care dashboard loads.

## Family Dashboard

Family child care providers see a simplified navigation:

- Dashboard
- Children
- Parents / Guardians
- Attendance
- Tablet / Kiosk Mode
- Reports / Audit
- Subscription / Billing
- Settings

Classrooms and classroom assignment pages are hidden because they are not needed for this facility type.

## Children and Guardians

- Child creation does not require `classroom_id`.
- Child payloads use `Family child care` as the facility label when no classroom exists.
- Guardian creation, invitation, PIN setup, and child linking continue to work.
- Guardian users can unlock tablet parent/guardian mode and only see linked children.
- Child code generation remains organization-code based and globally unique.

## Tablet/Kiosk Behavior

For `family_child_care`:

- Tablet bootstrap returns `uses_classrooms=false`.
- Mode flow skips classroom selection.
- Admin/owner mode starts at child selection and sees all children in the organization.
- Parent/guardian mode starts at child selection and sees only linked children.
- Attendance actions still support:
  - check-in
  - check-out
  - absence
  - signatures
  - geofence/location verification
  - audit logs

For `center_daycare`, the existing classroom-first tablet flow remains unchanged.

## Attendance and Geofence

Family child care attendance uses the organization’s configured home/provider location:

- latitude
- longitude
- allowed attendance radius

The same backend geofence verification is used as center daycare. If location is not configured, attendance actions return a clear validation error. If the user is outside the allowed radius, the backend blocks the action and records the attempt through existing audit/alert pathways.

## Reports

Family child care reports remain active and are child-based instead of classroom-based:

- daily attendance
- check-in/check-out history
- absence records
- guardian/parent signature records
- geofence blocked attempts through audit logs
- audit history

Classroom filters and classroom summaries are hidden for family child care.

## Subscription/Billing

Family child care uses the same Barbaari platform subscription flow as center daycare:

- current plan
- subscription status
- billing cycle
- next invoice date
- open invoices
- paid invoices
- payment history
- amount due
- overdue warning
- Stripe/test payment flow where configured

## Verified Locally

- Family provider application created.
- Application approved into organization.
- Invite accepted.
- Subscription payment gate blocked operational APIs before activation.
- Test payment activated organization.
- Dashboard APIs became available after activation.
- Child created without classroom.
- Guardian linked and activated.
- Guardian PIN unlock returned only linked child.
- Admin tablet unlock returned all family children.
- Attendance and absence records worked without classroom.
- Audit logs showed `Family child care`.

## Remaining Limitations

- Live email delivery depends on production/staging mail credentials and queue worker.
- Live Stripe Checkout/webhook verification depends on staging Stripe test keys and webhook secret.
- Family child care staff workflows are not deeply specialized yet; admin/owner and guardian flows are implemented.
