# Barbaari — Tablet Mobile Implementation Report

**Scope:** bring `apps/mobile/app/kiosk.tsx` (the mobile tablet/kiosk workflow) into parity with the production tablet web app (`apps/daycare-web/src/pages/TabletPortalPage.tsx`), reusing existing backend endpoints exclusively. No backend endpoints were added or changed. No business logic was duplicated client-side.

**Method:** three parallel research passes actually traced the web implementation, the pre-existing mobile implementation, and the backend controller/middleware source (file:line citations, not assumption) before any code was written. Two real, previously-undetected issues surfaced from that research and shaped the implementation:
1. The backend has **no concept of "early checkout" or "missing checkout" as distinct, permission-gated actions** — they are status labels the backend computes after the fact from timestamps. The pre-existing mobile code sent a fabricated `early_checkout` field the backend silently ignored (confirmed: zero references to it anywhere in `ApiController.php`). That was fake signal, not a feature — removed rather than preserved.
2. Subscription enforcement is **not a field to check** — it's a `402` response (`EnsureActiveSubscription` middleware) on every authenticated tablet request, including the unlock call itself. "Check subscription after unlock" is satisfied by correctly handling that 402, everywhere it can occur, not by adding a new check.

---

## 1. Architecture

No new architectural layer was introduced. `apps/mobile/app/kiosk.tsx` remains the single-file step-machine it was (a `Step` union driving conditional renders inside one screen — matches the spec's "one-screen workflow, no unnecessary navigation"), extended with:
- One new step, `"subscription"`, rendering a new component, `apps/mobile/components/SubscriptionRequiredScreen.tsx`.
- Two new pure helper functions (`actionsForStatus`, `isSubscriptionRequiredError`) and one rewritten helper (`deviceLocation`, now backed by `expo-location` instead of the web `navigator.geolocation` polyfill), plus a new `assertOnline` helper (`expo-network`).
- All existing state, the signer/PIN/signature flow, and every backend call already in the file were kept — this was a targeted fix, not a rewrite. The pre-existing mobile implementation was already closer to the web/backend contract than expected (real backend-driven signer list, real PIN verification, real signature capture) — see §3 for what specifically changed.

## 2. Screens Implemented

Within the single `kiosk.tsx` step machine:

| Step | Status |
|---|---|
| `welcome` (mode select + unlock) | Pre-existing, unchanged |
| `subscription` (new) | **New** — `SubscriptionRequiredScreen`, reached from a 402 anywhere in the flow |
| `classroom` | Pre-existing, unchanged (center-daycare only; family child care skips straight to children, unchanged) |
| `child` | Pre-existing; status badge logic unchanged |
| `action` | **Changed** — now shows only the actions valid for the selected child's actual attendance status, with a clear message and a way back when none apply |
| `signer` | Pre-existing, unchanged (already backend-driven — see §5) |
| `verify` (PIN) | Pre-existing, unchanged |
| `signature` | Pre-existing, unchanged |
| `confirm` | Pre-existing; auto-reset target changed (see below) |

## 3. APIs Reused (no new backend endpoints)

Every one of these was already wired in `packages/shared/src/api.ts` / `apps/mobile/services/mobileApi.ts` before this work — confirmed by reading the actual request/response contracts against the backend source, not assumed:

- `POST /auth/tablet-unlock` (`AuthController::tabletUnlock`) — admin/staff unlock.
- `GET /tablet/bootstrap` (`ApiController::tabletBootstrap`) — org type, classrooms, children (with computed `attendanceStatus`), absences.
- `GET /tablet/children/{child}/signers` (`ApiController::tabletChildSigners`) — backend-computed operator list (guardians + classroom staff + org admins/owners, scoped by facility type).
- `POST /tablet/signers/verify-pin` (`ApiController::tabletVerifySignerPin`) — server-side PIN check, never local.
- `POST /tablet/attendance/guardian-check-in` / `guardian-check-out` (`tabletGuardianCheckIn`/`Out` → `signedAttendance()`) — the actual attendance write, including GPS lat/lng and geofence enforcement.
- `POST /tablet/absence-records` (`tabletCreateAbsenceRecord`).
- `GET /daycare/subscription`, `POST /daycare/billing/stripe/create-checkout-session` (`daycarePlatformBillingApi`, already used by the web `SubscriptionPaymentPage.tsx`) — reused as-is for the new subscription screen; confirmed these specific paths are allowlisted through the subscription gate itself (`EnsureActiveSubscription::isPaymentGateAllowedPath`), which is exactly why the payment screen can load even while the org is locked out of everything else.

**Zero new backend endpoints were added.** Everything needed already existed.

## 4. APIs Added

**None.** Confirmed not necessary — every requirement in the spec maps to an existing endpoint or an existing response field.

## 5. Permissions Flow

- Operator/signer list is 100% backend-computed (`GET /tablet/children/{id}/signers`) — the mobile app never constructs or filters this list itself beyond what the backend already returned. This was already true before this round's changes; verified, not assumed.
- The backend does **not** filter the signer list per-action (same list for check-in/check-out/absence) — real permission enforcement happens later, at PIN-verify and attendance-save time (`resolveTabletSigner()` re-validates classroom/facility-type match server-side regardless of what the client displayed). The mobile UI reflects this honestly: it shows the same backend list for every action rather than inventing a client-side per-action filter that isn't backed by real server enforcement — doing otherwise would have meant guessing at a business rule the backend doesn't actually implement.
- **Open question, not resolved this round**: the signer list disables (`blocked`) any entry with `can_pickup: false`, for every action including check-in. This was pre-existing behavior, not changed here. It's unclear whether `can_pickup` is meant to gate only physical pickup (i.e., check-out) or general authorization for this child. Left as-is since changing it wasn't requested and there's no backend evidence either way — flagged here rather than silently guessed at.
- Subscription/payment: `GET /daycare/subscription` and the Stripe checkout endpoint are role-gated to `daycare_admin`/`manager` server-side. If the person who unlocked the tablet doesn't hold that role (e.g., a staff PIN unlock), the subscription screen degrades to a plain "ask an admin" message instead of a broken or fabricated payment UI — verified this matches the actual role gate rather than assuming every unlock is an admin.

## 6. GPS Flow

Replaced the web-style `navigator.geolocation` polyfill with real `expo-location` (per the spec's explicit requirement) — packages `expo-location` (19.0.8) and `expo-network` (8.0.8) were added (`apps/mobile/package.json`), plus the required native permission strings (`app.json`: `NSLocationWhenInUseUsageDescription`, Android `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION`, `expo-location` config plugin) — the project had no native permission config for anything before this (not even for the pre-existing `expo-camera` dependency), so this is new ground for the app, not a regression.

Flow (`deviceLocation()` in `kiosk.tsx`): check foreground permission → request if not granted → check `hasServicesEnabledAsync()` (GPS actually on) → fetch position with a 10s manual timeout race (the installed `expo-location` version has no built-in timeout option) → on any failure, a specific, actionable message:
- Permission denied → "Location access is blocked for this device..."
- Services disabled → "location services (GPS) are turned off..."
- Timeout → "took too long..."
- Position unavailable → "could not determine its location..."

The backend remains the sole authority on whether the location is actually valid — this function only *obtains* coordinates; `calculateLocationData()` server-side does the actual geofence radius check and returns the outside-radius error, which the existing error handling already surfaces via `getApiError(err).message`. Nothing about GPS approval/rejection is decided client-side.

## 7. PIN Flow

Unchanged from the pre-existing implementation, which was already correct: `POST /tablet/signers/verify-pin`, server-side `Hash::check` against the signer's PIN hash, a `pin_verification_id` returned on success and required by the subsequent save call, invalid PIN surfaced via the existing error alert. No local/offline PIN verification exists anywhere in this codebase — confirmed by the backend audit, not just the client code.

## 8. Subscription Enforcement

- **Not a separate "check subscription" call** — confirmed the backend enforces this via `EnsureActiveSubscription` middleware on every authenticated tablet route, including `tablet-unlock` itself (which checks org/subscription status *before* issuing a token). A `402` response (`{requires_payment: true, redirect_to: '/subscription-payment', ...}`) is the actual signal.
- `isSubscriptionRequiredError(err)` (checks `getApiError(err).status === 402`) is now checked in **every** tablet call site that can realistically hit this middleware: unlock, bootstrap, signer fetch, PIN verify, and the final attendance save — not just once at the top of the flow. This directly satisfies "never cache permission to bypass this... every bootstrap must respect backend subscription enforcement": there is no cached flag anywhere: each call re-derives the answer from that call's own response.
- On a 402, the flow routes to `SubscriptionRequiredScreen`, which reuses the same billing endpoints the web `SubscriptionPaymentPage.tsx` uses, shows the same plan/invoice/amount-due information, and opens the same Stripe checkout URL (via `Linking.openURL`, the mobile equivalent of the web's `window.location.assign`). It degrades gracefully (plain informational message, not a broken screen) if the currently-signed-in user isn't a `daycare_admin`/`manager` and therefore can't reach the role-gated billing endpoints — see §5.
- No feature in this flow — children, classrooms, attendance, absence, staff/admin unlock — is reachable once a 402 has been seen; the screen replaces the step entirely rather than rendering alongside it.

## 9. Attendance Workflow

- **Status-gated actions (new)**: `actionsForStatus()` derives the valid action set directly from the backend-computed `attendanceStatus` (via the existing `statusFor()` helper, unchanged) — `"not checked in"` → Check In / Mark Absent; `"checked in"` → Check Out only; anything already resolved for the day (`checked out`, `early checkout`, `missing checkout`, `absent`) → no actions, with a plain message and a way back. Previously, all four actions (including the fabricated "early checkout") were shown unconditionally regardless of status — this was a real, confirmed gap against the spec ("Do NOT show Check Out"/"Do NOT show Check In again"), now closed using data the backend already provides, not a new endpoint.
- **Removed the fabricated "early checkout" action** (see top of this report) — there is exactly one checkout action; the backend labels it early/on-time/missing automatically after the fact.
- **Offline handling (new)**: `assertOnline()` (via `expo-network`) is checked first, before GPS or the save call, in `submitAttendance()`. On failure: "Connection lost. Attendance cannot be recorded while this tablet is offline." Nothing is queued — confirmed no queueing logic exists anywhere in this file, matching "never queue attendance locally."
- **Auto-reset target (fixed)**: the 5-second post-success timer (pre-existing, unchanged in duration) previously reset all the way back to the unlock/"welcome" screen, requiring an extra tap through "Continue to classrooms/children" before the next child could be handled — that did not match "Return to Children List." `startOver()` now returns directly to the children list (or the already-selected classroom's children, so a teacher working through one classroom isn't forced to re-pick it after every child) while keeping the tablet unlocked; only the explicit "Lock tablet" action ends the unlocked session.
- **General inactivity auto-reset (new)**: separate from the post-success timer, a 90-second idle timer now applies specifically while a child/signer/PIN/signature is in progress (`action`/`signer`/`verify`/`signature` steps) and resets on every relevant interaction. This closes a real gap against the spec's "Tablet Security" section ("After inactivity: Auto reset... Never leave previous child's data visible") that neither the web app nor the pre-existing mobile app implemented.
- Signature capture, PIN-verification-before-signature, and the save payload shape are unchanged from the pre-existing implementation (already correct — drawn signature plus typed name, both sent to the backend, which accepts both `signature_name` and `signature_data`).

## 10. Tests Executed

- **`npm --workspace @barbaari/mobile run typecheck`**: run repeatedly through this work. Confirmed via a controlled comparison (stashing this round's dependency/package.json changes and re-running) that the only TypeScript errors present — `TS2786` (a repo-wide `@types/react` vs. `react-native` component-type mismatch affecting every file that renders `<View>`/`<Text>`/etc.) and one pre-existing `TS2322` in `components/Ui.tsx` — are **pre-existing and unrelated to this work**, not introduced by it. No new error class appears anywhere in `kiosk.tsx` or the new `SubscriptionRequiredScreen.tsx`.
- **Backend contract verification**: `grep` confirmed `early_checkout` has zero references anywhere in `ApiController.php` (justifying its removal) and confirmed the exact allowlisted billing paths in `EnsureActiveSubscription::isPaymentGateAllowedPath()` match what `SubscriptionRequiredScreen` calls.
- **JSON validity**: `app.json` re-validated with `JSON.parse` after edits.
- **NOT executed** (honest gap, not overstated): no run in an actual iOS/Android simulator or on a physical tablet. This requires either `expo start` with a connected device/simulator or an EAS build — neither was run as part of this pass. Typechecking verifies the code is structurally sound; it does not verify runtime behavior (permission prompts actually appearing, PanResponder touch handling, Stripe checkout actually opening a browser, etc.). This should be treated as **implemented and typechecked, not yet runtime-verified**, until an actual device/simulator pass happens.
- **Live verification against the production backend** (`https://api-barbaari.pioneeriya.com/api`) — login, bootstrap, subscription check, attendance actions — was requested but requires real QA/test-organization credentials that were not yet provided in this conversation. **Not fabricated, not skipped silently**: this section will be completed and this report updated the moment credentials are available. See the task list item tracking this.

## 11. Remaining Improvements (honest, not done this round)

- Runtime/device verification (§10) — the single biggest gap between "implemented" and "verified."
- Live production verification (§10) — blocked on credentials, not forgotten.
- The `can_pickup` signer-blocking question (§5) — needs a product/backend decision, not a client-side guess.
- Landscape support: `app.json`'s `orientation` was locked to `"portrait"` (directly contradicting the spec's landscape requirement) — changed to `"default"` (supports both) as a minimal, correct fix. No further landscape-specific layout tuning was done beyond what the pre-existing responsive grid/breakpoint logic already provided.
- No automated component/integration tests exist for `kiosk.tsx` (none existed before this round either) — the manual "Testing Required" checklist in the original spec (family/center daycare flows, PIN valid/invalid, GPS scenarios, subscription active/expired, etc.) maps directly onto what still needs a real device pass, not automated test authorship, given the heavy reliance on native GPS/PanResponder/PIN hardware-adjacent behavior.
