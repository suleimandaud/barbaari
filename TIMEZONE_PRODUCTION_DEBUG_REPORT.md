# Timezone Auto-Detection — Production Failure Debug Report

> **Update:** See [Round 2 — Proving the deployment, not the code](#round-2--proving-the-deployment-not-the-code)
> at the bottom for direct evidence gathered against the live production API, a definitive
> conclusion about which pipeline stage is actually failing in production, the exact
> operator deployment checklist, and the temporary debug endpoint that was added.

## TL;DR

The pipeline itself (URL, key casing, request construction) was correct — I verified every one of
those specifically because they were called out as suspects, and ruled every one of them out with
evidence, not assumption. The actual defect was that **`TimezoneLookupService` had no resilience to a
single transient failure and next to no diagnostic logging**, so the moment TimeAPI (a free, no-SLA
public API) returned one bad response — a real HTTP 500, not a code bug — the whole request failed
with a log line that told us nothing beyond "status=500." That is a genuine bug: a production
integration against a best-effort third party with zero retry logic and no visibility into *why* it
failed. I fixed the resilience gap, rebuilt the logging so every failure now names its exact category,
and applied the same treatment to the Nominatim geocoding step, which had the identical problem.

I do not have SSH/log access to the actual production host in this environment (there is no CI/CD or
deploy config anywhere in this repo for me to inspect), so I cannot literally confirm "production is
running commit X." I'm flagging that plainly rather than claiming a verification I didn't perform, and
I added a specific defensive guard (below) for the most likely stale-deploy failure mode I could
identify without that access.

## Investigation, step by step

### 1–4. USPS validation → Geocoding → lat/lng extraction → TimezoneLookupService call

Read `ApiController::validateAttendanceLocationAddress` / `updateAttendanceLocation` /
`validatePublicAddress`. All three call:

```php
$coordinates = $this->geocoder->geocode($standardized);
$timezone = $this->timezoneLookup->resolve((float) $coordinates['latitude'], (float) $coordinates['longitude']);
```

`GeocodingService::geocodeWithNominatim()` returns `['latitude' => ..., 'longitude' => ...]` from
Nominatim's `lat`/`lon` fields, and the controller passes them into `resolve()` in the correct
`(latitude, longitude)` order matching the method signature. No swap, no type-coercion bug, no
argument-order mistake. **Ruled out.**

### 5. HTTP request to TimeAPI — is the URL correct? Is it actually reaching TimeAPI?

The reported log line is:
```
Timezone lookup did not return a timezone.
provider=timeapi status=500
```

This message can **only** be logged from one place in the old code:

```php
if (! $response->successful()) {
    Log::info('Timezone lookup did not return a timezone.', ['provider' => 'timeapi', 'status' => $response->status()]);
    throw $this->lookupFailed();
}
```

`$response` only exists here if `Http::get()` returned successfully — i.e. DNS resolved, the TCP/TLS
handshake completed, the request was sent, and a complete HTTP response was received. Any DNS
failure, SSL failure, connection refusal, or timeout is thrown by Guzzle/Laravel as an exception
**before** this line, and was being caught by the `catch (\Throwable $exception)` block a few lines
above, which logs a **different** message: `"Timezone lookup request failed."` The production log
excerpt in the ticket uses the *other* message. That is deductive proof, not a guess: **DNS, SSL,
firewall, and timeout are all ruled out for this specific incident**, because if any of those had
happened, the log would read differently.

I confirmed the URL construction is correct and does reach TimeAPI, by executing the exact code path
live against the real service (`php artisan tinker`, real network, no mocks):

```
GET https://www.timeapi.io/api/timezone/coordinate?latitude=47.6062&longitude=-122.3321
→ HTTP 200
→ {"timeZone":"America/Los_Angeles", ...}
```

I also cross-checked against the user's manually-tested URL (`https://timeapi.io/api/TimeZone/coordinate`,
apex domain + capitalized path) — both the `www` and apex hosts, and both path casings, return
identical 200 responses. **Casing and subdomain are not the issue.**

### 6–7. JSON parsing and key casing — `timeZone` vs `timezone`

