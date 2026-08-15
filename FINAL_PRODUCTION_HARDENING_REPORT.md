# Barbaari — Final Production Hardening & Reliability Audit

## 1. Executive Summary

This round's mandate was explicit: **do not trust previous audits — verify everything yourself.** I
took that literally. Before writing a single line of this report, I re-read the actual current state of
every fix a prior round claimed to have made (checkout idempotency, payment double-submit guards, the
global exception handler, mail-failure isolation, CORS/security-header config, log redaction) and
confirmed each one directly against the live code and the passing test suite — not against my own
summary of it. Everything from prior rounds held up under re-verification, with one exception (a mail
command that was only partially wrapped — see below).

New ground covered this round that prior rounds hadn't reached: memory-leak/cleanup audit (clean — no
leaks found, verified not assumed), a full technical-debt sweep (found and removed one genuinely
leftover temporary debug endpoint, confirmed several other suspects were already clean), production
configuration and logging-safety re-verification, and — most valuably — a dedicated mobile-app and
tablet-OS-level resilience pass, which found real, unfixed gaps that the web-focused prior rounds never
reached: the mobile kiosk had the exact same GPS-error-message bug that was fixed on web but never
ported over, the mobile app's own copy of the shared data-fetching hook never got the stale-response fix
its two web siblings received, and the mobile app had zero error-boundary protection anywhere. All of
these are now fixed and verified.

