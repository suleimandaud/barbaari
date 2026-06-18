# Registration Password Approval Flow Report

## What changed

- Provider registration now collects owner password and confirmation on the public registration page.
- Registration submit validates password length and confirmation.
- Laravel creates a pending owner user during registration with a hashed password.
- The registration application links to that pending owner user through `owner_user_id`.
- Super Admin approval now attaches the pending owner user to the new organization and activates the user.
- Provider owner approval no longer creates an owner password setup invitation.
- Pending/rejected registration owners can authenticate only enough to see a clear status screen; operational APIs remain blocked.
- Existing staff/admin invitation creation and acceptance remain in place.

## New registration/login workflow

1. Provider submits application with owner email, password, address, and plan selection.
2. Backend creates a `pending_approval` owner user with a hashed password and no organization.
3. Super Admin reviews the application.
4. If approved, backend creates the organization, attaches the owner user, sets owner status to `active`, and creates a `pending_payment` subscription invoice.
5. Approved owner logs in with the email/password created during registration.
6. If payment/subscription is not active, the existing subscription payment gate is shown.
7. Once subscription/payment is active and organization status is active, the dashboard is available.
8. If pending or rejected, the owner cannot access dashboard/operational APIs.

## Files changed

- `apps/backend/app/Http/Controllers/ApiController.php`
- `apps/backend/app/Http/Controllers/AuthController.php`
- `apps/backend/app/Http/Middleware/EnsureActiveSubscription.php`
- `apps/backend/app/Models/FacilityRegistrationApplication.php`
- `apps/backend/database/migrations/2026_06_18_000001_add_owner_user_to_facility_registration_applications.php`
- `apps/backend/tests/Feature/PublicAddressRegistrationTest.php`
- `apps/daycare-web/src/pages/RegisterProviderPage.tsx`
- `apps/daycare-web/src/routes/ProtectedRoute.tsx`
- `apps/super-admin/src/pages/RegistrationApplicationsPage.tsx`

## Migrations added

- `2026_06_18_000001_add_owner_user_to_facility_registration_applications.php`

Adds nullable `owner_user_id` to `facility_registration_applications` and links it to `users`.

## Approval and subscription checks

- `AuthController@login` allows registration owners with `pending_approval` or `rejected` status to authenticate for status display only.
- `AuthController@me` includes safe access fields:
  - `application_status`
  - `organization_status`
  - `subscription_status`
  - `can_access_dashboard`
  - `payment_required`
- `EnsureActiveSubscription` blocks:
  - pending users with “Your application is still pending approval.”
  - rejected users with “Your application was not approved. Please contact support.”
  - users without approved organization linkage
  - non-active organizations from operational APIs
  - unpaid subscriptions through the existing payment gate
- Billing/payment routes remain available for approved owners who need to complete subscription setup.

## Old owner invite link flow

- Provider owner registration approval no longer creates an owner invite token.
- Super Admin approval now returns: “Owner can now log in using the email and password created during registration.”
- Staff/admin/guardian invitation endpoints and invite acceptance remain unchanged.

## Staff/admin invites

- Staff invite creation still creates `OrganizationInvitation`.
- Invite acceptance still sets password through `/api/invitations/{token}/accept`.
- Test coverage verifies a staff invite can be created and accepted.

## Tests passed

- `php artisan test --filter=PublicAddressRegistrationTest`
- `php artisan test`
- `php artisan route:list`
- `php artisan config:clear`
- `npm --workspace @barbaari/daycare-web run typecheck`
- `VITE_API_URL=https://api-barbaari.pioneeriya.com/api npm --workspace @barbaari/daycare-web run build`
- `npm --workspace @barbaari/super-admin run typecheck`
- `VITE_API_URL=https://api-barbaari.pioneeriya.com/api npm --workspace @barbaari/super-admin run build`
- `npm --workspace @barbaari/mobile run typecheck`
- Frontend dist scan found no localhost API URLs or obvious password/secret strings.

## Commands blocked locally

- `php artisan migrate` failed because local MySQL at `127.0.0.1:3306` for `barbaari_db` was not reachable.
- `php artisan cache:clear` failed for the same reason because the configured cache store uses the database.

## Remaining notes

- Existing pending applications created before this change may not have `owner_user_id`; approval now requires a registered owner password for provider registration approval.
- Super Admin-created organizations still use invitation-based setup.
- The frontend build updated tracked `tsconfig.tsbuildinfo` files; do not include those in a commit.

## Staging deployment steps

1. Deploy backend code.
2. Run `php artisan migrate` in staging.
3. Run `php artisan config:clear` and `php artisan cache:clear`.
4. Deploy rebuilt daycare web and super-admin web apps with production `VITE_API_URL`.
5. Submit a Family Child Care registration with password and validated address.
6. Confirm login before approval shows pending screen and blocks dashboard/API access.
7. Approve the application in Super Admin.
8. Confirm no owner invite link is generated.
9. Confirm owner logs in with registration email/password and sees payment gate.
10. Complete or simulate payment activation.
11. Confirm owner reaches dashboard after organization and subscription are active.
12. Verify staff/admin invite creation and acceptance still works.