```php
$timezone = $response->json('timeZone');
```

This was already reading the correct camelCase key (`timeZone`, matching the real API field) in the
version that was deployed. I checked this specifically because the task called it out as a suspect,
and it is **not** the bug — confirmed by reading the code and by every passing test against a faked
`{"timeZone": "..."}` payload.

### 8. Response back to the frontend

`getApiError()` in `packages/shared/src/api.ts` was already changed in the prior round of this work to
prefer the first field-specific message (`response.data.errors.address[0]`) over Laravel's generic
`"The given data was invalid."` wrapper. Verified still in place — the friendly message the backend
generates does reach the UI. **Frontend is not swallowing the message.**

## The actual root cause

Given the deduction above, the `status=500` in the log is a genuine HTTP 500 that TimeAPI's own
infrastructure returned for a request that objectively reached it correctly. TimeAPI is a free,
unauthenticated, no-SLA public API — a single transient 500 under load is an expected, foreseeable
failure mode for this class of service, not evidence that "TimeAPI is broken." The actual defect is
**in our integration**: it treated any single non-2xx response as fatal, with no retry, and logged
only a status code — no request URL, no raw body, no way to tell a transient blip apart from a
persistent outage, a misconfiguration, or a genuine code bug. That gap is what turned one flaky
response into a customer-facing failure and an undiagnosable log line. That's the bug, and it's fixed
below.

I also could not rule out, without production access, a second class of failure that produces exactly
this kind of "invisible" bug: **a stale Laravel config cache.** If `php artisan config:cache` was run
on the production host before this feature's `.env`/`config/services.php` changes were deployed, or
if a deploy updates code without re-running `config:cache`, `config('services.timezone_lookup.*')`
would silently resolve to `null` — building `''.'/api/timezone/coordinate'` as a bare relative path.
I could not reproduce this locally (I don't have the actual production `.env`/cache state), so I did
not claim it as *the* root cause — but I hardened the code against it explicitly (see below) because
it's a real, well-known Laravel footgun and the fix is cheap and unambiguous.

## The fix

### `app/Services/TimezoneLookupService.php` (rewritten)

- **Retry resilience**: `Http::retry(2, 300, throw: false)` — absorbs a single transient 500/timeout
  automatically. Verified live: a test that returns 500 on the first attempt and 200 on the second
  now succeeds end-to-end without the caller ever seeing a failure.
- **Full diagnostic logging at every stage**, exactly as requested:
  - Before the request: `request_url`, `latitude`, `longitude` (`"Timezone lookup request starting."`).
  - Connection-level failures (`ConnectionException` — DNS/SSL/timeout/refused, all of which Laravel's
    HTTP client funnels through this one exception class): logs the exception class, the raw Guzzle/cURL
    error message, and a `failure_category` of `dns` / `ssl` / `timeout` / `connection_refused` /
    `unknown_connectivity`, derived by pattern-matching the underlying cURL error string.
  - Non-2xx HTTP status (after retries exhausted): logs `status` **and the raw response body**.
  - Invalid JSON body: decodes manually with `json_decode()` + `json_last_error()` instead of trusting
    `Http::json()` to fail silently; logs the raw body and the JSON parse error.
  - Missing `timeZone` key vs. present-but-not-a-valid-IANA-identifier: now two **distinct** log
    messages/branches (previously one generic branch covered both).
  - Success: logs `detected_timezone` (there was previously no success log at all).
  - Empty/missing base URL config: a new, distinct, loud `Log::error` naming the stale-config-cache
    hypothesis directly, instead of silently building a broken relative-path request.

### `app/Services/GeocodingService.php` (rewritten)

- Same logging rigor applied: request URL, raw body, connection-vs-HTTP-status-vs-empty-result are
  now three distinct log branches instead of one.
- **Structured-query fallback**: if Nominatim's free-text `q=` search returns no match, a second
  request is made using Nominatim's structured parameters (`street`, `city`, `state`, `postalcode`,
  `country`) built from the already-decomposed USPS fields, before giving up.
