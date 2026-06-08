# Staging Deployment Update Notes

## Staging URLs

- Backend API: `https://api-barbaari.pioneeriya.com`
- Provider Web: `https://barbaari.pioneeriya.com`
- Super Admin Web: `https://admin-barbaari.pioneeriya.com`
- Tablet Web: `https://tablet-barbaari.pioneeriya.com`

## Required Frontend Build Variable

Build both web apps with:

```bash
VITE_API_URL=https://api-barbaari.pioneeriya.com/api
```

Verified local build output contains `api-barbaari.pioneeriya.com` and no exact `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:8000`, or `http://127.0.0.1:8000` app URLs.

## Backend Environment

Set these on staging:

```bash
APP_URL=https://api-barbaari.pioneeriya.com
DAYCARE_WEB_URL=https://barbaari.pioneeriya.com
FRONTEND_URL=https://barbaari.pioneeriya.com
SUPER_ADMIN_WEB_URL=https://admin-barbaari.pioneeriya.com
SANCTUM_STATEFUL_DOMAINS=barbaari.pioneeriya.com,admin-barbaari.pioneeriya.com,tablet-barbaari.pioneeriya.com
```

CORS defaults now include:

- `https://barbaari.pioneeriya.com`
- `https://admin-barbaari.pioneeriya.com`
- `https://tablet-barbaari.pioneeriya.com`

## GoDaddy Deployment Steps

1. Deploy backend changes to the API hosting directory.
2. Run backend commands:

```bash
php artisan migrate
php artisan config:clear
php artisan cache:clear
php artisan route:list
```

3. Build provider web:

```bash
VITE_API_URL=https://api-barbaari.pioneeriya.com/api npm --workspace @barbaari/daycare-web run build
```

4. Upload `apps/daycare-web/dist` to `barbaari.pioneeriya.com`.
5. Upload the same `apps/daycare-web/dist` to `tablet-barbaari.pioneeriya.com`.
6. Build Super Admin:

```bash
VITE_API_URL=https://api-barbaari.pioneeriya.com/api npm --workspace @barbaari/super-admin run build
```

7. Upload `apps/super-admin/dist` to `admin-barbaari.pioneeriya.com`.
8. Configure SPA fallback `.htaccess` on all frontend domains:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

## Staging QA Checklist

- Open provider registration at `https://barbaari.pioneeriya.com/register`.
- Confirm Family Child Care shows only Starter.
- Confirm Center Daycare shows all allowed plans.
- Submit Family Child Care application with location.
- Approve application in Super Admin.
- Confirm invite email is queued/sent.
- Confirm manual invite link starts with `https://barbaari.pioneeriya.com/invite/`.
- Accept invite and create password.
- Confirm unpaid user sees payment gate.
- Complete Stripe test payment or protected local/staging test payment.
- Confirm Family Child Care dashboard opens with no classrooms.
- Confirm Family Child Care tablet portal starts from children.
- Confirm Center Daycare tablet portal starts from classrooms.
- Confirm Little Lantern still works.

## Risks

- Real email delivery requires mail credentials and a running queue worker.
- Stripe payment activation requires staging Stripe test keys and webhook secret.
- Tablet browser geolocation must be tested on the deployed HTTPS tablet domain.
