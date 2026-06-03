# Full Project Review After Latest Work

Date: 2026-06-01  
Project: Barbaari attendance-first daycare SaaS  
Scope: backend, daycare web, super admin web, tablet/mobile app, shared API/types, billing, invitations, email, Stripe, and security.

## 1. Executive Summary

Barbaari is currently in a strong demo state for the attendance-first product direction. The core attendance dashboard, Attendance Operations workspace, tablet/kiosk flows, organization onboarding, invitation acceptance, platform billing, manual invoice payments, Stripe Checkout foundation, and email templates are present and mostly wired together.

Estimated production readiness: 68%.

Biggest strengths:
- The product is now clearly attendance-first in the daycare web sidebar and tablet experience.
- Tablet/kiosk mode supports mode-specific unlock and scoped data loading for parent, staff, and admin flows.
- Super Admin onboarding now creates organizations, subscriptions, invoices, and invitation links instead of raw password accounts.
- Platform billing is separated from parent billing and supports pricing plans, subscriptions, invoices, payments, and invoice PDFs.
- Stripe Checkout and webhook foundations exist and avoid collecting card data inside Barbaari.
- Invitation links now point to the daycare frontend instead of the Laravel backend.
- Rate limiting and subscription middleware have been added.

Biggest risks:
- Backend subscription enforcement is incomplete. Several authenticated daycare APIs can still be called by unpaid organizations.
- Subscription status checks are inconsistent between frontend/API summary logic and backend middleware.
- Stripe is not fully end-to-end verified because the webhook secret is missing locally and webhook processing is not proven.
- The local subscription page exposes a test-payment shortcut button in the UI.
- Super Admin e2e tests are failing because the test expects old login copy.
- Email delivery is still effectively infrastructure-ready, not production-verified.

## 2. What Was Added After The Last Completion Report

Observed additions and changes since the prior invite-link work:
- Email infrastructure:
  - Organization invitation email.
  - Platform invoice email.
  - Subscription activated email.
  - Invitation emails are queued from the backend when possible.
- Stripe foundation:
  - `StripeService` for Checkout sessions, customers, webhook event construction, subscription cancellation, and provider event logging.
  - Stripe config reads from environment variables.
  - Checkout metadata includes organization, subscription, invoice, and platform billing mode.
  - Webhook handler exists for checkout/session, payment intent, invoice, and subscription events.
- Backend subscription enforcement:
  - `EnsureActiveSubscription` middleware exists.
  - Manager routes are protected by `subscription.active`.
  - Daycare subscription summary reports payment-required status.
- Organization onboarding:
  - Organization wizard creates subscription, invoice, and invitations.
  - Super Admin no longer selects active subscription status at creation.
  - Generated invite links use `DAYCARE_WEB_URL`.
  - Frontend supports `/invite/:token` and `/accept-invite/:token`.
- Organization user management:
  - Organization detail page includes users and invitations.
  - Invitations can be created, resent, and canceled.
  - Users can be activated/deactivated.
- Billing:
  - Platform invoices, payments, subscriptions, dashboard stats, manual payments, invoice PDF generation, and daycare subscription payment page exist.
  - Local/test payment success endpoint exists and is backend-protected for local/test mode.
- Security hardening:
  - Auth, invitation, API, and Stripe webhook rate limiters exist.
  - Invitation tokens are unique random tokens.
  - PINs and passwords are hashed.
  - Platform routes are super-admin protected.

## 3. Current Working Features

### Attendance

- Attendance dashboard and Attendance Operations page are present.
- Old attendance routes redirect into Attendance Operations tabs.
- Check-in and check-out APIs work.
- Timezone-aware display helpers exist and use `Africa/Nairobi` as a fallback.
- Early checkout is computed when checkout happens before the configured day-end time.
- Absence records accept and persist `absence_type`.
- Invalid absence types return validation errors when the client sends JSON `Accept` headers.
- Audit-oriented fields are present on attendance actions.

### Tablet/Kiosk

- Tablet mode has Parent/Guardian, Staff, and Admin mode selection.
- Parent/guardian mode authenticates with parent credentials and scopes children through linked guardians.
- Staff mode authenticates teacher/staff with PIN and scopes children/classrooms to assigned classrooms.
- Admin mode authenticates daycare admin/manager with PIN and loads all organization classrooms/children.
- Super admin is blocked from daily tablet unlock.
- Tablet bootstrap returns scoped classrooms, children, guardians, attendance, absences, staff, timezone, and local date.
- Mark absent supports absence type and reason.
- Signature capture and confirmation screens exist.
- Tested bootstrap behavior:
  - Admin sees 3 demo classrooms and 3 demo children.
  - Teacher sees only Blue Room and Ayan Hassan.
  - Parent sees linked children only.

