# Facility Types Rework Report

## Summary

Barbaari now supports two organization facility types:

- `center_daycare`
- `family_child_care`

The existing Little Lantern demo organization remains `center_daycare`, so the current classroom-based attendance dashboard and tablet flow remain intact. New family child care organizations can be created through a public registration application, approved by Super Admin, invited into the platform, placed behind the existing subscription payment gate, and routed into a simplified provider dashboard without classroom requirements.

## Backend Changes

- Added `organizations.facility_type` with default `center_daycare`.
- Added pricing plan availability flags:
  - `available_for_family_child_care`
  - `available_for_center_daycare`
- Added `facility_registration_applications` for public provider registration requests.
- Added `FacilityRegistrationApplication` model.
- Added public application endpoints:
  - `GET /api/public/pricing-plans`
  - `POST /api/registration-applications`
- Added Super Admin application review endpoints:
  - `GET /api/platform/registration-applications`
  - `POST /api/platform/registration-applications/{application}/approve`
  - `POST /api/platform/registration-applications/{application}/reject`
  - `POST /api/platform/registration-applications/{application}/follow-up`
- Approval converts an application into:
  - organization with selected `facility_type`
  - pending subscription
  - initial platform invoice
  - owner/admin invitation
- Organization payloads now include `facility_type` and label fields.
- Tablet bootstrap now returns:
  - `facility_type`
  - `uses_classrooms`
  - facility-aware scope labels
- Child, attendance, absence, and audit payloads now display `Family child care` where classroom is intentionally not used.

## Super Admin Changes

- Added Registration Applications page.
- Added application review modal with approve, reject, and follow-up actions.
- Organization onboarding now captures `facility_type`.
- Pricing Plans page now controls which facility types can use each plan.
- Organizations and organization details show facility type.

## Daycare Web Changes

- Added public provider registration routes:
  - `/register`
  - `/apply`
- Daycare layout now switches navigation by organization facility type.
- `center_daycare` keeps the full attendance operations navigation.
- `family_child_care` uses simplified navigation:
  - Dashboard
  - Children
  - Parents / Guardians
  - Attendance
  - Tablet / Kiosk Mode
  - Reports / Audit
  - Subscription / Billing
  - Settings
- Children page no longer requires or shows classroom assignment for family child care.
- Attendance Operations hides classroom filters/forms for family child care.
- Reports use child/date/status-based content for family child care.
- Settings/Profile shows facility type.

## Tablet/Kiosk Changes

- Center daycare keeps classroom-first flow.
- Family child care skips classroom selection and starts from children.
- Admin/owner sees all family child care children.
- Parent/guardian sees only linked children.
- Guardian and admin tablet unlock continue using the existing secure auth endpoints.

## Migration Added

- `apps/backend/database/migrations/2026_06_06_000001_add_facility_types_and_registration_applications.php`

## Tests Passed

- `php artisan migrate`
- `php artisan route:list`
- `php artisan config:clear`
- `php artisan cache:clear`
- `php artisan barbaari:demo-reset`
- `npm --workspace @barbaari/daycare-web run typecheck`
- `npm --workspace @barbaari/daycare-web run build`
- `npm --workspace @barbaari/super-admin run typecheck`
- `npm --workspace @barbaari/super-admin run build`
- `npm --workspace @barbaari/mobile run typecheck`

## Targeted Verification

- Public family child care application created successfully.
- Super Admin approval created a family child care organization.
- Owner invite accepted and subscription moved to pending payment.
- Payment gate blocked operational APIs until payment activation.
- Local test payment activated organization and subscription.
- Family child care child creation succeeded without `classroom_id`.
- Guardian invite/PIN flow worked for linked family child care child.
- Family tablet bootstrap returned `uses_classrooms=false`.
- Center daycare tablet bootstrap still returned classrooms and classroom child counts.
- Family child care attendance, absence, and audit payloads show `Family child care` instead of `Unassigned`.

## Remaining Risks

- Staging deployment still needs environment variables set correctly on the hosted backend and frontend build process.
- Manual staging QA should confirm routing and CORS with the live domains.
- Family child care staff workflows are intentionally minimal; owner/admin and guardian workflows are the current priority.
