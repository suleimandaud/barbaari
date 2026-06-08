# Registration Onboarding Rework Report

## Summary

Provider onboarding is now centered on public registration applications instead of Super Admin manually creating organizations as the normal flow.

Primary customer flow:

1. Provider opens `/register` or `/apply`.
2. Provider chooses Family Child Care or Center Daycare.
3. Provider submits application.
4. Super Admin reviews the application.
5. Super Admin approves or rejects/follows up.
6. Approval creates the organization, subscription, first invoice, and owner invitation.
7. Owner accepts the invite and creates a password.
8. Owner logs in.
9. Payment gate blocks dashboards until subscription is active.
10. After payment activation, the correct dashboard opens by facility type.

## Changes Made

- Public registration page now explains the difference between Family Child Care and Center Daycare.
- Family Child Care registration collects home/provider latitude, longitude, and attendance radius.
- Center Daycare registration keeps all allowed plan options.
- Super Admin Organizations now promotes “Review applications” as the main onboarding action.
- Manual organization creation remains available only as “Internal support only.”
- Super Admin application approval now shows the generated manual invite link after approval.
- Approval invitation email includes:
  - organization/facility name
  - facility type
  - invite link
  - setup instruction to create a password and continue setup
- Backend approval creates:
  - organization with correct `facility_type`
  - pending subscription
  - platform invoice
  - owner invite
  - queued invitation email

## Backend API

- `GET /api/public/pricing-plans`
- `POST /api/registration-applications`
- `GET /api/platform/registration-applications`
- `POST /api/platform/registration-applications/{application}/approve`
- `POST /api/platform/registration-applications/{application}/reject`
- `POST /api/platform/registration-applications/{application}/follow-up`

## Verified Locally

- Family Child Care public pricing returns only Starter.
- Center Daycare public pricing returns Starter, Growth, and Enterprise.
- Backend rejects Family Child Care application with Growth/Enterprise.
- Family Child Care application creates successfully with latitude/longitude.
- Super Admin approval creates organization, subscription, invoice, and invitation.
- Invite acceptance activates the owner user.
- Unpaid owner can access subscription summary but receives 402 for operational APIs.
- Test payment activates organization and subscription.

## Remaining Manual QA

- Verify live/staging email delivery with configured mail credentials and queue worker.
- Verify the invite link points to `https://barbaari.pioneeriya.com/invite/{token}` on staging.
- Verify Stripe Checkout/webhook activation on staging with Stripe test keys.