### Daycare Web

- Login, forgot password, reset password, invite acceptance, subscription payment, and subscription success routes exist.
- Protected route checks authentication and redirects unpaid daycare admins/managers to subscription payment.
- Sidebar is attendance-focused:
  - Attendance Dashboard
  - Attendance Operations
  - Children
  - Guardians / Authorized Pickups
  - Classrooms
  - Staff Access
  - Attendance Audit Logs
  - Attendance Reports
  - Devices/Tablets
  - Subscription/Billing
  - Settings
- Duplicate attendance pages are no longer shown as separate main sidebar items.
- Subscription/Billing page and activation/payment page exist.
- Daycare e2e smoke tests passed.

### Super Admin

- Super Admin login page loads.
- Organization onboarding wizard exists with clean steps:
  - Organization Details
  - Plan
  - Admin Users
  - Review
- Plan is selected from real pricing plans.
- Subscription status is not manually set active during onboarding.
- Organization creation generates invitation links.
- Invite success screen shows frontend invite URLs.
- Organization detail page includes billing, invitations, and users.
- Pricing plans, subscriptions, invoices, payments, billing dashboard, and organization billing badges exist.

### Billing

- Platform billing is separated from parent billing.
- Pricing plans exist for Starter, Growth, and Enterprise.
- Organization subscriptions exist.
- Platform invoices and payments exist.
- Manual partial and full payment recording works.
- Full manual payment can activate the subscription and organization.
- Invoice PDF endpoint returns a PDF attachment.
- Daycare subscription summary shows plan, invoices, payments, open balance, and payment-required state.

### Invitations/Email

- Organization invitation records exist with token, status, expiry, accepted timestamp, inviter, organization, and email fields.
- Invite accept endpoint creates/activates the user, hashes password, marks invite accepted, and moves pending activation toward payment.
- Public invitation lookup returns organization name, invited email, role, and status.
- Invalid invitation tokens return friendly JSON errors.
- Invite email class builds frontend invite links using `DAYCARE_WEB_URL`.
- Mail templates/classes exist for invites, invoices, and subscription activation.

### Stripe

- Stripe keys are read from environment/config, not hardcoded in source.
- Checkout session endpoint works when Stripe test keys are configured.
- No raw card collection exists inside Barbaari.
- Webhook endpoint exists and logs provider events.
- Missing webhook secret returns a safe message instead of pretending success.
- Provider event logging exists.

### Security

- Platform endpoints are super-admin protected.
- Daycare admin cannot access platform organization endpoints.
- Parent cannot unlock admin tablet mode.
- Teacher/staff cannot unlock admin tablet mode.
- Super admin cannot unlock daily tablet mode.
- Rate limiters exist for auth, invitations, API, and Stripe webhook traffic.
- Passwords and staff PINs are hashed.
- Invitation tokens are random and unique.

## 4. Broken Or Risky Areas

### Critical - Backend subscription enforcement is incomplete

Area: Backend API / subscription gate  
Exact problem: Only the `/api/manager/*` route group is protected by `subscription.active`. Root daycare APIs such as `/api/children`, `/api/attendance/*`, `/api/tablet/bootstrap`, and several daycare operations are authenticated and role-protected but not consistently subscription-protected.  
Why it matters: An unpaid or past-due organization can still call protected operational APIs directly, bypassing the frontend payment gate.  
Suggested fix: Apply subscription enforcement consistently to all daycare organization APIs except explicitly allowed pre-payment routes: login, logout, auth/me, invitation accept, subscription summary, checkout/session, payment success/cancel, and read-only payment page data.

### Critical - Subscription status logic is inconsistent

Area: Backend middleware and subscription summary  
Exact problem: `requiresSubscriptionPayment()` treats `past_due`, `canceled`, `suspended`, pending statuses, and expired trials as payment-required. `EnsureActiveSubscription` only blocks `pending_activation`, `pending_payment`, and `suspended`. In API testing, a past-due organization could still access `/api/manager/dashboard`.  
Why it matters: Billing state becomes unpredictable, and enforcement depends on which endpoint is called.  
Suggested fix: Centralize subscription access rules in one service and use it in both middleware and API summary responses.

### High - Super Admin e2e tests are failing

Area: Super Admin frontend tests  
Exact problem: `npm --workspace @barbaari/super-admin run test:e2e` fails because tests expect the old heading `Super Admin Login`, while the UI now renders `Platform admin login`.  
Why it matters: The test suite cannot currently prove Super Admin flows are healthy.  
Suggested fix: Update e2e selectors to stable labels or test IDs and rerun the full Super Admin suite.