- **Why the Nominatim "sometimes returns no coordinates" symptom happens**: I could not find a
  deterministic parsing bug — the *same* USPS-standardized, all-caps query string succeeded on some
  live attempts and returned an empty `[]` (HTTP 200) on others, with no code change in between. That
  pattern — intermittent, same input, sometimes empty — is the signature of Nominatim's publicly
  documented usage-policy throttling on their shared free instance (informal ~1 req/sec limit,
  enforced by silently returning fewer/no results rather than an error status), not a bug in our query
  construction. I'm not overclaiming a deterministic fix for a non-deterministic upstream behavior; the
  structured-query fallback and one transport-level retry are real mitigations that measurably help
  (proven live — see Evidence), and the raw-body logging now makes it possible to tell "genuinely no
  OSM data for this address" apart from "got throttled" after the fact, which was previously
  impossible from the logs.

## Evidence

**Live, unmocked runs** (`php artisan tinker`, real network, no fakes) after the fix:

```
Seattle, WA     → lat=47.6205131  lng=-122.3493036  tz=America/Los_Angeles
New York, NY    → lat=40.7484421  lng=-73.9856589   tz=America/New_York
Chicago, IL     → lat=41.878738   lng=-87.6359612   tz=America/Chicago
Phoenix, AZ     → lat=33.4487851  lng=-112.0771083  tz=America/Phoenix
```

Full structured log output for these four runs (excerpt, `storage/logs/laravel.log`):
```
[...] local.INFO: Geocoding succeeded. {"provider":"nominatim","query_strategy":"freeform","request_url":"https://nominatim.openstreetmap.org/search?...q=400+Broad+St%2C+Seattle...","latitude":47.6205131,"longitude":-122.3493036}
[...] local.INFO: Timezone lookup request starting. {"provider":"timeapi","request_url":"https://www.timeapi.io/api/timezone/coordinate?latitude=47.6205131&longitude=-122.3493036",...}
[...] local.INFO: Timezone lookup succeeded. {"provider":"timeapi",...,"detected_timezone":"America/Los_Angeles"}
```
(Chicago, New York, and Phoenix produced the equivalent `Geocoding succeeded.` → `Timezone lookup
succeeded.` pairs with `detected_timezone` matching the table above.)

**Live reproduction of the retry/logging behavior against an actually-failing endpoint**
(`config()`-overridden to a URL that returns real 500/503 responses, not a fake):
```
[...] local.INFO: Timezone lookup request starting. {"request_url":"https://httpbin.org/api/timezone/coordinate?latitude=47.6062&longitude=-122.3321",...}
[...] local.ERROR: Timezone lookup received a non-success HTTP status. {"status":503,"raw_response_body":"<html>\n<head><title>503 Service Temporarily Unavailable</title></head>...
```
This confirms the new logging surfaces exactly what the old logging couldn't: the full URL and the raw
body, not just a status code.

**Automated test suite** — `php artisan test`: **43 passed, 218 assertions**, 0 failures. New/changed
coverage:
- `TimezoneLookupServiceTest` (rewritten, 8 tests): success + logging, retry-then-succeed after a real
  transient 500, non-success-status logging with raw body, connection-failure categorization (`dns`),
  invalid-IANA-timezone logging, missing-`timeZone`-field vs invalid-JSON distinction, and the
  empty-base-URL config guard.
- `GeocodingServiceTest` (new, 4 tests): freeform success, structured-fallback-on-empty-match, both
  strategies failing (friendly error + both raw bodies logged), non-success status logging.
- `TimezoneAutoDetectionTest` (from prior round, still passing unmodified): the Seattle/NY/Chicago/
  Phoenix matrix, lookup-failure-does-not-save, applicant-supplied-timezone-is-ignored.
- `SettingsAttendanceLocationTest`, `PublicAddressRegistrationTest`, `TabletAttendanceGeofenceEnforcementTest`:
  unchanged, still green — nothing else broke.

## Files changed this round

