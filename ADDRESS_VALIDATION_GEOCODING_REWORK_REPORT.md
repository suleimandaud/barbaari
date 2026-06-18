# Address Validation and Geocoding Rework Report

## What changed

- Replaced public provider registration latitude/longitude inputs with a US physical address form:
  - Street address
  - Unit / Apartment / Suite
  - City
  - State
  - ZIP Code
  - Country
  - Attendance radius in meters
- Added a `Validate Address` action on the registration form.
- Added backend-only USPS address validation and standardization.
- Added backend-only geocoding through a configurable provider.
- Added a cache-backed `address_validation_token` so registration submission uses coordinates returned by the backend validation flow, not arbitrary latitude/longitude entered by the browser.
- Updated Super Admin registration review to show standardized address, validation state, radius, and geocoding provider.
- Kept tablet geofence logic unchanged. It still reads organization latitude, longitude, and radius.

## USPS setup required

The project owner must create a USPS Developer Portal app and provide backend-only credentials:

```env
USPS_CONSUMER_KEY=
USPS_CONSUMER_SECRET=
USPS_BASE_URL=https://apis.usps.com
```

The React frontend does not receive USPS credentials, OAuth tokens, or USPS endpoint URLs.

## Geocoding provider used

- Pilot/demo provider: `nominatim`
- Service: OpenStreetMap Nominatim
- Calls are made only from Laravel.
- Provider selection is controlled by `GEOCODER_PROVIDER`, so Google, Mapbox, or a paid OSM provider can be added later without changing registration UI logic.

## Env variables needed

```env
USPS_CONSUMER_KEY=
USPS_CONSUMER_SECRET=
USPS_BASE_URL=https://apis.usps.com
GEOCODER_PROVIDER=nominatim
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
```

## Files changed

- `apps/backend/.env.example`
- `apps/backend/app/Http/Controllers/ApiController.php`
- `apps/backend/app/Models/FacilityRegistrationApplication.php`
- `apps/backend/app/Models/Organization.php`
- `apps/backend/app/Services/USPSAddressService.php`
- `apps/backend/app/Services/GeocodingService.php`
- `apps/backend/config/services.php`
- `apps/backend/database/migrations/2026_06_17_000001_add_validated_address_fields.php`
- `apps/backend/routes/api.php`
- `apps/backend/tests/Feature/PublicAddressRegistrationTest.php`
- `apps/daycare-web/src/pages/RegisterProviderPage.tsx`
- `apps/super-admin/src/pages/RegistrationApplicationsPage.tsx`
- `packages/shared/src/api.ts`

## Migrations added

- `2026_06_17_000001_add_validated_address_fields.php`

Adds validated address fields to `facility_registration_applications` and `organizations`:

- `address_line1`
- `address_line2`
- `postal_code`
- `standardized_address`
- `address_validated_at`
- `geocoded_at`
- `geocoding_provider`

Existing latitude, longitude, and radius columns remain in use.

## Tests passed

- `php artisan test --filter=PublicAddressRegistrationTest`
- `php artisan test`
- `npm --workspace apps/daycare-web run build`
- `npm --workspace apps/super-admin run build`
- Built frontend scan:
  - No USPS consumer keys, USPS OAuth token strings, USPS API endpoint strings, or Nominatim env names found in frontend dist.
  - No localhost API URL found in frontend dist.

## Remaining production notes

- Nominatim is acceptable for pilot/demo use, but production should use a provider with a service agreement and predictable rate limits.
- Add a production geocoder implementation behind `GeocodingService` before high-volume rollout.
- Confirm USPS Developer Portal app access includes the address standardization endpoint.
- Monitor validation failure logs without logging USPS secrets, OAuth tokens, or full sensitive payloads.
- Consider adding a queue or short geocoding cache if address validation volume grows.

## Staging deployment steps

1. Add USPS and geocoder env variables to staging backend.
2. Deploy backend code.
3. Run Laravel migrations.
4. Clear Laravel config cache.
5. Deploy rebuilt daycare web and super admin web apps.
6. Submit a Family Child Care staging application with a valid US address.
7. Confirm address validation succeeds and coordinates are saved.
8. Approve the application in Super Admin.
9. Confirm the created organization has standardized address, latitude, longitude, and radius.
10. Run tablet attendance check-in from inside and outside the configured radius to confirm existing geofence behavior still works.