### High - Stripe webhook is not end-to-end verified

Area: Stripe/webhooks  
Exact problem: The webhook endpoint exists, but local config has no webhook secret configured. Test webhook calls return `STRIPE_WEBHOOK_SECRET is not configured.`  
Why it matters: Checkout can create a Stripe session, but production activation depends on verified webhook processing.  
Suggested fix: Configure a Stripe test webhook secret, run Stripe CLI or dashboard test webhooks, verify invoice/subscription/payment updates, and document deployment setup.

### High - Test payment shortcut is visible in the daycare UI

Area: Daycare subscription payment page  
Exact problem: The page includes a "Testing? Skip payment" button. Backend protection limits this to local/test mode, but the UI still renders the shortcut.  
Why it matters: It is confusing and dangerous if exposed in a hosted environment.  
Suggested fix: Hide the button unless the frontend build explicitly runs in local/demo mode and the backend confirms test-payment mode is enabled.

### High - Local Stripe test secret handling needs review

Area: Environment/security  
Exact problem: The local `.env` contains Stripe test credentials. They are not hardcoded in source, but any accidental commit or log exposure would require rotation.  
Why it matters: Test secrets can still be abused against the Stripe test account and leak operational assumptions.  
Suggested fix: Confirm `.env` is ignored, rotate keys if they were ever shared, and use secret management for deployed environments.

### Medium - Partial payment can mark subscription past due too early

Area: Platform billing  
Exact problem: A partial payment on an invoice that was not yet due changed the subscription to `past_due`.  
Why it matters: Organizations may be flagged incorrectly before the due date.  
Suggested fix: Only mark `past_due` when `due_date < today` and `balance_due > 0`, or keep subscription pending/active according to the billing policy.

### Medium - Duplicate backend routes exist

Area: `routes/api.php`  
Exact problem: Some routes are duplicated, including classroom creation and daily-note endpoints.  
Why it matters: Duplicate routes make authorization and behavior harder to audit and can hide accidental behavior changes.  
Suggested fix: Deduplicate route definitions and group daycare, manager, platform, tablet, and public routes clearly.

### Medium - Tablet QR verification is still only a placeholder

Area: Tablet/API verification  
Exact problem: UI blocks QR as a placeholder, but backend validation allows `verification_method = qr` if called directly.  
Why it matters: API callers can record QR verification before QR verification is actually implemented.  
Suggested fix: Reject QR verification server-side until the QR verification flow exists.

### Medium - Guardian/authorized pickup login model is incomplete

Area: Tablet parent/guardian mode  
Exact problem: Parent/guardian mode currently authenticates `parent` role users. It does not fully model separate guardian or authorized-pickup login accounts.  
Why it matters: The UI language promises parent/guardian/authorized pickup behavior, but only parent accounts are first-class unlock users today.  
Suggested fix: Decide whether guardians and authorized pickups are user accounts or signer-only records, then enforce that model consistently.

### Medium - Billing manager payment gate is unclear

Area: Daycare frontend route guard  
Exact problem: The route guard payment-check path is implemented for daycare admin/manager. Billing manager access behavior is less explicit.  
Why it matters: A billing manager may need access to subscription payment only, not attendance operations.  
Suggested fix: Add explicit billing-manager routing rules and tests.

### Medium - Dashboard kiosk link goes to the records tab

Area: Daycare dashboard UX  
Exact problem: The dashboard action links to `/attendance`, which redirects to `/attendance-operations?tab=records`, not the kiosk/tablet tab.  
Why it matters: The main "Open Tablet/Kiosk" action may land on the wrong workspace tab.  
Suggested fix: Point it directly to `/attendance-operations?tab=kiosk`.

### Medium - Email delivery is not production-verified

Area: Email/queue  
Exact problem: Mail classes exist, but real provider credentials and end-to-end deliverability were not verified in this review.  
Why it matters: Invitations, invoices, password resets, and subscription notifications depend on email.  
Suggested fix: Configure a real provider in staging, run queued email tests, verify links, and monitor bounces/failures.

### Low - API validation can return HTML without JSON headers

Area: API ergonomics  
Exact problem: Laravel validation returns HTML redirects when API calls omit `Accept: application/json`.  
Why it matters: External API clients may see confusing responses.  
Suggested fix: Force JSON responses for `/api/*` or document required headers.

### Low - Super Admin build has a large chunk warning

Area: Frontend performance  
Exact problem: The Super Admin production build warns that a JS chunk is over 500 kB.  
Why it matters: It is not blocking, but it affects load performance.  
Suggested fix: Add route-level code splitting after functional blockers are resolved.

