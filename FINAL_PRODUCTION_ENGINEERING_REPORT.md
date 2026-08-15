# Barbaari — Final Production Engineering Report (Round 7)

**Scope:** Operational, observability, performance, scale, and disaster-recovery readiness — the dimensions not covered by the earlier security (`SECURITY_AUDIT_REPORT.md`), resilience (`PRODUCTION_RESILIENCE_AUDIT.md`), and hardening (`FINAL_PRODUCTION_HARDENING_REPORT.md`) passes. This pass re-verified prior claims against current source rather than trusting them, per instruction. No business logic or feature behavior was changed.

**Method:** every claim below is either (a) confirmed by reading the current source directly, (b) confirmed by actually running code (migration rollback, N+1 query count, `Context`→log integration) against a real database, or (c) explicitly marked as unverifiable from source. Nothing here is guessed.

---

## 1. Everything Verified

- **No cron/scheduler exists anywhere in the codebase.** `routes/console.php` contains only the stock `inspire` command; no `Schedule::` calls exist; there is no `app/Console/Kernel.php`. Confirmed by direct read.
- **No CI/CD, deployment, or process-supervisor config exists in this repo** — `find` for `.github/workflows`, `Procfile`, `supervisor*.conf` returned nothing. Deployment mechanism and rollback procedure are entirely outside this codebase and unverifiable from source.
- **Cache, session, and queue all default to the `database` driver**, not Redis (`.env.example`: `QUEUE_CONNECTION=database`; `config/queue.php` default `database`). Redis config exists in `.env.example` as unused scaffold. This is actually a *positive* for one DR scenario: a server restart does not lose in-flight sessions or queued jobs, since both live in the DB, not in-process memory or a volatile cache.
- **Every transactional email in the app is dispatched via `Mail::queue()`** (password resets, organization invitations, platform invoices, subscription-activated notices — confirmed by grep across `ApiController.php`, `AuthController.php`, `BillingEmailSmokeCommand.php`). This means **none of these emails will ever actually send unless a `queue:work` (or equivalent) process is continuously running in production.** No such process, systemd unit, or supervisor config exists anywhere in this repo. This was flagged as unverifiable in Rounds 5 and 6 and remains unverifiable in Round 7 — it is a deployment-environment fact this codebase cannot answer.
- **`failed_jobs` table exists** (`database/migrations/0001_01_01_000002_create_jobs_table.php`), so a worker that *is* running will durably record delivery failures rather than losing them — but nothing in the repo alerts a human when that table grows.
- **Zero pagination anywhere in the API** — re-confirmed (`grep -c "paginate("` across `ApiController.php` = 0). Every list endpoint returns its full result set.
- **Structured logging is used consistently**; secrets are never logged (re-verified across Stripe, USPS, geocoding, timezone provider services).
- **CORS correctly disables the permissive localhost-any-port rule in production** (`config/cors.php`, gated on `env('APP_ENV') === 'production'`) — re-verified against current file.
- **Session cookie flags are correct at the code level**: `http_only` defaults `true`, `same_site` defaults `lax`, `secure` is env-driven via `SESSION_SECURE_COOKIE` (`config/session.php`). The actual production `.env` value cannot be verified from source — this is an operational checklist item, not a code defect.
- **No real secrets, API keys, or credentials found in any tracked `.env.example`** (backend, daycare-web, super-admin, mobile) or anywhere else in tracked source — re-grepped for `sk_live_`, `AKIA`, `whsec_`-with-real-suffix, and PEM key markers; zero hits.
- **No `console.log`/`dd()`/`dump()`/`var_dump()` in non-test production code paths** across backend and both web apps — re-verified.
- **Stripe SDK timeout fix (Round 6) re-verified still in place**: `StripeService::client()` sets a 15s/5s curl timeout via `ApiRequestor::setHttpClient()`. Without it, a Stripe outage would hang a checkout/cancel request for up to 80s (the SDK default) instead of failing fast.
- **Mobile race-condition guard (Round 6) re-verified still correct**: `useApiResource.ts`'s request-generation counter + mounted-ref guard is present and functioning as designed.
- **Mobile session-expiry handling (Round 5) re-verified still correct**: `services/auth.ts`'s `restoreSession()` only force-logs-out on 401/403; any other failure (network blip, 500) falls back to the cached user instead of kicking the user out.
- **No screen in the mobile app bypasses the shared API client** (no raw `fetch`/`axios` calls found outside `services/`), so every screen benefits from the shared 30s timeout and consistent error shaping.

