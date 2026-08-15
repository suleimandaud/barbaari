# Barbaari — Production Deployment Guide

This is the practical "how to actually run this in production" guide: server setup, required software versions, environment variables, the deploy sequence, and rollback. It assumes traditional server hosting (a VPS, dedicated box, or managed PHP host) — there is no Docker, Kubernetes, or cloud-specific tooling anywhere in this repository, and none is assumed here. See `BLUE_GREEN_DEPLOYMENT_GUIDE.md` for the zero-downtime cutover strategy specifically; this document covers what has to be true before that strategy can be applied at all.

Every claim below was verified against the actual repository at `/Users/pioneer/barbaari` — versions come from `composer.json`/`package.json`, not assumption.

---

## 1. Server Requirements

**Backend (Laravel 12, `apps/backend/`)**
- PHP **8.2** or newer (`composer.json`: `"php": "^8.2"`)
- Required PHP extensions: the standard Laravel set (`pdo`, `mbstring`, `openssl`, `tokenizer`, `xml`, `ctype`, `json`, `bcmath`, `curl`, `fileinfo`, `gd` — used by `barryvdh/laravel-dompdf` for PDF generation) plus your chosen DB driver's PDO extension (`pdo_mysql` for production; `pdo_sqlite` is what tests use, not what production should use).
- **`pcntl` extension** — required for the queue worker to shut down gracefully on `SIGTERM` (finish the current job, then exit) instead of being killed mid-job. Not present on every minimal PHP CLI build — **verify this explicitly** on your target host before relying on graceful worker restarts (`php -m | grep pcntl`).
- Composer 2.x.