## 5. Remaining Production Blockers

- Backend-wide subscription enforcement must be fixed and retested.
- Subscription access status rules must be centralized and consistent.
- Password reset flow must be tested through real email delivery.
- Real email credentials and queue worker deployment must be configured and verified.
- Stripe test-mode end-to-end checkout and webhook processing must be verified with a webhook secret.
- Stripe live mode must not be enabled until test mode is fully proven.
- Test-payment shortcut must be hidden from non-local builds.
- Invoice/receipt PDF generation should be completed and branded for all billing flows. Platform invoice PDF exists, but receipt/download behavior still needs full QA.
- Production CORS, frontend URLs, API URLs, `DAYCARE_WEB_URL`, mail URLs, and Stripe URLs must be verified.
- Manual QA must cover attendance, tablet permissions, billing, invites, tenant isolation, and payment gates.
- Super Admin e2e tests must be updated and passing.
- Duplicate routes should be cleaned before launch.
- Secret management and `.env` hygiene must be confirmed.

## 6. Manual QA Checklist

### Super Admin Onboarding

- [ ] Login as `super@barbaari.test`.
- [ ] Create a new organization with no license number.
- [ ] Select plan from pricing plan dropdown.
- [ ] Confirm no subscription active status field exists in onboarding.
- [ ] Add primary admin and extra manager invite.
- [ ] Confirm organization status is pending setup.
- [ ] Confirm subscription status is pending activation or pending payment.
- [ ] Confirm first invoice is created when enabled.
- [ ] Confirm audit log entry exists.

### Invite Acceptance

- [ ] Open generated `http://localhost:5173/invite/{token}` link.
- [ ] Confirm organization name, email, and role are shown.
- [ ] Accept invite with a new password.
- [ ] Confirm accepted token cannot be reused.
- [ ] Confirm expired/canceled token shows friendly error.
- [ ] Login with the accepted account.

### Daycare Payment Gate

- [ ] Login as invited unpaid daycare admin.
- [ ] Confirm redirect to subscription payment page.
- [ ] Confirm dashboard and attendance routes are blocked before activation.
- [ ] Confirm subscription page shows plan, amount due, invoice, and status.
- [ ] Confirm active Little Lantern account still reaches dashboard.
- [ ] Confirm backend API calls are also blocked, not just frontend routes.

### Attendance Dashboard

- [ ] Confirm Attendance Dashboard loads.
- [ ] Confirm metrics match current records.
- [ ] Confirm recent check-ins and check-outs show local time.
- [ ] Confirm Open Tablet/Kiosk lands on the kiosk tab.
- [ ] Confirm attendance reports include absence type and local date/time.

### Tablet Parent Mode

- [ ] Choose Parent / Guardian mode.
- [ ] Login as `parent@littlelantern.test`.
- [ ] Confirm only linked children appear.
- [ ] Confirm unrelated classrooms and children are hidden or blocked.
- [ ] Check in/out a linked child.
- [ ] Confirm actor/signer and signature are saved.

### Tablet Staff Mode

- [ ] Choose Staff mode.
- [ ] Login as `teacher@littlelantern.test / 123456`.
- [ ] Confirm only assigned classroom appears.
- [ ] Confirm only assigned children appear.
- [ ] Attempt outside-classroom action and confirm it is blocked.
- [ ] Mark a child absent with type `sick`.
- [ ] Confirm absence type appears in Daycare Web.

### Tablet Admin Mode

- [ ] Choose Admin mode.
- [ ] Login as `admin@littlelantern.test / 123456`.
- [ ] Confirm all organization classrooms and children appear.
- [ ] Check in/out any child.
- [ ] Mark absent with `vacation`.
- [ ] Confirm confirmation screen shows local time, actor, signer, and absence type.
- [ ] Confirm super admin cannot unlock daily tablet mode.

### Billing Payments

- [ ] Create invoice from subscription.
- [ ] Record partial payment.
- [ ] Confirm invoice status and balance are correct.
- [ ] Confirm subscription does not become past due before due date.
- [ ] Record full payment.
- [ ] Confirm invoice paid, subscription active, organization active.
- [ ] Download invoice PDF.

### Stripe Checkout

- [ ] Configure Stripe test secret and webhook secret.
- [ ] Create Checkout session from unpaid daycare account.
- [ ] Complete payment with Stripe test card.
- [ ] Verify webhook updates invoice, payment, subscription, and organization.
- [ ] Verify failed payment keeps subscription unpaid.
- [ ] Verify no card data is stored in Barbaari.

### Email Sending

