# Timezone Detection — Multi-Provider Resilience Report

## Root cause: named, not assumed

This round's brief said "do not assume the issue is TimeAPI — prove it." Here is the proof, from
inspecting the actual deployed code (Step 1):

**`TimezoneLookupService` (as of the previous round) already correctly handled:** missing `timeZone`
key, `null`/non-string values, invalid/non-JSON bodies (which is what an HTML redirect, a Cloudflare
challenge page, or a WAF block page would produce — all fail `json_decode()` cleanly regardless of
their HTTP status), non-2xx statuses, and validated every result against PHP's own
`timezone_identifiers_list()` before trusting it. It also already retried once with a fixed delay. I
verified this by re-reading the file line by line against every item on the "does it assume..." list in
Step 1 — it did not.

**What it did not have — and this is the actual, structural root cause — was a second provider.** It
was architecturally a single point of failure: exactly one HTTP dependency (`timeapi.io`) stood between
"USPS validated this address, Nominatim geocoded it" and a hard failure shown to the user. Every defensive
check in the old code only decided *how quickly and clearly* to give up — none of it could actually
route around a problem. Combined with the live production evidence gathered in the prior round (USPS and
Nominatim both succeed in production; only the TimeAPI step fails, consistently, across three different
real addresses) — whatever is actually blocking that one call in that one shared-hosting environment
(most likely a network/egress restriction specific to that host, per the prior report), **the fix that
matters is removing the single point of failure itself**, which is exactly what this round asked for.
I did not re-diagnose the exact network-level cause on that host this round — no new tooling in this
environment makes that possible without server access — but the architecture no longer depends on the
answer.

`GeocodingService` was inspected too (Step 1 also names it): it already has retry, timeouts, structured-
query fallback, and full logging from the previous round, and did not need further changes this round —
Step 2's fallback-provider requirement was scoped specifically to timezone lookup.

`ApiController` and the Organization update flow: inspected, unchanged. All three call sites
(`validatePublicAddress`, `validateAttendanceLocationAddress`, `updateAttendanceLocation`) call
`$this->timezoneLookup->resolve((float) $lat, (float) $lng): string`, throwing on total failure — that
exact contract is preserved, so **zero changes were needed in the controller**. The multi-provider
architecture is entirely internal to `TimezoneLookupService`.

## What was built

### Provider abstraction (`app/Services/TimezoneProviders/`)

- **`TimezoneProviderInterface`** — `name()`, `isConfigured()`, `resolve(lat, lng): string`.
- **`TimezoneProviderException`** — internal-only failure carrying a `reason` + structured `context`,
  always caught by the orchestrator, never leaked to the user.