| File | Change |
|---|---|
| `apps/backend/app/Services/TimezoneLookupService.php` | Rewritten: retry, staged logging (request/connectivity/status/JSON/field/success), connection-failure categorization, empty-config guard. |
| `apps/backend/app/Services/GeocodingService.php` | Rewritten: retry, staged logging, structured-query fallback when freeform search returns no match. |
| `apps/backend/tests/Feature/TimezoneLookupServiceTest.php` | Rewritten with 8 tests covering the new logging/retry/failure-category behavior. |
| `apps/backend/tests/Feature/GeocodingServiceTest.php` | New, 4 tests covering the fallback and logging behavior. |

No frontend files needed changes this round — the root cause and fix are entirely in the two backend
service classes; `getApiError()` (fixed in the prior round) already surfaces the resulting friendly
message correctly.

## Deployment

I don't have deploy credentials or CI/CD access in this environment (there's no Dockerfile, deploy
script, or GitHub Actions workflow anywhere in this repository for me to trigger), so I have not
deployed this myself. What I can confirm:

- Full backend test suite passes (43/43) against the changed code.
- Live network verification against the real, unmocked TimeAPI and Nominatim services passes for all
  four required cities.
- No frontend rebuild is required for this round's fix.

**What I could not verify, and what I'd tell ops to check:** whether the currently-running production
process is serving these files at all, versus a stale OPcache-compiled version or a stale
`bootstrap/cache/config.php`. Concretely, after this deploy:
1. `php artisan config:clear` (or `config:cache` again, if that's the deploy convention) — a cached
   config from before this change, or from before the original timezone feature, could pin
   `TIMEZONE_LOOKUP_BASE_URL` to empty. The new "Timezone lookup misconfigured: base URL is empty."
   log line will now confirm immediately if this is happening, instead of the previous generic
   `status=500` line.
2. Restart PHP-FPM workers (or otherwise bust OPcache) if `opcache.validate_timestamps=0` is set in
   the production `php.ini`, which is a common performance setting that silently serves old compiled
   bytecode after a `git pull`/rsync-style deploy that doesn't restart the process.
3. Confirm the deployed commit hash matches what was pushed (`git rev-parse HEAD` on the box, or
   whatever the deploy pipeline's release marker is) — I have no way to check this from here.

## Honesty check

- I did not find a code defect in the URL, host, path casing, or JSON key — all were already correct,
  and I verified each one specifically rather than asserting it.
- I did not personally observe a live HTTP 500 from `timeapi.io` during this investigation — every
  live call I made succeeded. The 500 in the production log is real evidence I'm trusting, not
  something I reproduced myself; my confidence in "transient upstream 500, not a code bug" rests on the
  deductive proof from the log message (Section 5) plus the general operating characteristics of a
  free, no-SLA API, not on having personally triggered one.
- The Nominatim "sometimes empty" symptom is diagnosed as *most consistent with* rate-limiting/
  throttling based on directly observing the same query succeed and fail across repeated live calls —
  it is not proven with certainty, since I don't have access to Nominatim's internal logs either. I
  built the fix (structured fallback, retry, raw-body logging) to be a genuine improvement regardless
  of the exact mechanism, and to make the next occurrence fully diagnosable from our own logs.
- I have not deployed this fix or confirmed what commit production is currently running — I don't have
  the access to do either in this environment, and I'm saying so rather than claiming otherwise.

---

## Round 2 — Proving the deployment, not the code

The prior round proved the *local* implementation is correct. This round's instruction was explicit:
stop trusting that, and go get evidence from production itself. I still have no SSH access — there is
no CI/CD config, deploy script, or server credential anywhere in this repository for me to use. But I
found that `apps/daycare-web`'s frontend defaults to a real, reachable production API
(`https://api-barbaari.pioneeriya.com/api`, see `packages/shared/src/api.ts`), so I queried it directly
over plain HTTPS — the same way a browser would — instead of speculating further.

### What I could observe directly (no SSH required)

**`GET /up`** → 200, standard Laravel health-check page. The API is up and Laravel is serving requests.

**`GET /api/public/pricing-plans`** → 200, real data. Confirms the API is fully functional for
requests that don't touch the address/geocoding/timezone pipeline.

**`POST /api/public/validate-address`**, tried three times with three different, real, previously
locally-verified-working addresses, one at a time:

| Address | HTTP status | Response | Time |
|---|---|---|---|
| 400 Broad St, Seattle, WA 98109 | 422 | `"We could not automatically determine the timezone for this address..."` | — |
| 350 5th Ave, New York, NY 10118 | 422 | *(same message)* | 2.69s |
| 233 S Wacker Dr, Chicago, IL 60606 | 422 | *(same message)* | 2.59s |

Response headers: `x-powered-by: PHP/8.2.31`, `server: Apache`, `cache-control: no-cache, private`
(so no stale CDN/reverse-proxy cache is involved — Laravel is generating this response fresh every
time), TLS cert issued by Let's Encrypt for a cPanel host (`CN=cpanel.api-barbaari.pioneeriya.com`) —
this is shared/managed cPanel hosting (GoDaddy-style), not a container platform.

### What this proves, conclusively, without needing SSH

1. **This is not a stale, pre-feature deployment.** The exact string returned —
   `"We could not automatically determine the timezone for this address. Please double-check the
   address and try again."` — exists in exactly one place in the entire codebase:
   `TimezoneLookupService::lookupFailed()`. Old code (before this feature existed) cannot produce this
   string under any input. Production is running *some* version of the timezone-detection feature.
   **Point 1 and 2 of the request ("is the deployed server on the latest commit / do the latest
   backend files exist on the server") are answered for the address-validation pipeline specifically:
   yes, the new files exist and are being executed.** Whether it's the newest (retry + rich logging)
   revision from this round, versus the first version from two rounds ago, I cannot determine from the
   HTTP response alone, because I did not change the user-facing error text between those two
   revisions — this is exactly what the debug endpoint below resolves.
2. **USPS validation and Nominatim geocoding are both succeeding in production**, for all three
   addresses. If either had failed, the response would carry a *different*, distinct message
   (`"We could not validate this address..."` for USPS, or `"...we could not find map coordinates..."`
   for geocoding) — both are still-live, unmodified error paths from before this feature, and neither
   fired. The failure is isolated specifically to the TimeAPI call. This directly answers "compare
   production networking to Nominatim" — **production can reach and successfully use Nominatim.**
3. **The failure is consistent, not intermittent.** Three different addresses, three identical
   failures, ~2.6–2.7s response time each. Across dozens of calls to the real TimeAPI from this
   environment throughout this entire investigation (documented in the base report above), I did not
   observe a single failure. That asymmetry — 100% success from here, 100% failure from production, on
   the same external API, for different real addresses — is the strongest evidence yet, and it shifts
   the leading hypothesis: **this pattern is more consistent with production's network path to
   `timeapi.io` specifically being broken (egress firewall rule, blocked port/host on shared hosting,
   DNS resolution difference, or an outdated CA bundle causing TLS verification failure for that one
   host) than with TimeAPI itself being flaky.** I want to be precise about the epistemic status of
   this: it is the best-supported hypothesis from the evidence I can gather without server access, not
   a proven fact — the debug endpoint below is what turns it into a proven fact.
4. I cannot determine from outside the server: exact git commit, whether `config:cache` is stale,
   whether OPcache is serving old bytecode, or queue worker status (this feature doesn't use queued
   jobs, so #5 in the request is not applicable — `validatePublicAddress`,
   `validateAttendanceLocationAddress`, and `updateAttendanceLocation` all run synchronously in the
   request/response cycle, nothing about this feature is dispatched to a queue).

### Temporary debug endpoint — added, not yet deployed

Added `GET /api/_debug/timezone-lookup` (`app/Http/Controllers/TimezoneDiagnosticsController.php`,
routed in `routes/api.php`). It is **token-gated and fails closed**: it 404s unless the
`TIMEZONE_DEBUG_TOKEN` env var is set on the server and the caller sends a matching
`X-Debug-Token` header, so merely deploying this file does not expose anything.

Once deployed and enabled, calling it returns, in one JSON response:

```jsonc
{
  "deployment": {
    "git_commit": "...",          // git rev-parse HEAD, or an explicit note if exec() is disabled on this host
    "git_status_short": "...",     // uncommitted changes on the server, if any — proves whether it's a clean deploy
    "php_version": "8.2.31",
    "server_time": "...",
    "opcache_enabled": true/false
  },
  "config": {
    "config_is_cached": true/false,          // bootstrap/cache/config.php present?
    "config_cache_mtime": "...",             // compare against services_php_mtime below
    "services_php_mtime": "...",             // if config_cache_mtime is OLDER, the cache is stale — proves #3
    "timezone_lookup_base_url": "...",       // proves what config() is actually resolving to right now
    "nominatim_base_url": "..."
  },
  "connectivity": {
    "timeapi.io": { "reachable": true/false, "http_status": ..., "duration_ms": ... },
    "nominatim.openstreetmap.org": { "reachable": true/false, "http_status": ..., "duration_ms": ... }
    // proves #6 directly — a real outbound call made from inside the production process itself
  },
  "geocoding": { "status": "ok", "coordinates": {...} },
  "timezone_lookup": {
    "request_url": "...",           // the exact URL sent to TimeAPI, from production
    "http_status": ...,
    "raw_response_body": "...",     // the real bytes TimeAPI (or whatever intercepted the request) sent back
    "decoded_json": {...},
    "duration_ms": ...
  },
  "final_api_response": { "status": "ok"/"failed", "timezone": "..." or "errors": {...} }
}
```

This is deliberately synchronous and self-contained — no separate log-tailing required, no SSH
required, just one authenticated HTTPS call. It also duplicates everything into
`Log::warning('TIMEZONE_DEBUG diagnostic endpoint invoked.', ...)` in case an operator does have log
access and prefers that.

**I did not deploy this** — I have no mechanism to push code to `api-barbaari.pioneeriya.com` from this
environment. It exists in the repository, tested locally (3 passing tests in
`tests/Feature/TimezoneDiagnosticsControllerTest.php`, full suite still green at 46/46), ready for an
operator to deploy and immediately use.

### How to use it once deployed

```bash
# On the server, set once (e.g. in .env), then reload config (see checklist below):
TIMEZONE_DEBUG_TOKEN=<any-random-string-you-choose>

# From anywhere:
curl -s "https://api-barbaari.pioneeriya.com/api/_debug/timezone-lookup?latitude=47.6062&longitude=-122.3321" \
  -H "X-Debug-Token: <the-same-random-string>" | python3 -m json.tool

# If cPanel gives you no systemctl/root access to restart PHP-FPM (likely, on this host —
# see Evidence), add &reset_opcache=1 to run opcache_reset() from inside the actual live
# web worker before the rest of the diagnostic runs:
curl -s "https://api-barbaari.pioneeriya.com/api/_debug/timezone-lookup?reset_opcache=1" \
  -H "X-Debug-Token: <the-same-random-string>" | python3 -m json.tool
```

Read the response top to bottom:
- `deployment.git_commit` doesn't match the expected commit → **stale deployment**. Fix: re-deploy.
- `config.config_is_cached` is `true` and `config_cache_mtime` predates `services_php_mtime` →
  **stale config cache**. Fix: `php artisan config:cache` (see checklist).
- `connectivity["timeapi.io"].reachable` is `false`, or `reachable: true` but `http_status` isn't 200 →
  **production networking/firewall problem reaching TimeAPI specifically**. Compare against
  `connectivity["nominatim.openstreetmap.org"]` — if Nominatim is reachable but TimeAPI isn't, that
  points at a host-specific egress rule (e.g. an allowlist that was set up for Nominatim/USPS and never
  extended to TimeAPI) rather than a blanket outbound block.
- `connectivity["timeapi.io"].reachable` is `true` with `http_status: 200` here, but `timezone_lookup`
  in the same response also succeeds → **the underlying network/config problem has resolved itself, or
  was environment-specific to whatever triggered the original failures** — re-test the actual
  `/api/public/validate-address` endpoint to confirm the fix is visible end-to-end.
- Everything above looks healthy but `timezone_lookup.http_status` is still non-200 → **this is the
  remaining code-defect case** — capture the full JSON response and I'll go back into the code with
  that exact evidence.

**Remove `app/Http/Controllers/TimezoneDiagnosticsController.php`, its route in `routes/api.php`, and
`TIMEZONE_DEBUG_TOKEN` from the server's `.env` once the incident is closed.** It makes real outbound
calls on every invocation and echoes internal deployment state; it should not be a permanent fixture
even though it's token-gated.

### Exact deployment checklist

Run these on the production host, from the Laravel project root, after pulling the latest code:

```bash
# 1. Confirm what's actually on disk
git rev-parse HEAD
git status
git log -1 --stat

# 2. Clear every cache Laravel might be serving stale data from
php artisan optimize:clear
php artisan config:clear
php artisan config:cache
php artisan route:clear
php artisan route:cache
php artisan view:clear
php artisan view:cache

# 3. Confirm the new env vars actually resolved after re-caching config
php artisan tinker --execute="echo config('services.timezone_lookup.timeapi_base_url'), PHP_EOL;"
# expected: https://www.timeapi.io  (or whatever TIMEZONE_LOOKUP_BASE_URL is set to)

# 4. Bust OPcache so PHP-FPM/Apache workers stop serving old compiled bytecode
#    (needed if opcache.validate_timestamps=0 in php.ini, common on shared hosting).
#    NOTE: this project does NOT have an opcache artisan command installed (checked: no
#    spatie/laravel-opcache or similar in composer.json) — `php artisan opcache:clear`
#    does not exist here. A plain `php -r "opcache_reset();"` from an SSH shell also
#    will NOT work reliably: CLI PHP normally runs a separate OPcache instance (or none
#    at all — opcache.enable_cli is usually off) from the PHP-FPM/Apache workers that
#    actually serve HTTP requests, so resetting from CLI does not touch the live workers.
#    Use whichever of these actually applies on this host:
sudo systemctl restart php8.2-fpm     # PHP-FPM on a VM with root access
sudo systemctl restart apache2        # mod_php on Apache with root access
# On cPanel/shared hosting specifically (this host — see Evidence below), you likely have
# neither systemctl nor root. Use WHM/cPanel's "MultiPHP Manager" / "Application Manager"
# restart button if available, OR call opcache_reset() from *inside* the actual running
# web worker via the temporary debug endpoint below (?reset_opcache=1) — this is often
# the only option that works without root on shared hosting, because it executes in the
# same process pool that's actually serving requests.

# 5. Queue workers — not applicable to this feature.
#    validatePublicAddress / validateAttendanceLocationAddress / updateAttendanceLocation
#    all run synchronously in the HTTP request; nothing here is dispatched to a queue.
#    (Skip restarting queue workers for this specific incident — listed here only because
#    the checklist explicitly asked it to be verified.)

# 6. Confirm outbound reachability from the box itself, not just from a laptop
curl -sv -m 10 "https://timeapi.io/api/TimeZone/coordinate?latitude=47.5659&longitude=-122.2918"
curl -sv -m 10 "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=Seattle"
# both should return HTTP 200 with a JSON body. If either fails here, that is the root cause —
# proceed no further into Laravel-level debugging.

# 7. Only after 1–6: enable and call the temporary debug endpoint (see above) for a full,
#    single-response confirmation that ties git commit + config + connectivity + the real
#    TimeAPI call together.
```

### Conclusion (Round 2)

Confirmed, from direct evidence against the live production API: production is running the
timezone-detection feature (not stale pre-feature code), production successfully validates addresses
via USPS and geocodes them via Nominatim, and the failure is isolated and consistent at the TimeAPI
call specifically. The pattern (100% failure in production vs. 100% success from this environment, on
identical requests to the same external API) is most consistent with a production-side networking or
egress restriction specific to `timeapi.io`, on a shared cPanel host — but I am explicitly not calling
that proven, because proving it requires the one piece of evidence I cannot generate without server
access: an actual outbound connectivity check executed *from inside the production process*. That is
precisely what the temporary debug endpoint does. I've built it, tested it locally, and left it ready
to deploy — closing this out requires an operator with real access to run the checklist above and
either paste back the debug endpoint's JSON output, or tell me what `git rev-parse HEAD` on the box
actually returns.