- [ ] Configure staging mail provider.
- [ ] Send invitation email.
- [ ] Send password reset email.
- [ ] Send invoice email.
- [ ] Send subscription activated email.
- [ ] Confirm queued jobs are processed.
- [ ] Confirm links point to frontend URLs.

## 7. Recommended Next Sprint

### P0 - Must Fix Before Live Pilot

- Apply subscription enforcement to all daycare organization APIs.
- Centralize subscription status/payment-required logic.
- Configure and verify Stripe test webhook end to end.
- Configure real email delivery in staging and run queued mail tests.
- Hide or feature-flag the test-payment shortcut in frontend builds.
- Update and pass Super Admin e2e tests.
- Verify tenant isolation with direct API calls, not just UI checks.
- Confirm secrets are not committed and rotate any exposed local test keys if needed.

### P1 - Must Fix Before Public Launch

- Deduplicate backend routes.
- Complete branded invoice/receipt PDFs and receipt download flows.
- Add explicit billing-manager access rules.
- Reject placeholder QR verification server-side.
- Fix dashboard kiosk link to target the kiosk tab.
- Add route-level code splitting for Super Admin.
- Add automated tests for invite lifecycle, payment gate, tablet scoping, and billing status transitions.
- Document production CORS, frontend URL, API URL, Stripe, mail, and queue settings.

### P2 - Important Later

- Add richer monitoring and support tooling.
- Add resend/bounce tracking for transactional email.
- Add more granular authorized-pickup account flows if they should log in directly.
- Add billing dunning/reminder automation.
- Add advanced attendance analytics.
- Add multi-site organization support if Enterprise plan requires it.

## 8. Tests Run And Results

### Backend Commands

- `php artisan migrate` - passed.
- `php artisan barbaari:demo-reset` - passed.
- `php artisan route:list` - passed, 236 routes listed.
- `php artisan config:clear` - passed.
- `php artisan cache:clear` - passed.

### Frontend Commands

- `npm --workspace @barbaari/super-admin run typecheck` - passed.
- `npm --workspace @barbaari/super-admin run build` - passed with large chunk warning.
- `npm --workspace @barbaari/daycare-web run typecheck` - passed.
- `npm --workspace @barbaari/daycare-web run build` - passed.
- `npm --workspace @barbaari/mobile run typecheck` - passed.

### E2E Commands

- `npm --workspace @barbaari/daycare-web run test:e2e` - passed, 2/2 tests.
- `npm --workspace @barbaari/super-admin run test:e2e` - failed, 2/2 tests. The visible failure is stale test copy expecting `Super Admin Login` while the UI now says `Platform admin login`.

### Targeted API Checks

- Super admin login - passed.
- Daycare admin login - passed.
- Teacher login - passed.
- Parent login - passed.
- Organization creation with invite links - passed.
- Invite lookup - passed.
- Invalid invite token JSON error - passed.
- Invite acceptance and login - passed.
- Platform partial payment - passed, but incorrectly moved subscription to past due before due date.
- Platform full payment - passed; invoice, subscription, and organization became active.
- Daycare subscription summary - passed.
- Direct unpaid/past-due access to root daycare APIs - failed security expectation; API remained accessible.
- Direct unpaid/past-due access to `/api/manager/dashboard` - failed security expectation; API returned 200.
- Stripe Checkout session creation with local test keys - passed.
- Stripe webhook without webhook secret - safe failure response passed.
- Platform invoice PDF - passed.
- Tablet admin bootstrap - passed.
- Tablet teacher/staff bootstrap - passed.
- Tablet parent bootstrap - passed.
- Attendance check-in/check-out - passed.
- Absence create with `absence_type=sick` - passed.
- Invalid absence type validation - passed with JSON headers.
- Daycare admin access to platform organizations - correctly blocked with 403.

## 9. Final Verdict

Is Barbaari ready for demo? Yes, with a controlled demo script and clear caveats around Stripe webhook, email delivery, and subscription enforcement.

Is Barbaari ready for pilot? Not yet. A limited internal pilot is reasonable only after backend-wide subscription enforcement, Stripe test webhook verification, email delivery verification, and Super Admin e2e fixes.

Is Barbaari ready for production? No.

Before going live, Barbaari must complete:
- Backend-wide subscription gate enforcement.
- Unified subscription status rules.
- Stripe test-mode checkout and webhook verification.
- Real email provider and queue worker verification.
- Test-payment UI gating.
- E2E suite repair.
- Direct API tenant-isolation and unpaid-access tests.
- Production environment/CORS/URL/secrets setup.
- Manual QA for tablet, attendance, invites, billing, and payment flows.