- **`AbstractHttpTimezoneProvider`** — shared plumbing every HTTP-based provider gets for free:
  connect timeout (3s) and request timeout (6s) set *separately*, retry with exponential backoff
  (400ms → 800ms, capped at 2s; 2 total attempts per provider), a real `User-Agent` header, `Accept:
  application/json`, strict `json_decode()` (this is what catches redirects/HTML/Cloudflare-block pages
  regardless of HTTP status — anything that isn't parseable JSON fails here), IANA validation via
  `timezone_identifiers_list()`, secret redaction in every logged URL, and response-body truncation
  (500 chars) before logging.
- **`TimeApiProvider`** — the existing TimeAPI integration, refactored onto the shared base. Always
  "configured" (free, keyless).
- **`GeoNamesProvider`** (new) — `api.geonames.org/timezoneJSON`, field `timezoneId`. Configured only
  when `GEONAMES_USERNAME` is set. I confirmed live that GeoNames' shared `demo` account returns a
  quota-exceeded error and is explicitly documented as unusable for real applications — this provider
  deliberately does **not** fall back to `demo`; an unconfigured GeoNames is treated as "skip," not
  "try anyway and fail." I also confirmed live (unauthenticated) that GeoNames returns **HTTP 200** with
  an embedded `{"status": {...}}` error object for quota/auth failures rather than a non-2xx status —
  the provider checks for that explicitly, since a naive "check the HTTP status" implementation would
  have missed it.
- **`GoogleTimeZoneProvider`** (new) — Google Maps Platform Time Zone API, field `timeZoneId`, requires
  `status: "OK"`. Configured only when `GOOGLE_TIMEZONE_API_KEY` is set. Verified live (unauthenticated)
  that Google also returns HTTP 200 with `{"status":"REQUEST_DENIED", "errorMessage": "..."}` — same
  "don't trust the status code alone" defense as GeoNames.
- **`OfflineTimezoneProvider`** (new, extension point) — see "Offline lookup" below.

### Orchestrator (`app/Services/TimezoneLookupService.php`, rewritten)

```
resolve(lat, lng):
  for provider in [TimeApi, GeoNames, Google, Offline]:
    if not provider.isConfigured(): log "skipped", continue
    try:
      return provider.resolve(lat, lng)   # first success wins, immediately
    except TimezoneProviderException:
      continue   # already logged in detail by the provider
  # every provider exhausted:
  log "every configured provider was exhausted" (names all attempted/skipped providers)
  throw ONE generic ValidationException — never names a provider to the caller
```

Public contract unchanged: `resolve(float, float): string`, throws `ValidationException` under the
`address` key on total failure. `ApiController` required no changes.

### Resilience (Step 3)

| Requirement | Implementation |
|---|---|
| Retry with exponential backoff | 400ms → 800ms (capped 2s), 2 attempts/provider |
| Connect timeout | 3s, separate from request timeout |
| Request timeout | 6s |
| User-Agent | `<app name>/timezone-lookup <app url>` on every request |
| `Accept: application/json` | On every request |
| Validate returned timezone | `is_string()` + `in_array($tz, timezone_identifiers_list())`, on every provider, before it can ever be returned or saved |
| Structured logging | See below |

### Observability (Step 4)

Every provider attempt logs, via `AbstractHttpTimezoneProvider`:
`Timezone provider request starting.` → `provider`, `request_url` (secrets redacted), `latitude`,
`longitude`; then either `Timezone provider succeeded.` (`http_status`, `parsed_timezone`) or
`Timezone provider failed.` (`provider`, `reason`, plus whichever of `http_status` / `response_body`
(truncated to 500 chars) / `json_error` / `failure_category` (`dns`/`ssl`/`timeout`/`connection_refused`)
/ `parsed_timezone` applies to that failure mode). The orchestrator additionally logs
`Timezone lookup resolved.` (`provider_used`, `fallback_used`, `providers_attempted`,
`providers_skipped`, `final_timezone`) on success, and `Timezone lookup failed: every configured
provider was exhausted.` (naming every attempted/skipped provider) on total failure. No API key,
username, or token ever appears in a log line — verified by test (`GeoNamesProviderTest::
test_the_username_never_appears_in_logs`, `GoogleTimeZoneProviderTest::test_the_api_key_never_appears_in_logs`).

### User-facing failure (Step 5)

If every configured provider fails, the caller gets exactly one message, unchanged from before:
*"We could not automatically determine the timezone for this address. Please double-check the address
and try again."* No provider name appears in the exception, the HTTP response, or anywhere the frontend
can see. Verified by test (`TimezoneLookupServiceTest::
test_when_every_provider_fails_it_throws_one_generic_friendly_error_naming_no_provider`, which asserts
the message doesn't contain `"timeapi"`, `"geonames"`, `"google"`, or the fake provider names used in
the test).

## Offline lookup — investigated, not fabricated

I re-checked the PHP/Composer ecosystem for an offline lat/lng→IANA-timezone package (this was also
researched in an earlier round of this feature). Nothing changed: the only candidates found
(e.g. `abdalasif/geo-timezone`) have single-digit GitHub stars and under 200 all-time downloads —
not something to depend on for correctness, especially since this feature must distinguish
`America/Phoenix` (no DST) from `America/Denver` (observes DST) despite both sitting in the same
longitude band. A low-quality or hand-rolled approximation would silently produce a *wrong* timezone
rather than fail loudly, which is worse than the current behavior.

**`OfflineTimezoneProvider` exists as a real, wired-in extension point, not a stub that does nothing
useful:** it's already in the fallback chain, already implements the interface, and reports
`isConfigured() === false` via a `class_exists()` check against a placeholder class name. If a real
offline package (or a vendored timezone-boundary dataset) is added later, wiring it in requires editing
exactly one file (`OfflineTimezoneProvider.php`) — no changes anywhere else, including no changes to the
orchestrator, the controller, or any call site. **Offline lookup is not supported today**, and I'm not
claiming otherwise.

## Files changed

| File | Change |
|---|---|
| `app/Services/TimezoneLookupService.php` | Rewritten as the multi-provider orchestrator |
| `app/Services/TimezoneProviders/TimezoneProviderInterface.php` | New |
| `app/Services/TimezoneProviders/TimezoneProviderException.php` | New |
| `app/Services/TimezoneProviders/AbstractHttpTimezoneProvider.php` | New — shared HTTP/retry/logging/validation |
| `app/Services/TimezoneProviders/TimeApiProvider.php` | New (refactor of prior single-provider logic) |
| `app/Services/TimezoneProviders/GeoNamesProvider.php` | New |
| `app/Services/TimezoneProviders/GoogleTimeZoneProvider.php` | New |
| `app/Services/TimezoneProviders/OfflineTimezoneProvider.php` | New (extension point) |
| `config/services.php` | `timezone_lookup` block: added `geonames_username`, `geonames_base_url`, `google_api_key`; removed the now-unused single-provider `provider` key |
| `.env.example` | Documented `GEONAMES_USERNAME`, `GEONAMES_BASE_URL`, `GOOGLE_TIMEZONE_API_KEY` |
| `tests/Feature/TimezoneLookupServiceTest.php` | Rewritten for orchestrator behavior (fallback, skip, exhaustion) |
| `tests/Feature/TimezoneProviders/TimeApiProviderTest.php` | New, 11 tests |
| `tests/Feature/TimezoneProviders/GeoNamesProviderTest.php` | New, 6 tests |
| `tests/Feature/TimezoneProviders/GoogleTimeZoneProviderTest.php` | New, 6 tests |
| `tests/Feature/TimezoneProviders/OfflineTimezoneProviderTest.php` | New, 2 tests |
| `tests/Feature/TimezoneProviderFallbackIntegrationTest.php` | New, 4 tests — full stack, real routes |

Not touched this round: `ApiController.php`, `GeocodingService.php`, `Organization.php`, any frontend
file, the existing temporary debug endpoint from the prior round (still present, still works — its
public interface didn't change — but a new one was deliberately not added, per this round's
instructions).

## Tests

`php artisan test`: **75 passed, 294 assertions**, 0 failures. Every scenario from Step 6:

| Scenario | Test | Result |
|---|---|---|
| Seattle → `America/Los_Angeles` | `TimezoneAutoDetectionTest` (data provider) + live tinker run | ✓ |
| New York → `America/New_York` | same | ✓ |
| Chicago → `America/Chicago` | same | ✓ |
| Phoenix → `America/Phoenix` | same | ✓ |
| Invalid coordinates → friendly error | `TimezoneAutoDetectionTest::test_timezone_lookup_failure_...` | ✓ |
| Provider 1 failure → provider 2 succeeds | `TimezoneLookupServiceTest::test_provider_1_failure_falls_through_to_provider_2` **and** `TimezoneProviderFallbackIntegrationTest::test_timeapi_http_failure_falls_through_to_geonames_...` (real routes) | ✓ |
| Provider 1 timeout → provider 2 succeeds | `TimezoneLookupServiceTest::test_provider_1_timeout_falls_through_to_provider_2` **and** `TimezoneProviderFallbackIntegrationTest::test_timeapi_connection_timeout_falls_through_to_geonames` (real routes) | ✓ |
| All providers fail → friendly error | `TimezoneLookupServiceTest::test_when_every_provider_fails_...` **and** `TimezoneProviderFallbackIntegrationTest::test_both_providers_failing_still_returns_one_generic_friendly_error` (real routes) | ✓ |

I also re-ran the live, unmocked four-city check directly against the real TimeAPI (the only provider
configured in this local environment, matching a fresh deploy's default state) after the rewrite:

```
Seattle, WA  → America/Los_Angeles
New York, NY → America/New_York
Chicago, IL  → America/Chicago
Phoenix, AZ  → America/Phoenix
```

**Frontend:** `npm --workspaces --if-present run typecheck` — clean, all three apps. `npm --workspaces
--if-present run build` — all three apps build successfully (no frontend files changed this round).

## Production deployment steps

No frontend rebuild is needed — this round is backend-only.

1. Deploy the changed/new files listed above.
2. `php artisan config:clear && php artisan config:cache` (new config keys — `geonames_username`,
   `geonames_base_url`, `google_api_key` — must be picked up; a stale config cache was already
   identified as a risk in the prior round's report).
3. Bust OPcache for the actual running PHP-FPM/Apache workers (service restart if you have that access;
   the previous round's temporary debug endpoint's `?reset_opcache=1` still works if you don't, on this
   shared cPanel host).
4. **Recommended, not required:** register a free GeoNames username
   (https://www.geonames.org/login — free, instant, just requires enabling "free web services" on the
   account afterward) and set `GEONAMES_USERNAME` in production `.env`. This is the single highest-value
   step available: with zero other changes, it turns "one external dependency" into "two independent
   external dependencies," which directly eliminates the class of failure this entire investigation has
   been about. Without it, the code is more resilient (better retry/timeout/logging) but still only has
   one real provider actually configured.
5. Optional: `GOOGLE_TIMEZONE_API_KEY` for a third layer, if there's an existing Google Cloud billing
   account to attach it to — meaningfully more setup friction than GeoNames for marginal extra
   redundancy, so I'd treat GeoNames as the priority.

## Are any API keys required?

**No.** Out of the box, with zero configuration changes, only `TimeApiProvider` is configured (same as
before this round) — the code runs identically to today with no new required setup. `GeoNamesProvider`
and `GoogleTimeZoneProvider` are both fully optional; each independently activates the moment its env
var is set, with no other code or config changes needed. This means: today, in production, right after
this deploys, the *system* is more resilient (better timeouts/retry/logging/redirect-and-HTML-page
handling per provider) but still has exactly one real provider — the single-point-of-failure problem
this task set out to solve is only actually closed once `GEONAMES_USERNAME` (or a Google key) is set.
I'm stating that plainly rather than implying the deploy alone fixes redundancy — it fixes the
*architecture* for redundancy; turning it on is a one-line, five-minute, free operator step described
above.

## Is offline lookup now supported?

**No** — see "Offline lookup" above. The extension point exists and is wired into the fallback chain;
no accurate offline package was installed, because none currently available is trustworthy enough to
ship silently.
