# Staging Deployment Notes

## Staging URLs

- Backend API: `https://api-barbaari.pioneeriya.com`
- Daycare Web: `https://barbaari.pioneeriya.com`
- Super Admin Web: `https://admin-barbaari.pioneeriya.com`

Frontend builds must use:

```bash
VITE_API_URL=https://api-barbaari.pioneeriya.com/api
```

## Backend Deployment Steps

1. Upload backend changes to the API hosting directory.
2. Ensure `.env` is present on the server and is not committed to git.
3. Set or verify:
   - `APP_URL=https://api-barbaari.pioneeriya.com`
   - `DAYCARE_WEB_URL=https://barbaari.pioneeriya.com`
   - `SUPER_ADMIN_WEB_URL=https://admin-barbaari.pioneeriya.com`
   - `FRONTEND_URL=https://barbaari.pioneeriya.com`
   - `SANCTUM_STATEFUL_DOMAINS=barbaari.pioneeriya.com,admin-barbaari.pioneeriya.com`
   - CORS allowed origins include both frontend domains.
   - Mail provider settings if email delivery should send externally.
   - Stripe test-mode keys if Stripe Checkout should work.
4. Run:

```bash
php artisan migrate
php artisan config:clear
php artisan cache:clear
php artisan route:list
```

5. Start or verify queue worker if email is queued:

```bash
php artisan queue:work
```

## Daycare Web Deployment Steps

1. Build with staging API:

```bash
VITE_API_URL=https://api-barbaari.pioneeriya.com/api npm --workspace @barbaari/daycare-web run build
```

2. Upload `apps/daycare-web/dist` contents to `https://barbaari.pioneeriya.com`.
3. Configure SPA fallback so all routes serve `index.html`, including:
   - `/login`
   - `/register`
   - `/apply`
   - `/invite/:token`
   - `/subscription-payment`
   - dashboard routes

## Super Admin Deployment Steps

1. Build with staging API:

```bash
VITE_API_URL=https://api-barbaari.pioneeriya.com/api npm --workspace @barbaari/super-admin run build
```

2. Upload `apps/super-admin/dist` contents to `https://admin-barbaari.pioneeriya.com`.
3. Configure SPA fallback so all routes serve `index.html`, including:
   - `/login`
   - `/organizations`
   - `/registration-applications`
   - `/pricing-plans`
   - `/subscriptions`
   - `/invoices`

## Dist URL Checks

The staging builds were generated with `VITE_API_URL=https://api-barbaari.pioneeriya.com/api`.

Local grep confirmed the generated bundles include:

- `api-barbaari.pioneeriya.com`

The generated bundles also include `localhost` strings from bundled React Router/Axios browser internals. These are not the Barbaari API base URL and do not point application API calls to localhost.

## Post-Deployment Smoke Tests

Run these on staging:

1. Open `https://barbaari.pioneeriya.com/register`.
2. Submit a Family Child Care registration.
3. Log into Super Admin at `https://admin-barbaari.pioneeriya.com`.
4. Approve the application.
5. Confirm invite link points to `https://barbaari.pioneeriya.com/invite/{token}`.
6. Accept invite and create password.
7. Confirm payment gate appears.
8. Complete Stripe test checkout or local/staging-approved test payment.
9. Confirm family child care dashboard loads.
10. Create child without classroom.
11. Create/link guardian.
12. Confirm tablet parent mode shows only linked children.
13. Confirm tablet admin mode shows all family child care children.
14. Confirm Little Lantern center daycare still shows classrooms and classroom tablet flow.

## Risks

- Real email delivery is not verified unless staging mail credentials are configured and queue worker is running.
- Stripe end-to-end payment activation is not verified unless Stripe test keys and webhook secret are configured.
- GoDaddy routing must support SPA fallback on both frontend subdomains.
- CORS and Sanctum/session domain settings must match the staging domains.