**Frontend (`apps/daycare-web`, `apps/super-admin`) and mobile (`apps/mobile`)**
- Node.js **20 LTS** (no `.nvmrc` exists in this repo; 20 is the safe floor — `apps/mobile`'s Expo SDK is `^54`, which targets Node 20+).
- npm (this is an npm workspaces monorepo — `package.json`'s `"workspaces": ["apps/*", "packages/*"]` — always run installs from the repo root, not inside an individual app).

**Database**
- MySQL (the app is written against MySQL-flavored SQL; SQLite is only used for the automated test suite via `phpunit.xml`). Any MySQL 8.x host works; no vendor-specific features were found in migrations beyond standard column types/indexes.

**Web server**
- Nginx or Apache in front of `public/index.php` (standard Laravel document root). No Laravel Octane, no Swoole — this is a conventional PHP-FPM deployment.

---

## 2. Required Environment Variables

Copy `apps/backend/.env.example` as the starting point — it is the authoritative list, and was checked this round for stray/duplicate keys (one was found and fixed: a duplicate `SUPER_ADMIN_WEB_URL` line). The categories that need real production values (not the example's dev defaults):

| Variable | Production value | Notes |
|---|---|---|
| `APP_ENV` | `production` | Gates CORS's permissive localhost rule off (`config/cors.php`) — verified this only relaxes when `APP_ENV !== 'production'`. |
| `APP_DEBUG` | `false` | Never `true` in production — a `true` value leaks stack traces in error responses. |
| `APP_KEY` | generated via `php artisan key:generate` | Required — `HealthController`'s environment check fails (503) if this is empty. |
| `APP_URL` | your real API domain | Used for URL generation (email links, etc.). |
| `TRUSTED_PROXIES` | your load balancer's IP/CIDR, or `*` only if you control it end-to-end | **New this round.** Without this, `$request->secure()` is always false behind a TLS-terminating proxy, silently disabling the HSTS header and any secure-cookie logic gated on it, and `$request->ip()` always resolves to the proxy, breaking the IP-keyed rate limiters on unauthenticated routes (`auth`, `invitations`, `pin`). |
| `DB_CONNECTION` / `DB_HOST` / `DB_DATABASE` / `DB_USERNAME` / `DB_PASSWORD` | your MySQL instance | `.env.example` defaults to `sqlite` for zero-setup local dev only. |
| `SESSION_SECURE_COOKIE` | `true` | Must be true once served over HTTPS. |
| `LOG_STACK` | `daily` (not the example's `single`) | See §7 — the example default does not rotate. |
| `QUEUE_CONNECTION` | `database` (as-is) or `redis` if you've provisioned Redis | See §5 — no worker is configured by this repo either way. |
| `CACHE_STORE` | `database` (as-is) or `redis` | Redis config is fully scaffolded in `.env.example` but unused by default. |
| `MAIL_MAILER` | `resend` (or your real transactional provider) | The example defaults to `log` (emails never actually sent, just written to the log file) — correct for dev, silently wrong if left in production. |
| `RESEND_API_KEY` | real key | Only needed if `MAIL_MAILER=resend`. |
| `STRIPE_MODE` | `live` | The example is `test`. |
| `STRIPE_PUBLIC_KEY` / `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | real live-mode values | `sk_live_...` / `pk_live_...` / a real `whsec_...` from your Stripe webhook endpoint configuration. |
| `BILLING_TEST_PAYMENT_ENABLED` | `false` | Verified this gates a test-only payment-confirmation endpoint (`isTestPaymentEnabled()` in `ApiController.php`) — must be false in production. |
| `FILESYSTEM_DISK` | `local` (default) or `s3` | See §9 — S3 credentials are already scaffolded in `.env.example`, just unset. |
| `USPS_CONSUMER_KEY` / `USPS_CONSUMER_SECRET` | real credentials | Needed for the address-validation feature to work at all; the app degrades gracefully without them but registration address validation will be skipped. |
| `GEONAMES_USERNAME` | a free GeoNames account username | Second timezone-lookup provider; without it, TimeAPI is the only provider and an outage there has no fallback. |

**Not yet decided by this repo:** `AWS_*` variables exist as unused scaffold. Nothing forces you toward AWS — `local` disk works today, S3 is an option, not a requirement.

---

## 3. Deployment Steps (single-server / traditional hosting)

This is the baseline sequential deploy. For zero-downtime, see `BLUE_GREEN_DEPLOYMENT_GUIDE.md` — the steps below are the same operations, just performed against one live server instead of an idle one.

```bash
# 1. Pull code
git pull origin main

# 2. Backend dependencies (no dev dependencies in production)
cd apps/backend
composer install --no-dev --optimize-autoloader --no-interaction

# 3. Database migrations — additive-only migrations are safe to run before cutover;
#    see BLUE_GREEN_DEPLOYMENT_GUIDE.md §Database Strategy for why this matters.
php artisan migrate --force

# 4. Cache framework config/routes/views (safe — no direct env() calls exist in app/
#    outside config/ files, verified this round by grep; config:cache is safe to use)
php artisan config:cache
php artisan route:cache
php artisan view:cache

# 5. Frontend builds (from repo root — npm workspaces)
cd ../..
npm ci
npm --workspace @barbaari/daycare-web run build
npm --workspace @barbaari/super-admin run build
# Publish apps/daycare-web/dist and apps/super-admin/dist to your static host/CDN/web root.

# 6. Restart PHP-FPM (picks up the new autoloader/cached config)
sudo systemctl reload php8.2-fpm

# 7. Restart queue workers (see §5 — they hold old code in memory until restarted)
sudo systemctl restart barbaari-queue

# 8. Verify
curl -f https://your-api-domain/api/health
```

`php artisan optimize:clear` is the escape hatch if `config:cache`/`route:cache` ever cause confusing behavior during a deploy — it clears all four caches (config, route, view, event) in one command.

---

## 4. Storage

- Default disk is `local` (`FILESYSTEM_DISK=local`) — uploaded documents live on the app server's own disk (`storage/app/`), not object storage. Confirmed no code path serves these files via a public URL/symlink; downloads go through an authenticated Laravel route (`ApiController::downloadDocument` → `Storage::disk($disk)->download(...)`), so `php artisan storage:link` is not required for current functionality.
- **This means uploaded documents do not survive losing that specific server**, and — critically for blue-green — **are not automatically visible to a second server**. If you run more than one app server (which blue-green requires, even if "blue" and "green" are the same physical box at different times), local-disk storage must live on shared/networked storage, or you migrate to S3 (`FILESYSTEM_DISK=s3` — credentials are already scaffolded in `.env.example`, this is a config change, not new code).

---

## 5. Queue Workers

- **No queue worker process, systemd unit, or supervisor config exists anywhere in this repository.** Every transactional email (password resets, invitations, invoice notices, subscription-activation notices) is dispatched via `Mail::queue()` — confirmed by grep across `ApiController.php`, `AuthController.php`. **Without a running worker, these emails are written to the `jobs` table and never sent — silently, with no error surfaced anywhere.**
- Recommended production setup (systemd, since no containerization exists):

```ini
# /etc/systemd/system/barbaari-queue.service
[Unit]
Description=Barbaari queue worker
After=network.target mysql.service

[Service]
User=www-data
WorkingDirectory=/var/www/barbaari/apps/backend
ExecStart=/usr/bin/php artisan queue:work --sleep=3 --tries=3 --max-time=3600
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

- `--max-time=3600` makes the worker exit cleanly after an hour (systemd restarts it), which naturally picks up any code deployed via `composer install` since the last restart — without this, a long-running worker process keeps the *old* PHP opcode/class definitions in memory indefinitely after a deploy.
- `--tries=3` sends a job to `failed_jobs` (table confirmed present, `0001_01_01_000002_create_jobs_table.php`) after 3 attempts instead of retrying forever.
- Graceful shutdown: `systemctl stop`/`restart` sends `SIGTERM`; Laravel's worker finishes the in-flight job before exiting **if the `pcntl` extension is loaded** (see §1) — confirm this on your target host, since a worker without `pcntl` can be killed mid-job on restart.
- **Nothing in this repo monitors `failed_jobs` growth or queue depth.** See the monitoring recommendation in `FINAL_PRODUCTION_DEPLOYMENT_REPORT.md`.

---

## 6. Scheduler / Cron

- **No Laravel scheduler is configured.** `routes/console.php` contains only the stock `inspire` Artisan command; no `Schedule::` calls exist anywhere; there is no `app/Console/Kernel.php` (Laravel 11+ removed the mandatory Kernel class, but a scheduler still needs at least one `Schedule::command(...)` call somewhere to do anything).
- **There are currently no scheduled jobs to run** — this was checked, not assumed: no code anywhere expects to be invoked periodically (no "last run at" columns, no stale-data cleanup jobs, no report-generation commands). If a future need arises (e.g., subscription renewal reminders, stale-invitation cleanup), the standard Laravel cron entry is:

```cron
* * * * * cd /var/www/barbaari/apps/backend && php artisan schedule:run >> /dev/null 2>&1
```

— but until `routes/console.php` actually has a `Schedule::` entry, adding this cron line does nothing. Not added speculatively, per this round's "don't redesign" constraint.

---

## 7. Logging

- `LOG_STACK` defaults to `single` in `.env.example` (one ever-growing `storage/logs/laravel.log`, no rotation) even though `LOG_DAILY_DAYS=14` is also configured — that setting only takes effect if `LOG_STACK` includes `daily`. **Set `LOG_STACK=daily` in production.**
- Every request now carries a correlation ID (`AssignRequestId` middleware, added this round), automatically merged into every log line via Laravel's `Context` facade, and echoed back as an `X-Request-Id` response header — verified working end-to-end this round.
- Recommend shipping `storage/logs/` to a log aggregator (see monitoring recommendations in the final report) rather than relying on local disk retention alone, especially once running more than one app server.

---

## 8. SSL / HTTPS

- Terminate TLS at the reverse proxy/load balancer (not in PHP-FPM). Once `TRUSTED_PROXIES` is set correctly (§2), the app will correctly detect the original request was HTTPS and:
  - Send `Strict-Transport-Security` (added this round, `AddSecurityHeaders.php`, gated on `$request->secure()`).
  - Respect `SESSION_SECURE_COOKIE=true`.
- HSTS is now set at the application layer as defense-in-depth, but **should also be set at the reverse proxy/CDN layer** — this repository cannot verify whether your actual production edge already does this.

---

## 9. Stripe

- Webhook endpoint: `POST /api/webhooks/stripe` (verified in `routes/api.php`) → `stripeWebhook()`. Configure this URL in the Stripe Dashboard and set `STRIPE_WEBHOOK_SECRET` to the signing secret Stripe gives you for that specific endpoint.
- Both the signing-verification failure path and the general processing-failure path now log via `Log::` (added this round) — previously only a message string was persisted on the `PaymentProviderEvent` row, invisible without a DB query.
- The Stripe SDK has a hard 15s/5s (request/connect) timeout configured (`StripeService.php`, verified present) — a Stripe outage fails fast instead of hanging a request.
- Webhook idempotency is handled via the `PaymentProviderEvent.status` check (`duplicate_ignored` path) — safe to receive the same Stripe event twice (Stripe explicitly documents at-least-once delivery).

---

## 10. Rollback (application-level)

See `BLUE_GREEN_DEPLOYMENT_GUIDE.md` for the zero-downtime version. For a traditional single-server deploy:

```bash
git checkout <previous-release-tag>
cd apps/backend && composer install --no-dev --optimize-autoloader
php artisan migrate:rollback --step=<N>   # only if the new release's migrations need reverting — see §Database Migration Safety below
php artisan config:cache && php artisan route:cache && php artisan view:cache
sudo systemctl reload php8.2-fpm
sudo systemctl restart barbaari-queue
```

**Database migration rollback safety — audited this round.** Every migration in `database/migrations/` was reviewed. Three had incomplete `down()` methods that would have left a schema/rollback-ledger mismatch (columns silently left in place after "rolling back"); all three are now fixed and **actually tested** by running `up()` then `down()` against a real SQLite database and confirming the affected columns/tables were genuinely removed:
- `2026_05_25_000002_expand_organization_onboarding_fields.php`
- `2026_05_14_090000_expand_super_admin_platform_tables.php`
- `2026_05_25_000001_create_platform_billing_tables.php`

No migration in the codebase drops or renames a column that old application code still depends on — every schema change reviewed is additive/nullable-or-defaulted, which is also what makes this codebase compatible with blue-green in the first place (see the other guide).

---

## 11. Monitoring & Backups

Not implemented in this pass (both require infrastructure/credentials outside this repository) — see `FINAL_PRODUCTION_DEPLOYMENT_REPORT.md` for the full checklist and recommended (lightweight, not cloud-locked) stack. In short: **no database backup script or schedule exists anywhere in this repository**, and this must be set up before real customer data is at risk — it is the single most important external step this guide cannot complete for you.
