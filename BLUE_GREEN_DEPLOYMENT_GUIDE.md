# Barbaari — Blue-Green Deployment Guide

This document covers the zero-downtime cutover strategy specifically: architecture, traffic flow, the actual switch/rollback procedure, and how each stateful piece of this app (database, queue, cache, sessions, storage) behaves during the window where old and new code are both live.

**Scope note, stated plainly:** this codebase does not use Docker, Kubernetes, or a specific cloud provider anywhere, and nothing here invents one. The architecture below is the traditional-hosting form of blue-green — two identical server environments and an atomic traffic switch between them — because that's what naturally fits a repository with no containerization and no cloud SDK dependencies. If you later containerize, the same sequence maps directly onto two container sets behind a load balancer; nothing about the deploy *logic* below changes, only the mechanics of step "ship release to the idle slot."

---

## 1. Architecture

```
                          ┌─────────────────────┐
                Internet ─┤   Load Balancer /    │
                          │   Reverse Proxy       │  ← TRUSTED_PROXIES must include this
                          │  (TLS termination)    │
                          └──────────┬───────────┘
                                     │  routes 100% of traffic to
                                     │  whichever slot is "live"
                       ┌─────────────┴─────────────┐
                       │                             │
                ┌──────▼──────┐              ┌───────▼──────┐
                │  BLUE slot   │              │  GREEN slot   │
                │ (app server, │              │ (app server,  │
                │  PHP-FPM +   │              │  PHP-FPM +    │
                │  queue       │              │  queue        │
                │  worker)     │              │  worker)      │
                └──────┬───────┘              └───────┬───────┘
                       │                              │
                       └──────────────┬───────────────┘
                                      │
                         ┌────────────▼────────────┐
                         │   Shared MySQL database   │  ← single source of truth,
                         │   Shared file storage     │     NOT duplicated per slot
                         │   (local disk needs to be  │
                         │    shared/networked, or S3)│
                         └────────────────────────────┘
```

The critical architectural fact, verified against this codebase: **the database, cache, queue, and session backends are all the same shared MySQL instance** (`CACHE_STORE=database`, `QUEUE_CONNECTION=database`, `SESSION_DRIVER=database`, all confirmed in `.env.example`/`config/*.php`). Blue and green are not two independent stacks — they are two application-code deployments sharing one stateful backend. This is actually what makes blue-green *simpler* here than in an architecture with per-slot caches: there is no cache-warming problem, no "green slot has a cold cache" latency spike, and sessions survive a cutover transparently, because both slots read/write the same session table.

**File storage is the one piece that is NOT automatically shared.** `FILESYSTEM_DISK=local` by default means uploaded documents live on whichever server's disk they were uploaded to. If blue and green are different physical machines, this breaks — see §6.

---

## 2. Traffic Flow During a Deployment