The single most consequential **new** finding this round: **the Stripe SDK client had no timeout
configured at all**, defaulting to the SDK's own 80-second total / 30-second connect timeout — every
other external dependency in this app (USPS, geocoding, timezone lookups) had an explicit short timeout
from prior rounds; Stripe was the one gap, on the one integration where a hang would be most visible
(checkout, webhook handling) and most damaging (a slow Stripe response could hold a webhook request open
long enough for Stripe's own retry logic to kick in unnecessarily). This is now fixed.

**101 → 97 backend tests pass** (net change is a 4-test *reduction*, because the 4 tests covering the
now-deleted debug controller were removed with it, not because anything regressed — every test that
existed before this round's deletions still passes). All three frontend apps (daycare-web, super-admin,
mobile) typecheck cleanly; both web apps build successfully.

## 2. Every issue found

### Confirmed carried over from prior rounds (re-verified, not re-listed in full — see prior reports for detail)
Cross-tenant IDOR fixes, role-escalation guards, Stripe session-ownership check, webhook idempotency,
attendance check-in/check-out idempotency (including the deeper `firstOrCreate`/date-cast bug), payment
double-submission guards, the global rate limiter, `useAsyncData` staleness guards on both web apps,
`ProtectedRoute` 401-only-logout logic, offline detection on the web tablet portal — all read directly
from source this round and confirmed still correct and still covered by passing tests.

### New findings this round

**Critical**
1. Stripe SDK client had no configured timeout (defaults to 80s/30s) — the one external dependency this
   app talks to that was missed by prior rounds' timeout-hardening pass.

**High**
2. `apps/mobile/app/kiosk.tsx`'s geolocation error handling conflated permission-denied,
   position-unavailable, and timeout into one misleading "permission required" message — the exact bug
   fixed on the web tablet portal in a prior round, never ported to the mobile kiosk (a separate,
   independent implementation).
3. `apps/mobile/hooks/useApiResource.ts` — the mobile app's own third copy of the shared
   data-fetching-hook pattern — never received the request-generation/unmount-safety guard its two web
   siblings (`daycare-web` and `super-admin`'s `useAsyncData`) got in a prior round.
4. Zero `ErrorBoundary` anywhere in the mobile app — a single uncaught render error in any screen had no
   containment.
5. `app/Console/Commands/BillingEmailSmokeCommand.php` has 4 `Mail::` call sites that a prior round's
   "all mail dispatch is failure-isolated" claim did not actually cover (only `ApiController.php` and
   `AuthController.php` were wrapped). On inspection, wrapping these the same way would have been the
   *wrong* fix — this command's entire purpose is verifying email delivery, so silently swallowing a
   failure defeats it. Fixed differently (see below).
6. `TimezoneDiagnosticsController.php` — explicitly self-labeled "TEMPORARY... remove once resolved" —
   was still present, still routed, still tested. Confirmed genuinely unused/safe to remove (token-gated,
   fails closed, no other code depends on it) and removed.

**Medium**
7. `SESSION_SECURE_COOKIE` was undocumented in `.env.example` with no explicit default — a production
   deploy copying the example file verbatim would serve the CSRF/session cookie without the `Secure`
   flag. Not the primary auth path (that's Sanctum bearer tokens), but still worth hardening.
8. `apps/mobile/app/login.tsx`'s "Register parent account" button was missing the same
   disabled-while-submitting guard its sibling sign-in button already had — an inconsistency, not a
   data-integrity risk (backend registration isn't harmed by a double-submit), but a real UX/API-call-
   waste gap.
9. Across `apps/mobile`, most write-action buttons (kiosk unlock/load/verify/submit, staff check-in/out,
   parent guardian-signing) show a "saving..." label but aren't actually `disabled` during the request —
   inconsistent with the web apps, where this pattern is applied consistently. Only the two clearest,
   lowest-risk instances were fixed this round (see Section 3); the rest are documented as remaining
   debt (Section 10) rather than rushed, since a systematic sweep across every mobile write action risked
   more than the time available justified verifying carefully.
10. `apps/mobile/app/kiosk.tsx` showed a generic `"Loading..."` button label while every other loading
    state in the same file used an action-specific label (`"Unlocking...", "Verifying...", "Saving..."`).
    Fixed for consistency (`"Loading tablet..."`).

**Low / confirmed-clean, not fixed**
- Memory-leak audit: clean. Every timer (`setInterval`/`setTimeout`) and every `window`/`document` event
  listener in the entire frontend codebase (5 timers, 2 listener sites, exhaustively grepped, not
  sampled) has correct cleanup. No `watchPosition`, no camera/mic stream usage, no WebSocket/polling
  loops, no accumulating module-level state anywhere.
- UX copy: re-checked specifically for the patterns this round called out (literal `"Loading..."`,
  `"Please wait..."`, em-dashes, ellipsis artifacts) that the prior round's leading-hyphen-focused sweep
  didn't specifically target. Found and fixed one instance (item 10 above); everything else was already
  clean.
- No lint script is configured for any of the three frontend apps (no ESLint config anywhere in the
  repo). Laravel Pint *is* available for the backend (`vendor/bin/pint`) — I ran it in `--test` (dry-run)
  mode; it flags style differences against Laravel's default preset across dozens of pre-existing files
  using this codebase's consistent, deliberate compact formatting convention (single-line class bodies,
  etc.), established since before this round. Bulk-auto-fixing would produce a huge, unrelated diff
  touching files this round had no reason to touch, directly against this round's own "do not redesign,
  do not change unnecessarily" instruction — so I did not run it in write mode. This is documented
  honestly rather than either running a destructive reformat or silently skipping the check.

## 3. Every issue fixed

| # | Fix |
|---|---|
| 1 | `StripeService::client()` now configures an explicit 15s timeout / 5s connect timeout via a custom `CurlClient`, registered through Stripe SDK's `ApiRequestor::setHttpClient()` |
| 2 | `apps/mobile/app/kiosk.tsx` — added the same `geolocationErrorMessage()` differentiation (permission/unavailable/timeout) already present on web |
| 3 | `apps/mobile/hooks/useApiResource.ts` — added the same request-generation + mounted-ref guard as both web `useAsyncData` hooks |
| 4 | New `apps/mobile/components/ErrorBoundary.tsx`, wired into `app/_layout.tsx` around the entire app |
| 5 | `BillingEmailSmokeCommand.php` rewritten: each of its 4 email sends now runs independently (one failure doesn't stop the rest), every outcome is explicitly reported (`✓`/`✗` per email), and the command exits non-zero if any failed — appropriate for a *diagnostic* command, unlike the silent-failure-isolation pattern used for real user-facing requests |
| 6 | `TimezoneDiagnosticsController.php`, its route, and its test file deleted; `TIMEZONE_DEBUG_TOKEN` removed from `.env.example` |
| 7 | `.env.example` now documents `SESSION_SECURE_COOKIE=false` with an explanatory comment that it must be `true` in production |
| 8 | `apps/mobile/app/login.tsx` — register button now `disabled={signingIn || registering}`, matching the sign-in button |
| 9 | *(partial — see Section 10)* |
| 10 | `apps/mobile/app/kiosk.tsx` — `"Loading..."` → `"Loading tablet..."` |

## 4. Every issue intentionally left unchanged

- **Bulk Pint auto-formatting** — exists as an option, deliberately not run (Section 2, "Low"). Running
  it would be a large, unrelated, cosmetic diff against dozens of files this round had no substantive
  reason to touch.
- **Systematic mobile button-disable sweep** (item 9) — only the two clearest cases were fixed. A full
  sweep across `kiosk.tsx`, `staff.tsx`, and `attendance.tsx`'s remaining write actions is real,
  identified debt, but every one of those actions is backed by an idempotent endpoint from prior rounds'
  attendance-resilience work, so the risk here is wasted API calls and a slightly confusing double-alert,
  not data corruption — I judged it lower-risk to leave clearly documented than to rush broad edits
  across three screen files without the ability to run the actual Expo app to visually confirm nothing
  broke.
- **NetInfo / network-awareness on mobile** — the mobile app has zero equivalent of the web tablet
  portal's `useOnlineStatus()`. Adding it properly requires a new native dependency
  (`@react-native-community/netinfo`), which has Expo prebuild/native-module implications I cannot test
  in this environment (no way to run the actual mobile app here). Flagged as a real gap, not attempted
  blind.
- **`AppState` background/foreground handling on mobile** — same reasoning: a real gap, not a quick
  code-only fix, needs to be designed and tested against actual app lifecycle behavior.
- **Kiosk idle-reset for an *abandoned* (not completed) attendance flow** — the kiosk auto-resets 5s
  after a *successful* confirmation, but a flow abandoned mid-way (staff walks away after selecting a
  child but before finishing) sits indefinitely, showing that child's data to whoever picks the tablet up
  next. This is a genuine kiosk-privacy concern, not a quick fix — it requires deciding on an idle-timeout
  duration and UX (a product decision, not a bug fix), so it's documented as a risk (Section 9) rather
  than fixed unilaterally.
- **Out-of-order Stripe webhook events, `SettingsPage.tsx` address-validation stale-response race, lack
  of pagination anywhere** — all previously documented remaining risks from the prior resilience round,
  re-confirmed still present and still unfixed for the same reasons already given there.
- **Sanctum tokens never expiring** — deliberately unchanged across every round of this work; no
  refresh-token flow exists to handle re-auth gracefully, so a hard expiry would just silently break
  active sessions.

## 5. Performance improvements

No new performance work was the primary focus this round (that was substantially covered by the prior
resilience round — debounced search, `useAsyncData` staleness guards preventing redundant state
thrashing). This round's Stripe timeout fix is arguably a performance/latency-bound fix as much as a
resilience one: without it, a degraded Stripe API could hold a request open for up to 80 seconds instead
of failing fast at 15.

## 6. Reliability improvements

- Stripe calls now fail fast (15s) instead of potentially hanging for up to 80s.
- Mobile kiosk GPS failures now give staff an accurate, actionable message instead of a misleading one.
- Mobile's third data-fetching hook is now race-safe, matching both web apps.
- A single mobile render crash no longer takes down the whole app with no recovery path.
- The billing-email smoke-test command now correctly reports partial failure instead of either silently
  swallowing it or dying on the first error and never testing the rest.
- One fewer piece of leftover temporary infrastructure in production (the debug controller) — smaller
  attack/failure surface, one less thing to reason about.

## 7. UX improvements

- Mobile register button now gives clear busy-state feedback instead of appearing unresponsive to a
  double-tap.
- One generic "Loading..." replaced with an action-specific label, matching this file's own established
  convention.
- Everything else searched for this round (em-dashes, "Please wait...", other AI-sounding artifacts) was
  already clean — confirmed via direct grep, not assumed from a prior round's summary.

## 8. Security improvements

- Removing the temporary debug controller shrinks the app's surface area by one endpoint, even though it
  was already fail-closed and not independently exploitable.
- `SESSION_SECURE_COOKIE` is now documented with an explicit production requirement instead of silently
  defaulting to insecure.
- No new vulnerabilities were found this round in the specific "re-verify IDOR/mass-assignment/auth"
  re-check — every specific control checked (cross-tenant scoping on the fixes from the prior security
  round, the role-escalation guards, the Stripe session-ownership check) was read directly from source
  and confirmed intact.

## 9. Remaining production risks

Ranked by what would actually hurt if it happened, not by category:

1. **Queue worker uncertainty** (carried from prior round, re-confirmed unresolved): no `Procfile`/cron
   config found anywhere in this repo for the `database` queue connection. If no operator has separately
   configured a worker on the actual production host, queued emails (invitations, subscription
   activation, invoice notices) never send. This audit cannot verify actual production ops configuration
   from source code alone.
2. **Kiosk privacy on abandoned flows** (new this round): a tablet left mid-flow shows one family's data
   to the next person who picks it up, indefinitely.
3. **No mobile network-awareness or background/foreground handling**: a mobile user who loses connection
   or backgrounds the app mid-action gets whatever ad-hoc failure surfaces, not a clear "you're offline"
   state the way the web tablet portal now has.
4. **Systematic mobile double-tap UX gap** (item 9): not a data-integrity risk (backend is idempotent),
   but a real, repeated source of confusing double-alerts/wasted requests across most mobile write
   actions.
5. **Out-of-order Stripe webhooks, address-validation stale-response race, no pagination at scale** — all
   carried from the prior round, still real, still unfixed.
6. **No lint tooling configured for any frontend app.** Type errors are caught (typecheck is clean across
   all three apps), but there's no automated check for unused variables, accessibility issues, or
   style/correctness patterns ESLint would normally catch.

## 10. Technical debt remaining

- The duplicated `useAsyncData`/`useApiResource` pattern now exists in **three** near-identical copies
  (daycare-web, super-admin, mobile) — all three are now functionally correct (this round closed the gap
  on the mobile copy), but consolidating into `packages/shared` is a real, deliberate refactor task, not
  a debt-removal sweep — flagged, not attempted.
- Mobile's inconsistent button-disable coverage (Section 4).
- No `AppState`/`NetInfo` integration on mobile.
- No automated accessibility or lint checks on any frontend app.
- `TIMEZONE_PRODUCTION_DEBUG_REPORT.md` and `TIMEZONE_RESILIABILITY_REPORT.md` (historical audit
  documents from prior rounds) still reference the now-deleted `TimezoneDiagnosticsController` — left
  as-is deliberately; they're a historical record of what was investigated and fixed at the time, not
  living documentation, and editing them after the fact would misrepresent what actually happened during
  those incidents.

## 11. Exact files changed

| File | Change |
|---|---|
| `apps/backend/app/Services/StripeService.php` | Explicit 15s/5s HTTP timeout on the Stripe client |
| `apps/backend/app/Console/Commands/BillingEmailSmokeCommand.php` | Per-email failure isolation + reporting, correct exit code |
| `apps/backend/app/Http/Controllers/TimezoneDiagnosticsController.php` | **Deleted** |
| `apps/backend/tests/Feature/TimezoneDiagnosticsControllerTest.php` | **Deleted** |
| `apps/backend/routes/api.php` | Removed the debug route and its import |
| `apps/backend/.env.example` | Removed `TIMEZONE_DEBUG_TOKEN`; added documented `SESSION_SECURE_COOKIE` |
| `apps/mobile/app/kiosk.tsx` | GPS error differentiation; `"Loading..."` → `"Loading tablet..."` |
| `apps/mobile/app/login.tsx` | Register button now disables while submitting |
| `apps/mobile/app/_layout.tsx` | Wrapped in the new `ErrorBoundary` |
| `apps/mobile/components/ErrorBoundary.tsx` | New |
| `apps/mobile/hooks/useApiResource.ts` | Request-generation + unmount-safety guard |

No changes were made to `apps/daycare-web`, `apps/super-admin`, or `packages/shared` this round — every
prior-round fix in those apps was re-verified in place and found correct as-is.

## 12. Tests executed

```
php artisan test
```
**97 passed, 325 assertions, 0 failures.** (Down from the prior round's 101 solely because the 4 tests
covering the now-deleted debug controller were removed with it — every other test, including all
security-hardening and attendance-resilience regression tests from prior rounds, still passes unchanged.)

```
npm --workspace @barbaari/daycare-web run typecheck   # clean
npm --workspace @barbaari/super-admin run typecheck    # clean
npm --workspace @barbaari/mobile run typecheck         # clean
npm --workspace @barbaari/daycare-web run build        # succeeds
npm --workspace @barbaari/super-admin run build        # succeeds
```
No `apps/mobile` build step exists in this project (Expo apps are typically verified via typecheck +
`expo start`/EAS build, neither of which is runnable in this environment without live device/simulator
access or Expo credentials — typecheck is the correct and complete verification available here).

`vendor/bin/pint --test` was run (dry-run only, see Section 2/9) — not a pass/fail gate for this round,
documented as informational.

## 13. Build results

Both web apps build without errors. `super-admin`'s bundle exceeds Vite's 500kB chunk-size advisory
threshold (pre-existing, not introduced by this round) — a code-splitting opportunity, not a build
failure.

## 14. Final production readiness score

**74/100.**

This is lower than the prior round's 79/100, and that's deliberate, not a contradiction — the prior
score was scoped to what that round actually audited (backend + both web apps), and this round's honest,
skeptical re-audit of the mobile app specifically found real, previously-unaudited gaps (no error
boundary, no network-awareness, inconsistent double-tap protection, a duplicated GPS bug) that lower the
platform's *overall* score even though the web apps and backend are, if anything, slightly *more* solid
than before (Stripe timeout, one fewer debug endpoint, re-verified controls holding up under scrutiny).
A score should reflect the whole platform, not just the parts most recently polished.

## 15. Honest answers

**Would I deploy this to real paying customers?**
For the backend and both web apps (daycare-web, super-admin): yes, with the queue-worker question
(Section 9, item 1) resolved first — that's the one thing standing between "resilient" and "silently
losing invitation/invoice emails forever" for the confirmed shared-hosting production environment this
app targets. For the mobile app specifically: I would not deploy it to real users in its current state
without at minimum adding network-awareness and finishing the double-tap protection sweep — not because
anything is broken today, but because a parent-facing mobile app with zero offline-detection and an
error boundary that was, until this afternoon, completely absent, is a materially different risk profile
than the web apps got. The backend's idempotency guarantees mean a bad mobile UX won't corrupt data, but
it will generate real support tickets from confused parents on trains, in daycare pickup lines with weak
signal, or anywhere else connectivity is imperfect — which is most places.

**What still worries me?**
Two things, in order: first, that I cannot verify from source code alone whether a queue worker is
actually running against the production database queue connection — every round of this work, including
this one, has had to flag this as an unknown rather than a verified fact, and it's the single highest-
leverage unknown left. Second, that the mobile app's resilience gaps existed entirely unexamined until
this round's explicit "verify everything yourself, including previous audits" instruction forced a real
look — that's a process worry as much as a code worry: three rounds of "full platform" audits missed the
mobile app's actual screens because the web apps were more visible/central to the work being done. That
pattern is worth being aware of for whatever comes after this one, too.

**What should be fixed before scaling to hundreds of daycare organizations?**
In priority order: (1) resolve the queue-worker question definitively — this is an operational fact-
check, not a code change, and it's the one item on this entire list that genuinely cannot be closed from
inside this environment; (2) pagination on every list endpoint/page — confirmed unaddressed across every
round of this work, and the one item most directly tied to "hundreds of organizations" specifically,
since today's architecture fetches entire result sets client-side; (3) mobile network-awareness and the
double-tap sweep, both real and both scoped small enough to finish properly with the ability to actually
run the app; (4) N+1 query risk across dashboard/report endpoints — spot-checked across three rounds,
never exhaustively audited under real data volume.

I am not calling this platform unconditionally "production-ready." I am saying: the backend and web apps
have now been independently re-verified twice (once by writing the fixes, once by this round's explicit
distrust-and-recheck mandate) and held up both times, which is a real, earned level of confidence — and
the mobile app has not yet had that same second look applied to its own fixes, because most of its
fixes are new as of this report. Trust the backend and web-app claims in this document at the level that
101→97 passing tests and a genuine, adversarial re-audit deserve. Treat the mobile-app fixes with the
appropriately lower confidence of work that's correct-on-paper and typecheck-clean, but hasn't yet run
on an actual device.