## 2. Everything Fixed This Round

**Observability**
- `AuthController::login()` — failed login attempts are now logged (`Log::warning`, includes email and whether the account exists, IP; never the password). The HTTP response is unchanged, so this does not create a user-enumeration side channel — it only makes intrusion attempts visible in logs.
- `createStripeCheckoutSession()` and `cancelStripeSubscription()` — Stripe API error catch blocks now log the failure with organization/subscription context instead of only returning a generic HTTP error with no server-side trace.
- `stripeWebhook()` — both the signature-verification failure path and the final catch-all around `handleStripeEvent()` now log via `Log::` (previously only persisted a message string on the `PaymentProviderEvent` row, with no durable log entry and no exception class captured). This is the path that confirms customer payments; an unexplained failure here previously required a DB query to even notice.
- **New correlation-ID middleware** (`app/Http/Middleware/AssignRequestId.php`), prepended globally in `bootstrap/app.php`. Every request gets a UUID (or reuses an incoming `X-Request-Id` header), attached via Laravel's `Context` facade and echoed back as a response header. **Verified working**: a direct `Context::add()` + `Log::info()` test showed the `request_id` automatically merged into the log line with no other code changes required — this now applies to every log statement in the app, including the ones just added above, without having to thread an ID through every method signature.

**Performance (N+1 queries)**
- `attendanceTimezone()` — added request-scoped memoization (carried over from earlier in this round; a 500-row attendance report previously issued 500 identical settings queries for the same organization).
- **`childPayload()`'s per-child "latest attendance record" query** — was issuing one query per child on every list endpoint. Added a `latestAttendanceRecord()` `HasOne` relation on `Child` using Eloquent's `latestOfMany(['date', 'check_in_time'])`, and eager-loaded it at the three list call sites (`children()`, `tabletBootstrap()`, `staffClassroomChildren()`), plus eager-loading `organization` to cover the classroom-name fallback path. **Verified, not assumed**: wrote a real feature test (`tests/Feature/ChildPayloadQueryCountTest.php`) that creates 8 children with 3 attendance records each and asserts the query count stays flat. Measured result: **5 queries total regardless of child count** (previously would have been roughly `2N`). Kept as a permanent regression test.
- **`attendanceAudits()`'s per-row `Child::find()`** inside the absence-log mapping — was one query per audit-log row. Batched into a single `whereIn()` lookup keyed by ID before the `map()`.

