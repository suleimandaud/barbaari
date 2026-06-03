# Platform Billing Build Report

## Billing Scope

This build adds Barbaari platform-to-daycare billing. It is for Barbaari charging daycare organizations for SaaS access.

It is not parent billing, child tuition billing, or daycare-to-family payments. Existing parent/daycare billing tables and pages remain separate.

Labels used in the new flow:

- Platform Billing
- Organization Subscription
- Barbaari Subscription
- Platform Invoice
- Platform Payment

## Database / Tables Changed

Existing platform tables expanded:

- `pricing_plans`
  - Added `code`, `currency`, `device_limit`, `stripe_product_id`, `stripe_monthly_price_id`, `stripe_yearly_price_id`.
- `subscriptions`
  - Used as organization platform subscriptions.
  - Added `billing_cycle`, `current_period_start`, `current_period_end`, `canceled_at`, `paused_at`, `next_invoice_at`, `stripe_customer_id`, `provider`, `notes`.

New platform billing tables:

- `platform_invoices`
- `platform_payments`
- `payment_provider_events`

Parent billing tables left intact:

- `invoices`
- `invoice_items`
- `payments`
- `receipts`

## Manual Billing Logic

Manual billing works now:

- Super Admin can create and edit platform pricing plans.
- Super Admin can assign a plan and billing cycle to an organization.
- Super Admin can create platform invoices from a subscription.
- Invoice totals default from the selected plan monthly/yearly price.
- Super Admin can record partial payments.
- Partial payment updates:
  - `amount_paid`
  - `balance_due`
  - invoice status `partial`
- Full payment or mark-paid updates:
  - invoice status `paid`
  - `amount_paid = total_amount`
  - `balance_due = 0`
  - `paid_at` set
- Overdue invoices are refreshed when billing dashboards/invoice lists load.
- Subscription actions now support pause, resume/reactivate, cancel, and suspend.
- Platform billing actions are written to `audit_logs`.

## Stripe Test-Mode Readiness

Stripe is not live and does not process payments in this build.

Configured environment variables:

- `STRIPE_MODE`
- `STRIPE_PUBLIC_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Backend config:

- `config/services.php` reads Stripe keys from `.env`.

Placeholder endpoints:

- `POST /api/daycare/billing/stripe/create-checkout-session`
- `POST /api/platform/billing/stripe/sync-plan`
- `POST /api/webhooks/stripe`

If Stripe keys are missing, checkout/sync returns:

```text
Stripe test mode is not configured yet.
```

No Barbaari UI collects card numbers, and no card numbers are stored.

Webhook event structure is logged in `payment_provider_events` for future Stripe test-mode integration. Future webhook handling should cover:

- `checkout.session.completed`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Future sandbox alternatives documented for later evaluation:

- PayPal Sandbox
- Adyen test cards
- Flutterwave test mode

## Super Admin Pages

Added/improved:

- Billing Dashboard
- Pricing Plans
- Subscriptions
- Platform Invoices
- Platform Payments
- Organization billing badges

Super Admin can now see:

- MRR
- ARR estimate
- active subscriptions
- trialing subscriptions
- past due subscriptions
- suspended subscriptions
- open invoices
- overdue balances
- revenue this month
- recent payments
- upcoming renewals

## Daycare Billing Page

Added daycare web page:

- `Subscription / Billing`

It shows only the current daycare organization’s platform billing:

- current plan
- subscription status
- billing cycle
- current period
- next invoice date
- child/staff/device limits
- included features
- platform invoice list
- platform payment history
- unpaid/overdue balance warning
- placeholder Pay Invoice action
- request plan change placeholder

Daycare admin/manager cannot see other organizations, platform revenue, all platform invoices, or pricing management controls.

## Endpoints Added

Super Admin:

- `GET /api/platform/billing/dashboard`
- `GET /api/platform/pricing-plans`
- `POST /api/platform/pricing-plans`
- `PUT|PATCH /api/platform/pricing-plans/{plan}`
- `PATCH /api/platform/pricing-plans/{plan}/activate`
- `PATCH /api/platform/pricing-plans/{plan}/deactivate`
- `GET /api/platform/subscriptions`
- `POST /api/platform/subscriptions`
- `PUT /api/platform/subscriptions/{subscription}`
- `PATCH /api/platform/subscriptions/{subscription}/pause`
- `PATCH /api/platform/subscriptions/{subscription}/resume`
- `PATCH /api/platform/subscriptions/{subscription}/cancel`
- `PATCH /api/platform/subscriptions/{subscription}/suspend`
- `PATCH /api/platform/subscriptions/{subscription}/change-plan`
- `GET /api/platform/invoices`
- `POST /api/platform/invoices`
- `GET /api/platform/invoices/{invoice}`
- `PATCH /api/platform/invoices/{invoice}/mark-paid`
- `POST /api/platform/invoices/{invoice}/payments`
- `PATCH /api/platform/invoices/{invoice}/void`
- `GET /api/platform/payments`
- `POST /api/platform/billing/stripe/sync-plan`

Daycare:

- `GET /api/daycare/subscription`
- `GET /api/daycare/billing/invoices`
- `GET /api/daycare/billing/payments`
- `POST /api/daycare/billing/request-plan-change`
- `POST /api/daycare/billing/stripe/create-checkout-session`

Stripe-ready:

- `POST /api/webhooks/stripe`

## Security Tests

Verified:

- Super Admin can access platform billing.
- Daycare admin receives `403` for platform billing dashboard.
- Staff receives `403` for daycare platform billing page.
- Parent receives `403` for daycare platform billing page.
- Staff receives `403` for platform invoice endpoints.
- Parent receives `403` for platform invoice endpoints.
- Daycare admin sees only Little Lantern platform subscription/invoices/payments.

## Demo Data

Demo reset creates:

- Starter plan
  - Monthly `99`
  - Yearly `999`
  - `USD`
  - 50 children, 10 staff, 2 devices
  - attendance, guardian signing, reports
- Growth plan
  - Monthly `349`
  - Yearly `3490`
  - `USD`
  - 150 children, 30 staff, 5 devices
  - attendance, tablet mode, signatures, reports, notifications
- Enterprise plan
  - Monthly `799`
  - Yearly `7990`
  - `USD`
  - 500 children, 100 staff, 20 devices
  - multi-site, advanced reports, priority support

Little Lantern Daycare:

- Growth
- monthly
- active
- provider `manual`

Seeded platform invoices:

- one paid platform invoice
- one open platform invoice
- one overdue platform invoice

Seeded platform payment:

- one bank transfer manual platform payment

## Tests Passed

- `php artisan migrate`
- `php artisan barbaari:demo-reset`
- `php -l app/Http/Controllers/ApiController.php`
- `php -l app/Console/Commands/DemoResetCommand.php`
- API: platform billing dashboard returned MRR/open invoice/revenue metrics.
- API: platform plans returned Starter/Growth/Enterprise with limits and Stripe fields.
- API: platform invoices returned paid/open/overdue invoices.
- API: platform payments returned seeded manual payment.
- API: created a platform pricing plan.
- API: activated/deactivated a platform pricing plan.
- API: recorded a partial platform payment and invoice became `partial`.
- API: marked invoice paid and invoice became `paid` with zero balance.
- API: paused, resumed, and suspended a subscription.
- API: created a platform invoice from subscription.
- API: audit logs include platform plan, subscription, invoice, and payment actions.
- API: daycare admin can view own subscription/invoices/payments.
- API: Stripe checkout placeholder returns missing test-mode configuration message when keys are absent.
- API: Stripe webhook placeholder logs structure and reports missing test-mode config.
- API/security: daycare admin, staff, and parent are blocked from platform billing endpoints.
- API/security: staff and parent are blocked from daycare subscription billing endpoints.
- `npm --workspace @barbaari/super-admin run typecheck`
- `npm --workspace @barbaari/super-admin run build`
- `npm --workspace @barbaari/daycare-web run typecheck`
- `npm --workspace @barbaari/daycare-web run build`
- `npm --workspace @barbaari/mobile run typecheck`
- `npm --workspace @barbaari/super-admin run test:e2e`
- `npm --workspace @barbaari/daycare-web run test:e2e`

## Remaining Limitations

- Stripe Checkout and webhook signature verification are scaffolded but not fully connected.
- No live Stripe mode is enabled.
- No receipt PDF generation yet; receipt download remains a placeholder.
- Plan change requests are logged for follow-up, not routed through a workflow queue.
- Suspension currently updates organization status and warning visibility; attendance hard-block behavior should be reviewed with policy before production enforcement.
- Historical test pricing plans may exist from older local e2e runs, but demo reset guarantees Starter, Growth, and Enterprise are present and Little Lantern is active on Growth.
