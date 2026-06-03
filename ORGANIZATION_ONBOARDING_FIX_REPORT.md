# Organization Onboarding Fix Report

## What Was Wrong

The old Super Admin organization form only collected:

- Name
- City
- License
- Plan

That was not enough to create a usable daycare tenant. The plan was free text, license was treated like a basic required-ish text field, and no login users were created. A new organization could exist without a daycare admin account, which meant it could not actually log in.

## License Field Decision

License number is now optional during organization creation.

New organization fields:

- `license_number`
- `license_status`

Supported license statuses:

- `not_provided`
- `pending`
- `verified`
- `rejected`
- `expired`

If the license number is blank during onboarding, the organization is created with `license_status=not_provided` unless another valid status is explicitly selected.

## Plan Dropdown Implementation

Super Admin onboarding now loads plans from `pricing_plans`.

The plan field is a dropdown, not free text. It shows real plan data such as:

- Starter - `$99/month`
- Growth - `$349/month`
- Enterprise - `$799/month`

On submit, the frontend sends:

- `pricing_plan_id`
- `billing_cycle`

The backend creates the organization subscription from the selected pricing plan.

## Multi-User Organization Login Logic

One organization supports many login users through:

- `users.organization_id = organizations.id`

Onboarding creates:

- One required primary `daycare_admin`
- Optional extra users with roles:
  - `daycare_admin`
  - `manager`
  - `billing_manager`
  - `teacher`
  - `staff`

User emails remain globally unique. Passwords are hashed by Laravel and are not stored as plain text. Because email invites are not connected yet, onboarding uses the supplied temporary password, such as `Password123!`, for demo login.

## Database / API Changes

Added migration:

- `2026_05_25_000002_expand_organization_onboarding_fields.php`

Added organization fields:

- `legal_name`
- `website`
- `address`
- `country`
- `timezone`
- `license_status`

Updated:

- `POST /api/platform/organizations`

The endpoint now validates and creates, in one transaction:

- organization
- organization settings with default timezone
- primary daycare admin user
- optional extra organization users
- subscription
- optional initial platform invoice
- audit log

Security:

- Only `super_admin` can create organizations.
- Daycare admins, staff, and parents cannot create organizations.
- New users are scoped to the created organization.

## UI Changes

Super Admin Organizations page now uses an onboarding modal with steps:

1. Organization Details
2. Subscription Plan
3. Admin Users
4. Review & Create

The organizations table now shows:

- organization name
- city/state
- license status badge
- current plan
- subscription status
- primary admin email
- users count
- balance due
- next invoice

Daycare Web Organization Profile now shows/edits:

- daycare name
- legal name
- phone
- email
- website
- address
- city
- state
- country
- license number
- license status
- timezone
- organization status
- subscription plan/status

Timezone now falls back to `Africa/Nairobi` instead of showing `Not configured`.

## Verification

Created via API:

- Organization: Happy Kids Daycare
- City/state/country: Nairobi / Nairobi / Kenya
- Timezone: Africa/Nairobi
- License number: blank
- License status: not_provided
- Plan: Starter
- Billing cycle: monthly
- Primary admin: `admin@happykids.test / Password123!`
- Extra user: `manager@happykids.test / Password123!`
- Initial platform invoice: created

Confirmed:

- Organization was created.
- License number was not required.
- Subscription was created from real Starter plan.
- Primary admin and manager users were created.
- `admin@happykids.test` logs into Happy Kids workspace.
- `manager@happykids.test` logs into Happy Kids workspace.
- Happy Kids children list is empty and does not show Little Lantern data.
- Happy Kids subscription page shows Starter subscription.
- Daycare admin is blocked from platform organization creation.
- Super Admin organization list shows Little Lantern and Happy Kids.

## Tests Passed

- `php artisan migrate`
- `php artisan barbaari:demo-reset`
- `php -l app/Http/Controllers/ApiController.php`
- `php -l routes/api.php`
- `php -l database/migrations/2026_05_25_000002_expand_organization_onboarding_fields.php`
- API onboarding test for Happy Kids
- API login test for Happy Kids admin
- API login test for Happy Kids manager
- API tenant scoping test for Happy Kids children
- API daycare subscription test for Happy Kids
- API security test: daycare admin cannot create platform organization
- `npm --workspace @barbaari/super-admin run typecheck`
- `npm --workspace @barbaari/super-admin run build`
- `npm --workspace @barbaari/daycare-web run typecheck`
- `npm --workspace @barbaari/daycare-web run build`
- `npm --workspace @barbaari/mobile run typecheck`
- `npm --workspace @barbaari/super-admin run test:e2e`
- `npm --workspace @barbaari/daycare-web run test:e2e`

## Remaining Limitations

- Email invite delivery is still a placeholder; temporary passwords are used for demo onboarding.
- Super Admin organization user management can use the existing global users tools, but a dedicated organization user-management screen would be a useful follow-up.
- Classroom assignment during initial extra-user creation is not included yet; teacher/staff users receive staff profiles that can be assigned later.
- License verification is represented by status fields only; no external regulator verification workflow is connected.