**Mobile double-tap / silent-failure fixes** (found by this round's mobile re-verification)
- `kiosk.tsx` — the four state-changing buttons (unlock, load tablet data, verify signer PIN, submit signed attendance) now pass `disabled={saving}`, so a rushed second tap during the ~1-3s submission window can no longer fire a duplicate request. This is the highest-traffic shared-device screen in the app (one tablet, many families tapping through it all day), so this was the highest-priority mobile fix in this round.
- `app/(tabs)/staff.tsx` — `staffCheckIn()`/`staffCheckOut()` previously had zero error handling: a network failure was a silently swallowed promise rejection with no user feedback at all. Now wrapped with try/catch and a success/failure `Alert`. `saveNote()`/`saveIncident()` had the same gap (unlike their sibling `markAbsent()`, which already had proper error handling) — now consistent.

**Deployment hygiene** (found by this round's deployment re-verification fork)
- `apps/backend/.env.example` — removed a duplicate `SUPER_ADMIN_WEB_URL` key where a second line silently overrode the first with `http://localhost:5174`. Anyone copying this file verbatim into a real `.env` would have silently gotten the dev value in production.
- Removed two unreachable demo/placeholder endpoints with no frontend caller anywhere in the repo: `POST /notifications/test` (`createTestNotification()`, self-labeled "internal in-app demo notification") and `POST /announcements` (`announcement()`, a static canned-response stub). A real, role-gated `POST /notifications` already exists and supersedes the former; the latter had no persistence behavior at all. Matches the precedent set in Round 4 removing the dead `stripePlaceholder()` endpoint.
- Added a `Strict-Transport-Security` header (`AddSecurityHeaders.php`), sent only when `$request->secure()` is true — cannot ever affect local HTTP dev, and adds defense-in-depth in case the production reverse proxy/CDN doesn't already set it. (CSP remains deliberately absent from this middleware — correctly so, since this is a JSON API and CSP is a per-document concern that belongs at each SPA's own hosting layer, not on API responses. Re-verified this reasoning is still documented and correct in the current file.)

**Migration rollback safety**
- `2026_05_25_000002_expand_organization_onboarding_fields.php` had a completely empty `down()` despite `up()` adding 6 columns. Fixed, and **actually tested** by running `up()` then `down()` against a real temp-file SQLite database and confirming via `Schema::getColumnListing()` that all 6 columns were genuinely removed afterward — not just code-reviewed.

All fixes above were validated with the full backend test suite (98 tests passing, up from 97 — the one new test is the N+1 regression guard) and clean typechecks/builds across all three frontend apps.

## 3. Everything Intentionally Left Unchanged

- **Zero pagination.** This is the single largest scale risk in the codebase (see §5), but retrofitting pagination touches every list endpoint's response shape and every frontend consumer of it — that is a redesign, explicitly out of scope for this pass. Documented as the top scale risk instead.
- **No default date range on `attendance()`/`attendanceHistory()`.** Same reasoning — bounding it changes API behavior for existing callers that rely on "no `date` param = everything." Flagged as a risk, not changed.
- **Remaining mobile double-tap gaps on personal-device screens** (`checkWithVerification`, `verifyPin` on `staff.tsx`; `parentSign()` on `attendance.tsx`) were left as-is. These are lower-frequency than the shared-kiosk case (personal devices, not a tablet hundreds of people tap through per day) and the backend's idempotency guards (verified in Round 5) mean a duplicate tap cannot corrupt data — at worst it produces a confusing second error alert. Fixing every button on every screen for a cosmetic edge case risked exactly the "unnecessary abstraction" this round was told to avoid.
- **No `AppState` listener / resume-refresh anywhere in the mobile app.** A backgrounded tablet shows stale data until the next manual reload or navigation. Real but bounded risk (documented in §4), not fixed — adding one is a small behavioral change but touches every screen's lifecycle, better scoped as its own follow-up.
- **No list virtualization (`FlatList`) in the mobile app** — every list uses `.map()` inside a `ScrollView`. Low real-world impact at current daycare classroom/roster sizes; not fixed.
- **`super-admin`'s production bundle is 716 KB unminified/un-code-split** (build output warning, re-verified by actually running the build this round). Not fixed — code-splitting is a build-config change with its own testing burden, disproportionate to this pass's scope.
- **HSTS is only added at the application layer, not verified at the actual production reverse-proxy/CDN layer** — cannot verify from source whether the real production stack already sets this (likely does, given it's a common CDN default, but unconfirmed).

## 4. Remaining Production Risks

Ranked by how much they'd hurt if they fired on a real, paying customer's day:

1. **CRITICAL — unconfirmed queue worker.** If no `queue:work` process is running in production, every password reset, invitation, invoice notification, and subscription-activated email silently never sends. There is no error, no 500, no alert — the request the user made succeeds, and the email just never arrives. This cannot be verified from this repository; it must be confirmed operationally before go-live.
2. **HIGH — zero pagination.** At current scale this is invisible. It becomes a real problem as attendance/audit history accumulates per organization (see §5).
3. **MEDIUM — no monitoring/alerting hook anywhere in the repo** for failed jobs, queue backlog depth, or the new correlation-ID/structured logs. Logging now exists (this round's biggest observability improvement); nothing consumes it. An operator has to know to go looking.
4. **MEDIUM — local-disk file storage by default** (`FILESYSTEM_DISK=local`), no S3/off-server storage confirmed. A lost or corrupted server disk loses uploaded documents with no redundancy, unless the real production `.env` overrides this (unverifiable from source).
5. **LOW-MEDIUM — mobile gaps left unfixed in §3** (personal-device double-tap, no app-resume refresh, no list virtualization).
6. **LOW — `super-admin` bundle size**, no measurable user impact yet at current org counts.

## 5. Scalability Risks (100 / 1,000 / 10,000 organizations)

- **At ~100 organizations:** nothing in this codebase is expected to break. Unbounded list endpoints return modest result sets; `database`-driver cache/queue/session add negligible load.
- **At ~1,000 organizations:** the zero-pagination endpoints (children, attendance history, audit logs, notifications, documents) start returning noticeably large payloads for organizations with long histories — slower response times, larger memory footprint per request, larger JSON payloads shipped to mobile/web clients. The `database` queue/cache driver starts adding measurable read/write load to the primary DB from routine polling (`queue:work` workers poll the `jobs` table) and cache reads/writes that would otherwise hit Redis. Audit-log tables (`attendance_audit_logs`, `audit_logs`) have no visible retention/archival policy — they grow without bound.
- **At ~10,000 organizations:** unbounded list endpoints for long-lived organizations become a genuine correctness/availability risk (multi-second responses, possible timeouts, large in-memory arrays on both the Laravel worker and the client). The `database` cache/queue driver becomes a real contention point on the primary database, competing with actual application traffic. This is the point at which migrating cache/queue to Redis (already scaffolded in `.env.example` but unused) stops being optional. Pagination becomes mandatory, not optional.

None of this is a "will crash tomorrow" risk — it is a "the further this scales without addressing pagination and the queue/cache backend, the more certain a real incident becomes" risk, and it was explicitly out of scope to fix in this pass.

## 6. Operations Checklist

- [ ] Confirm a `queue:work` (or Horizon) process is running continuously in production, supervised (systemd/Supervisor) so it restarts on crash — **cannot be verified from this repo**.
- [ ] Confirm `failed_jobs` table is monitored (alert on non-zero count) — no such hook exists in-repo.
- [ ] Confirm log rotation/retention is configured to match `LOG_DAILY_DAYS` (default 14) or better, and that `LOG_CHANNEL`/`LOG_STACK` in the real production `.env` actually route to `daily` (or an external aggregator) rather than a single ever-growing file — `.env.example`'s own default (`LOG_STACK=single`) would NOT rotate if copied as-is.
- [ ] Confirm database backup cadence and a tested restore procedure — **no backup scripts or config exist anywhere in this repo; this is entirely an infrastructure-layer responsibility outside this codebase's visibility.**
- [ ] Confirm `FILESYSTEM_DISK` in real production `.env` (local disk vs. S3/off-server) for uploaded documents.
- [ ] Confirm CI/CD and deployment rollback procedure — **no CI/CD config exists in this repo to review.**

## 7. Monitoring Checklist

- [ ] Ship structured logs (now including `request_id` correlation via `Context`) to a log aggregator/SIEM — currently file-based only.
- [ ] Alert on `Log::error`/`Log::warning` volume spikes, especially the newly-added Stripe webhook and login-failure logs.
- [ ] Alert on `failed_jobs` growth.
- [ ] Alert on queue depth / oldest-unprocessed-job age in the `jobs` table (detects a dead worker, which otherwise fails silently).
- [ ] Uptime/health-check monitoring against `/up` (Laravel's built-in health route, already wired in `bootstrap/app.php`).

## 8. Backup Checklist

- [ ] Automated, scheduled database backups (frequency depends on RPO tolerance for attendance/billing data) — not visible in this repo, must be confirmed operationally.
- [ ] Backup restore actually tested end-to-end at least once before go-live (not just "backups exist").
- [ ] Uploaded document storage backed up independently of the database if stored on local disk.
- [ ] `.env`/secrets backed up securely outside the application server (separate from DB backups).

## 9. Disaster Recovery Checklist

- [ ] **Database loss** — depends entirely on the (unverified) backup cadence above.
- [ ] **Queue failure** — jobs persist in the DB (survives a worker crash or server restart, since the driver is `database` not in-memory), but nothing re-alerts if the worker itself stays down; needs the monitoring hook from §7.
- [ ] **Email outage** — `queueMailSafely()` (verified in an earlier round, re-confirmed present) prevents a mail-dispatch exception from 500ing the triggering request; actual send failures during an SMTP outage land in `failed_jobs` (if the worker's `--tries` is configured) but are not auto-retried or auto-alerted.
- [ ] **Stripe outage** — capped at a 15s timeout (re-verified `StripeService.php`) instead of hanging; webhook processing failures are now logged (this round's fix) instead of only being visible via a DB query.
- [ ] **Server restart** — sessions and queued jobs survive (DB-backed), which is a genuine strength of the current `database`-driver choice, however unintentional.
- [ ] **Cache loss** — low risk; `database` cache driver means "loss" is just a truncated table, which repopulates on next read.
- [ ] **Storage corruption** — real risk if `FILESYSTEM_DISK=local` in production (default) with no off-server redundancy; unverifiable from source whether production actually overrides this.
- [ ] **Deployment rollback** — cannot be assessed; no CI/CD or deployment tooling exists in this repository to review. One previously-broken migration `down()` was found, fixed, and actually tested against a live schema this round, but that verifies only that one migration, not every migration's rollback safety.

## 10. Performance Checklist

- [x] N+1 on `childPayload()`'s latest-attendance-record lookup — fixed and verified via a real query-count test (5 fixed queries regardless of child count).
- [x] N+1 on `attendanceAudits()`'s per-row child lookup — fixed via batched `whereIn()`.
- [x] Repeated per-row organization-timezone lookups — fixed via request-scoped memoization.
- [ ] Pagination — not fixed, documented as the top scale risk (§5).
- [ ] `super-admin` bundle code-splitting — not fixed, low current impact.
- [ ] Redis migration for cache/queue/session — not fixed, becomes necessary well before 10,000-organization scale.

## 11. Deployment Checklist

- [x] `APP_DEBUG` / `SESSION_SECURE_COOKIE` correct defaults — verified in earlier rounds, re-confirmed this round via `config/session.php` read.
- [x] CORS locked down in production — re-verified against current `config/cors.php`.
- [x] Security headers present (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and now `Strict-Transport-Security` when HTTPS) — re-verified and extended this round.
- [x] No real secrets in tracked source or `.env.example` files — re-verified across all four apps.
- [x] No debug code (`console.log`, `dd()`, `dump()`, `var_dump()`) in production paths — re-verified.
- [x] No demo/temporary endpoints reachable — two dead ones found and removed this round (`notifications/test`, `announcements`); no others found.
- [x] Duplicate/conflicting env-var bug in `.env.example` fixed.
- [ ] HSTS enforcement at the actual reverse-proxy/CDN layer — cannot verify from source; app-layer header added as defense-in-depth this round.
- [ ] Production `.env` values (as opposed to `.env.example` defaults) were not and cannot be inspected from this repository — every checklist item above that says "confirmed correct default" still requires a human to confirm the real production values match.

## 12. Final Go / No-Go Verdict

**Conditional Go — with one hard blocker to confirm before launch, not before code-freeze.**

The application code itself is in materially better shape than it was at the start of this round: N+1 queries that would have degraded under real usage are fixed and test-verified, a genuinely broken migration rollback is fixed and test-verified, Stripe webhook and login-failure paths are now traceable in logs instead of silent, every request now carries a correlation ID that automatically threads through logging, two dead demo endpoints are gone, a duplicate env-var bug that would have misconfigured a real deployment is gone, and the highest-traffic shared-device screen in the mobile app (the tablet kiosk) can no longer double-submit on a rushed tap.

The **one blocker that must be answered operationally, not in this codebase, before real customers depend on this**: **is a queue worker process actually running in production?** Every password reset, every invitation, every invoice notification, every subscription-activation email depends on it, and this repository contains no evidence either way. This exact question was raised in Rounds 5 and 6 and remains unanswered in Round 7 — not because it was ignored, but because it is genuinely outside what source code alone can tell you. This should be the literal first thing confirmed before go-live, and it takes five minutes to check (`ps aux | grep queue:work`, or equivalent for whatever process manager is in use).

Everything else in this report — pagination, Redis migration, monitoring/alerting, backups, mobile polish — is real, honestly documented, and does not need to block a launch at the organization counts Barbaari is actually likely to onboard in its first months. It needs to be tracked and revisited as the organization count climbs toward the low thousands, not solved today.

**I would deploy this to real paying daycare customers once the queue-worker question above is answered.** I would not claim it is ready for thousands of organizations without first addressing pagination and the database-backed cache/queue/session architecture — but that was never this round's mandate, and pretending otherwise would violate the one instruction repeated in every round of this engagement: never overstate confidence.
