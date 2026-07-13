# Automatic Timezone Detection — Implementation Report

## Summary

Manual timezone entry has been removed from the provider-facing product. Timezone is now derived
automatically, server-side, from the geocoded latitude/longitude of a validated attendance address,
for both the **Settings → Attendance Location** flow and the **public provider registration** flow
(which shares the same address-validation pipeline). Providers can no longer type or edit an IANA
timezone anywhere in the daycare-web app.

The fix addresses the root cause directly: the only place a raw, free-text timezone string could be
submitted was `PUT /api/manager/organization` (the general "Update organization" button). That field
has been removed from the request validation entirely, so "The timezone field must be a valid
timezone." can no longer occur — the endpoint silently ignores any `timezone` key a client might still
send, and timezone is now exclusively set by the Attendance Location save endpoint.

## Timezone lookup approach

**Provider:** [timeapi.io](https://www.timeapi.io) `GET /api/timezone/coordinate?latitude=&longitude=`
— a free, keyless REST API that returns an IANA timezone for a given lat/lng pair. No API key or
account signup is required, so there is nothing new to configure in production beyond the two
optional env vars below (both already default to working values).

**Why this approach:** timezone-from-coordinates is fundamentally a point-in-polygon lookup against
timezone boundary shapefiles. I surveyed the PHP/Composer ecosystem for an offline library that does
this reliably (`abdalasif/geo-timezone`, `league/geotools`, various `timezonefinder` name variants) and
found nothing production-grade — the only offline candidate had 180 total downloads and 0 GitHub stars.
Given the existing codebase already depends on external network services for the same address pipeline
(USPS `apis.usps.com` for validation, Nominatim `nominatim.openstreetmap.org` for geocoding), adding one
more free, keyless HTTP lookup is consistent with the established architecture rather than a new class
of dependency.

**Defense in depth:** the raw string returned by the provider is validated against PHP's own
`timezone_identifiers_list()` before it is ever trusted or persisted. A malformed, empty, or
non-IANA response is treated as a lookup failure, not written to the database, and surfaced as a
friendly validation error — the provider response is never persisted blind.

**Config** (`config/services.php`, both optional — sane defaults are baked in):
```
TIMEZONE_LOOKUP_PROVIDER=timeapi
TIMEZONE_LOOKUP_BASE_URL=https://www.timeapi.io
```

## Files changed

### Backend (`apps/backend`)
| File | Change |
|---|---|
| `app/Services/TimezoneLookupService.php` | **New.** `resolve(lat, lng): string` — calls timeapi.io, validates the result against `timezone_identifiers_list()`, throws a friendly `ValidationException` (`errors.address`) on any failure (network error, non-2xx, missing/invalid timezone). |
| `app/Http/Controllers/ApiController.php` | Injected `TimezoneLookupService`. `validatePublicAddress` and `validateAttendanceLocationAddress` now resolve and return `timezone` alongside the standardized address/coordinates. `updateAttendanceLocation` resolves timezone, persists it on `organizations.timezone`, and syncs `organization_settings.attendance_policy.attendance_timezone` (existing helper, same pattern already used by org onboarding). `updateOrganization` **no longer accepts a `timezone` field at all** — this is the fix for the reported validation error. `createFacilityRegistrationApplication`'s `timezone` rule tightened from `string,max:80` to the strict `timezone` rule (defense in depth; in practice the value is always overwritten by the auto-detected timezone from the cached, validated address). |
| `config/services.php`, `.env.example` | Added `timezone_lookup` config block and documented env vars. |

### Frontend (`apps/daycare-web`)
| File | Change |
|---|---|
| `src/pages/SettingsPage.tsx` | Removed the free-text "Timezone" field from Business/Status panel. Added a read-only "Timezone ... ✓ Automatically detected from attendance address" display inside the **Attendance Location** panel, sourced from the validate-address response (fresh) or the organization's saved timezone (fallback). The general org-update payload no longer includes `timezone`. |
| `src/pages/RegisterProviderPage.tsx` | Removed the manual "Timezone, e.g. America/New_York" text input. The validated-address confirmation card now shows the auto-detected timezone. `emptyForm` no longer carries a `timezone` key — the backend derives it from the validated address regardless of what a client sends. |

### Shared (`packages/shared/src/api.ts`)
`getApiError()` now prefers the first field-specific validation message (`response.data.errors`) over
the generic `"The given data was invalid."` wrapper message Laravel returns by default. This was
necessary for the "friendly validation error" requirement to actually reach the UI — previously every
form in the app (not just this feature) silently swallowed specific messages in favor of the generic
one. Low-risk, additive change; falls back to the old behavior if no field errors are present.

### Tests (`apps/backend/tests/Feature`)
- **`TimezoneLookupServiceTest.php`** (new) — unit-style coverage of the service itself via `Http::fake()`: successful resolution, provider unreachable/5xx, provider returns a non-IANA string, provider returns an empty body.
- **`TimezoneAutoDetectionTest.php`** (new) — end-to-end coverage through the real controller/routes with faked USPS/Geocoding/TimezoneLookup services:
  - Seattle → `America/Los_Angeles`, New York → `America/New_York`, Chicago → `America/Chicago`, Phoenix → `America/Phoenix` (data provider, matches the exact validation matrix from the spec).
  - Timezone lookup failure returns a friendly `422` under `errors.address` and does **not** save the organization's coordinates or timezone.
  - Registration ignores an applicant-supplied timezone (`America/New_York` submitted) in favor of the auto-detected one (`America/Chicago`) — proves the value is never trusted from the client.
- **`SettingsAttendanceLocationTest.php`** (updated) — added timezone assertions to the existing validate/save happy path; added `test_organization_profile_update_no_longer_accepts_manual_timezone`, which submits an intentionally invalid string to `PUT /api/manager/organization` and asserts it's silently ignored (200 OK, organization timezone unchanged) — this is the regression test for the original bug report.
- **`PublicAddressRegistrationTest.php`** (updated) — added `timezone` assertions to the public address validation and registration-approval tests.

## Verification results

**Automated suite** — `php artisan test` (full suite, not just the new tests):
```
Tests:    35 passed (195 assertions)
Duration: 0.54s
```
All pre-existing tests pass unmodified in behavior (tablet geofence enforcement, attendance location,
public registration, staff invites) — nothing else broke.

**Frontend typecheck** — `npm --workspaces --if-present run typecheck`: daycare-web, mobile, and
super-admin all pass with zero errors.

**Frontend build** — `npm --workspaces --if-present run build`: all three apps build successfully
(super-admin's pre-existing "chunk larger than 500kB" warning is unrelated to this change).

**Live smoke test against real external services** (not mocks) — ran `USPSAddressService` →
`GeocodingService` (real Nominatim) → `TimezoneLookupService` (real timeapi.io) directly via
`php artisan tinker` for the exact cities in the spec:

| City | Detected coordinates | Detected timezone |
|---|---|---|
| Seattle, WA | 47.6205, -122.3493 | `America/Los_Angeles` ✓ |
| New York, NY | 40.7484, -73.9857 | `America/New_York` ✓ |
| Chicago, IL | 41.8787, -87.6360 | `America/Chicago` ✓ |
| Phoenix, AZ | 33.4488, -112.0771 | `America/Phoenix` ✓ (correctly distinct from Denver — no DST) |

This confirms the lookup works against the live provider, not just test doubles, and correctly
distinguishes Phoenix from Denver despite both being in the Mountain longitude band — something a
naive longitude-band heuristic could not do.

**Not verified live in this environment:** the USPS OAuth token call caches through the database
(`CACHE_STORE=database`), and no local MySQL server was available in this sandbox, so a full live
USPS → geocode → timezone round trip could not be exercised end-to-end here. `USPSAddressService` was
not modified by this change, and its existing behavior is covered by the pre-existing, passing
`test_invalid_address_returns_friendly_error` and related tests using a faked USPS response. I'm
flagging this rather than claiming a live USPS check that didn't happen.

## Things a deploy needs to know

- No new secrets or signups required. `TIMEZONE_LOOKUP_PROVIDER` / `TIMEZONE_LOOKUP_BASE_URL` are
  optional and default to a working, free, keyless endpoint (`https://www.timeapi.io`).
- `timeapi.io` is a third-party free service with no formal SLA. If it becomes unavailable, the
  behavior is a friendly validation error on address validation/save (no silent fallback to a wrong
  timezone) — acceptable for now, but worth revisiting if uptime becomes a problem (e.g. swapping in a
  paid provider like Google Time Zone API behind the same `TimezoneLookupService::resolve()` interface,
  which was written to make that a one-method change).
- Existing organizations that already have a timezone saved are untouched — this feature only changes
  how timezone is set going forward (via Attendance Location validate/save), not historical data.

## Out of scope (intentionally)

- **Super Admin → Organizations → Create Organization** (`apps/super-admin/src/pages/OrganizationsPage.tsx`)
  still has a manual timezone dropdown. That form's backend endpoint (`ApiController::createOrganization`)
  never performed USPS validation or geocoding — it's a deliberate manual bulk-onboarding tool for
  platform staff, not the provider-facing address flow this task targeted. Auto-detecting timezone there
  would require bolting the full address-validation/geocoding pipeline onto a flow that doesn't have one
  today, which is a materially larger, unrequested change. Flagging it here rather than touching it
  silently.
- **Super Admin → Settings → General Settings "Default timezone"** field is an unrelated,
  locally-mocked platform config field (not organization/address-driven), left untouched.
