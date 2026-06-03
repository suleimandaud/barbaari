# Organization Invite And Payment Gate Report

## Summary

Barbaari organization onboarding now follows a SaaS-style activation flow:

1. Super Admin creates the daycare organization and selects a real pricing plan.
2. The subscription starts as pending, not active.
3. Admin users are invited by email and create their own passwords through invitation links.
4. After invitation acceptance, the subscription moves to payment-required state.
5. Daycare web blocks normal dashboard routes until the subscription is active.
6. Payment activation happens through verified manual payment or the local/test payment success endpoint. Stripe remains test-mode ready and does not collect card data inside Barbaari.

## Why Super Admin Cannot Set Active Manually During Onboarding

The previous create organization flow allowed Super Admin to select a subscription status such as trialing or active during onboarding. That made it possible to bypass the payment lifecycle.

The onboarding wizard no longer includes a subscription status dropdown. New organizations now start with:

- organization.status = pending_setup
- subscription.status = pending_activation

The subscription becomes active only after payment is recorded or a protected local/test payment success path is used.

## Invitation And Password Setup Flow

New invitations are stored in `organization_invitations`.

Invitation records include:

- organization_id
- user_id
- email
- name
- role
- token
- status
- expires_at
- accepted_at
- invited_by

Flow:

1. Super Admin creates an organization and admin invitations.
2. The API returns demo/manual invite links.
3. The invited user opens `/invite/:token`.
4. The invite page shows organization name, invited email, role, and invite status.
5. The invited user sets and confirms their password.
6. The backend creates an active user scoped to the organization, hashes the password, marks the invitation accepted, and moves the subscription from pending_activation to pending_payment.

Passwords are not collected by Super Admin during onboarding.

## Subscription Status Flow

Initial creation:

- organization.status = pending_setup
- subscription.status = pending_activation

After primary admin accepts invite:

- subscription.status = pending_payment
- organization.status remains pending_setup

After payment succeeds:

- invoice.status = paid
- invoice.amount_paid = total_amount
- invoice.balance_due = 0
- subscription.status = active
- organization.status = active

Blocked/payment-required statuses:

- pending_activation
- pending_payment
- past_due
- suspended
- canceled
- trialing only when the trial has expired

## Payment Gate Behavior

Daycare web now checks subscription state before showing normal protected routes for daycare admin and manager users.

If payment is required, the user is redirected to `/subscription-payment`.

Allowed before activation:

- login/logout
- invitation acceptance
- current user session check
- subscription payment page
- billing checkout/test payment endpoint

Normal daycare management pages remain hidden until the subscription is active.

## Stripe Test Mode Readiness

Stripe remains safe and test-mode oriented.

Configured environment keys:

- STRIPE_MODE
- STRIPE_PUBLIC_KEY
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET

Behavior:

- If Stripe keys are missing, checkout returns: `Stripe test mode is not configured yet.`
- Barbaari does not collect raw card numbers.
- Barbaari does not store card data.
- A protected local/test endpoint can activate the subscription for demo testing:
  - `POST /api/daycare/billing/test-payment-success`
  - Only works in local app environment or when `STRIPE_MODE=test`.

## Files Changed

Backend:

- `apps/backend/app/Http/Controllers/ApiController.php`
- `apps/backend/app/Http/Controllers/AuthController.php`
- `apps/backend/app/Models/User.php`
- `apps/backend/app/Models/OrganizationInvitation.php`
- `apps/backend/app/Console/Commands/DemoResetCommand.php`
- `apps/backend/routes/api.php`
- `apps/backend/database/migrations/2026_05_25_000003_create_organization_invitations_table.php`

Shared:

- `packages/shared/src/api.ts`

Super Admin:

- `apps/super-admin/src/pages/OrganizationsPage.tsx`

Daycare Web:

- `apps/daycare-web/src/App.tsx`
- `apps/daycare-web/src/routes/ProtectedRoute.tsx`
- `apps/daycare-web/src/pages/AcceptInvitePage.tsx`
- `apps/daycare-web/src/pages/SubscriptionPaymentPage.tsx`

Report:

- `ORGANIZATION_INVITE_PAYMENT_GATE_REPORT.md`

## Endpoints Added Or Updated

Invitation:

- `GET /api/invitations/{token}`
- `POST /api/invitations/{token}/accept`

Organization onboarding:

- `POST /api/platform/organizations`

Daycare billing:

- `GET /api/daycare/subscription`
- `POST /api/daycare/billing/stripe/create-checkout-session`
- `POST /api/daycare/billing/test-payment-success`

## Verification Performed

Backend:

- Ran migrations.
- Ran demo reset.
- Created Bright Start Daycare through the platform organization endpoint.
- Confirmed subscription started as pending_activation.
- Confirmed invite link was generated.
- Confirmed invite lookup returned organization/email/role/status.
- Accepted the invite and set a password.
- Confirmed invited admin could log in.
- Confirmed subscription became pending_payment.
- Confirmed `requires_payment` was true before payment.
- Confirmed Stripe checkout returned the safe not-configured message.
- Ran local/test payment success.
- Confirmed invoice became paid.
- Confirmed subscription became active.
- Confirmed organization became active.
- Confirmed `requires_payment` became false after payment.
- Confirmed active Little Lantern still reports an active subscription.

Frontend:

- Super Admin onboarding no longer asks for subscription status or user passwords.
- Super Admin success screen shows generated invitation links.
- Daycare web includes invitation acceptance page.
- Daycare web includes subscription payment gate page.
- Daycare route guard redirects unpaid daycare admins/managers to the payment page.

## Remaining Limitations

- Real outbound email invitations are not connected yet; invite links are shown in the Super Admin UI for demo/manual delivery.
- Stripe Checkout is still a safe placeholder unless Stripe test keys and a full Checkout integration are configured.
- The local/test payment success endpoint is for local/test mode only and must remain disabled in production.
- Backend API-wide subscription gating is not yet implemented for every daycare endpoint; the daycare web route guard blocks normal UI access before activation.