1. **Steady state**: one slot (say, blue) is "live" — 100% of traffic. The other (green) is idle, running whatever code was live two deployments ago (or nothing, if freshly provisioned).
2. **Deploy to idle slot**: new code goes to green. Green is *not yet* receiving public traffic.
3. **Migrate**: `php artisan migrate --force` runs once, against the shared database, from the green slot (or a dedicated deploy step — it doesn't matter which slot runs it, since the DB is shared). **Blue is still live and still running old code against the now-migrated schema** — this is the crux of blue-green migration safety (§4).
4. **Health-check green**: hit green's `/api/health` directly (not through the load balancer) until it reports `200`.
5. **Cutover**: the load balancer's routing is atomically switched from blue to green. This should be a single config change (reload an nginx upstream, flip a load balancer target group, update a routing rule) — not a gradual traffic ramp, which this app has no support for (no canary/percentage-based feature flagging exists, see §8).
6. **Blue becomes idle**, still running the previous release, still fully warmed, **not stopped**. This is what makes rollback fast (§7).
7. **Next deployment**: blue becomes the new idle target; roles swap.

---

## 3. Health Checks

Use the deep health endpoint added this round: `GET /api/health` (`HealthController`, `routes/api.php`). It checks database connectivity, cache read/write, filesystem read/write, queue backend reachability, and mail configuration — verified working via a real test suite this round, including a genuine negative-path test that a broken dependency actually returns `503`.

| Check | Critical? | Behavior |
|---|---|---|
| `database` | Yes | 503 if unreachable — the app cannot function without it. |
| `cache` | Yes | 503 if the `database` cache store can't be written/read. |
| `filesystem` | Yes | 503 if the configured disk can't be written/read. |
| `environment` | Yes | 503 if `APP_KEY` is unset. |
| `queue` | No (warn only) | Does not 503 — a stalled queue shouldn't pull an otherwise-healthy web instance out of rotation. |
| `mail` | No (warn only) | Same reasoning. |

**Expected HTTP responses:**
- `200` with `{"status": "ok", ...}` — safe to route traffic here.
- `503` with `{"status": "down", ...}` — do not cut traffic to this slot; if already live, this should page someone.

Use this endpoint, not Laravel's built-in `/up`, for the go/no-go decision in step 4 above — `/up` only confirms the app boots and returns a response; it does not touch the database, cache, or filesystem, so it would report healthy even if the database were unreachable.

---

## 4. Database Strategy (the part that actually determines blue-green safety)

A migration is blue-green-safe only if the **old** code (still live on the other slot during the cutover window) keeps working against the **new** schema. This repository's migrations were fully audited this round for exactly this property.

**Result: no blue-green blocker exists in the current migration set.** Every migration adds columns as either `->nullable()` or `->default(...)` — none of them drop or rename a column that old code still reads or writes, and none add a `NOT NULL` column without a default to a populated table (which would break old code's `INSERT` statements or lock a large table). This was verified by reading every migration file, not sampled.

**Rules for all future migrations, to keep this property true:**
1. **Additive changes are always safe to run before cutover**: new nullable/defaulted columns, new tables, new indexes on new columns.
2. **Never combine a schema change with a destructive data rewrite in the same migration.** One migration in this codebase's history did this (`2026_05_17_100000_add_real_pin_verification.php` — added `pin_hash` and simultaneously nulled out the old plaintext `pin` column it replaced). That specific migration already ran and isn't a live risk, but it's the exact pattern that breaks blue-green: if this shape is deployed while old code is still live, the *old* code, still reading the plaintext column, breaks the instant the migration runs — before cutover has even happened. The safe version is two migrations, two deploys apart: (a) add the new column, deploy code that writes to both old and new columns, (b) once fully cut over, backfill and drop the old column in a later release.
3. **Renaming a column is never safe in one step.** Add the new name, deploy code that reads/writes both, cut over, then drop the old name in a subsequent release.
4. **A migration that would lock a large, actively-written table** (e.g., adding a unique index to a populated column) should run as a separate, monitored step — not bundled with a code deploy — since a long lock during a deploy window can cause request timeouts on the still-live slot.
5. **Rollback**: `php artisan migrate:rollback` was verified this round to work correctly (previously three migrations had incomplete `down()` methods that would have left the schema out of sync with the rollback ledger — all three are now fixed and tested against a real database, not just reviewed). Still, rolling back a migration that's already been running in production for a while, with real rows written under the new schema, is a data-loss risk independent of the `down()` method being technically correct — treat `migrate:rollback` as a last resort, not a routine part of the deploy sequence.

---

## 5. Queue Strategy

Both slots share the same `jobs` table (database queue driver). This has one direct consequence for blue-green: **if both blue and green run a queue worker simultaneously, both workers pull from the same table** — this is safe (Laravel's database queue driver uses row-level locking to claim a job, so no two workers process the same job), but it means during the overlap window, a job enqueued by blue's code could be *processed* by green's worker (running newer code) or vice versa. For this codebase specifically, the only queued work is outbound transactional email (`Mail::queue()` calls, all `ShouldQueue` Mailables) — processing a queued mail job with slightly different code than what enqueued it is low-risk (the Mailable classes aren't expected to change shape between adjacent releases), but it's worth stating plainly rather than ignoring.

**Recommended sequence:**
1. Deploy new code to the idle slot; **do not restart its queue worker yet** (or start it, but pointed at a non-production queue table if you want strict isolation — not necessary given the low-risk job types here).
2. After cutover, restart the now-idle (previously live) slot's queue worker last, so it picks up the new code too and isn't left running stale Mailable classes indefinitely.
3. Use `--max-time=3600` (see `PRODUCTION_DEPLOYMENT_GUIDE.md` §5) so workers naturally cycle onto new code even if a restart step is missed.

**Avoiding duplicate processing**: this is inherent to the database queue driver's row-locking (`SELECT ... FOR UPDATE`-style claim), not something blue-green introduces risk to — verified this is standard Laravel `DatabaseQueue` behavior, not custom code in this repo.

---

## 6. Storage Strategy

**This is the one real blue-green blocker in the current default configuration.** `FILESYSTEM_DISK=local` means uploaded documents (`Storage::disk('local')->put(...)`, confirmed in `ApiController.php`) live on whichever server received the upload. If blue and green are different physical machines:
- A document uploaded while blue is live is invisible to green after cutover.
- This is silent — no error, the document just 404s on download from the other slot.

**Before running blue-green across two separate servers, do one of:**
- Switch `FILESYSTEM_DISK=s3` (credentials already scaffolded in `.env.example`, unset by default — this is a config change, not new code) so both slots read/write the same object store, or
- Mount a shared network filesystem (NFS/EFS-equivalent) at the same path on both slots, or
- Run blue and green as the same physical server with two release directories and a symlink swap (avoids the problem entirely, at the cost of not being able to test the new release under real separate-server conditions before cutover).

If blue and green are the same box (symlink-swap style), this is a non-issue — noted so this guide doesn't overstate the risk for that topology.

---

## 7. Rollback Procedure

Because the previous slot is never stopped during a deploy (only made idle), rollback is a **single traffic switch, not a redeploy**:

1. Point the load balancer back at the previously-live slot. This is the same atomic operation as cutover, in reverse — should take seconds, not minutes.
2. If the failed deploy included a migration that's incompatible with the old code (should not happen if §4's rules were followed, but if it did): this is the actual emergency case. Restoring traffic to the old slot does not undo the migration — the old code is now running against a schema it may not fully understand. This is exactly why §4's additive-only discipline matters: **a correctly-additive migration means the old code on the rolled-back slot keeps working unmodified**, because it simply ignores columns it doesn't know about.
3. Stop the queue worker on the slot that failed, if it was started, before investigating — don't let it keep processing jobs with broken code.
4. Session/cookie compatibility: since sessions live in the shared database table, users are not logged out by a rollback — verified this is a property of the `database` session driver, not something that needs separate handling.

---

## 8. Known Blue-Green Limitations (honest, not fixed this round)

- **No feature-flag system exists.** A `feature_flags` key exists in the `platform_settings` table (seeded with `qr_kiosk`/`stripe_payments` booleans by a demo command) but nothing in the application code actually reads it to gate behavior — confirmed by grep. This means Barbaari cannot currently decouple "deploy" from "release" the way a feature-flagged rollout would (e.g., shipping new code dark, then flipping a flag). Every cutover is all-or-nothing for every feature in the release.
- **No canary/percentage-based traffic splitting** — the load balancer step in §2 is described as atomic because nothing in this stack supports gradual traffic shifting. A bad release affects 100% of traffic the moment cutover completes, until rollback.
- **API versioning**: there is no `/v1/`, `/v2/` style versioning anywhere in `routes/api.php` — mobile app clients in the field (which cannot be force-upgraded instantly, unlike the web apps) call the same unversioned endpoints as whatever's currently deployed. This has worked so far because this round's migration audit found no breaking schema/response-shape changes in the codebase's history, but it is a real constraint on what a *future* deploy is allowed to do: **a backend deploy must never change an existing endpoint's response shape in a way an already-installed mobile app version can't parse**, since there's no mechanism to force mobile clients to update in lockstep with a backend cutover.

---

## 9. Expected Downtime

**Zero, for the cutover step itself**, given the architecture above — the load balancer switch is the only user-visible moment, and it's a single atomic config change, not a rolling restart. The realistic sources of *apparent* downtime to watch for are the ones outside this switch:
- A migration that locks a heavily-written table for longer than expected (§4, rule 4) — this affects the still-live slot, before cutover even happens.
- `TRUSTED_PROXIES` misconfigured, causing secure-cookie or HSTS behavior to differ unexpectedly right after cutover if the new slot's proxy headers aren't trusted the same way.
- A queue worker restart on the newly-idle slot briefly dropping in-flight job processing (bounded by `--max-time`/graceful shutdown, not user-facing).

---

## 10. Deployment Sequence (condensed checklist)

1. [ ] Run CI (`ci.yml`) — tests, typechecks, builds all pass.
2. [ ] Deploy code to idle slot (does not receive traffic yet).
3. [ ] Run `php artisan migrate --force` against the shared database (additive-only, per §4).
4. [ ] Warm `config:cache`/`route:cache`/`view:cache` on the idle slot.
5. [ ] Poll idle slot's `/api/health` directly until `200` (§3) — do not proceed on a `503`.
6. [ ] Atomically cut load balancer traffic to the idle slot.
7. [ ] Smoke-check the now-public URL's `/api/health`.
8. [ ] Restart the now-idle (previously live) slot's queue worker onto the new code.
9. [ ] If anything in steps 5–7 fails: cut traffic back immediately (§7) — do not debug with production traffic pointed at a slot that failed its health check.

See `.github/workflows/deploy.yml` for this same sequence expressed as a (currently template-only — no real infrastructure wired up) GitHub Actions workflow, and `FINAL_PRODUCTION_DEPLOYMENT_REPORT.md` for what's still required externally before that template can run for real.
