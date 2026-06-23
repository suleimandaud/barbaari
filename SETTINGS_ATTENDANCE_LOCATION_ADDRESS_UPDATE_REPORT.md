# Settings Attendance Location Address Update Report

## What changed

- Replaced editable latitude/longitude fields in Settings → Attendance Location with a normal address form.
- Added protected address validation for Settings attendance location.
- Added protected save endpoint that re-validates and geocodes before saving.
- Removed provider-facing latitude/longitude/radius updates from the general organization profile update path.
- Kept Super Admin platform location tooling unchanged.
- Kept tablet geofence logic unchanged; it still reads organization latitude, longitude, and radius.

## New Settings attendance location workflow

1. Provider admin or manager opens Settings → Attendance Location.
2. Current standardized address is shown when available.
3. If an older organization only has coordinates, Settings shows: “Current coordinates are saved. Update by entering a physical address below.”
4. User enters:
   - Street address
   - Unit / Apartment / Suite
   - City
   - State
   - ZIP Code
   - Country
   - Allowed attendance radius in meters
5. User clicks `Validate Address`.
6. Backend validates with USPS and geocodes with the configured geocoder.
7. Frontend shows standardized address and “Coordinates saved after validation.”
8. User clicks `Save Attendance Location`.
9. Backend re-validates and re-geocodes, then saves address, coordinates, radius, timestamps, and provider metadata to the organization.

## Backend endpoint added

- `POST /api/settings/attendance-location/validate`
  - Protected by auth and `role:daycare_admin,manager`.
  - Validates/standardizes address and returns geocoded coordinates for confirmation.
  - Does not save organization data.

- `POST /api/settings/attendance-location`
  - Protected by auth and `role:daycare_admin,manager`.
  - Reuses the same validation/geocoding services.
  - Saves organization address fields, latitude, longitude, radius, validation timestamps, and geocoding provider.

## Files changed

- `apps/backend/app/Http/Controllers/ApiController.php`
- `apps/backend/routes/api.php`
- `apps/backend/tests/Feature/SettingsAttendanceLocationTest.php`
- `apps/daycare-web/src/pages/SettingsPage.tsx`
- `packages/shared/src/api.ts`

## Migrations added

- None for this task. The required organization address/geocoding columns already exist from the registration address validation work.

## USPS/geocoding reuse

- Settings uses the existing `USPSAddressService`.
- Settings uses the existing `GeocodingService`.
- USPS secrets and OAuth tokens remain backend-only.
- Frontend receives only standardized address and coordinate results, never USPS credentials or tokens.

## Permissions

- `daycare_admin` and `manager` can validate and update attendance location.
- `staff` and `teacher` receive `403`.
- Super Admin platform routes were not changed.
- The public registration `POST /api/public/validate-address` endpoint remains unchanged.

## Tests passed

- `php artisan test`
- `php artisan route:list`
- `php artisan config:clear`
- `npm --workspace @barbaari/daycare-web run typecheck`
- `VITE_API_URL=https://api-barbaari.pioneeriya.com/api npm --workspace @barbaari/daycare-web run build`
- `npm --workspace @barbaari/super-admin run typecheck`
- `VITE_API_URL=https://api-barbaari.pioneeriya.com/api npm --workspace @barbaari/super-admin run build`
- `npm --workspace @barbaari/mobile run typecheck`
- Frontend dist scan found no USPS key/token strings and no localhost API URLs.

## Commands blocked locally

- `php artisan migrate` failed because local MySQL at `127.0.0.1:3306` for `barbaari_db` was not reachable.
- `php artisan cache:clear` failed for the same reason because the configured cache store uses the database.

## Remaining notes

- Super Admin can still update organization coordinates through the existing platform location route.
- Existing organizations with old coordinates still load. Providers can replace legacy coordinates by entering and validating a physical address in Settings.
- The super-admin build still emits the existing large chunk warning.
- Typecheck/build updated tracked `tsconfig.tsbuildinfo` files; those should not be committed.

## Staging deployment steps

1. Deploy backend changes.
2. Run `php artisan migrate` in staging if pending migrations exist from prior address work.
3. Run `php artisan config:clear`.
4. Run `php artisan cache:clear`.
5. Deploy rebuilt daycare web and super-admin web apps with production `VITE_API_URL`.
6. Log in as a provider admin or manager.
7. Open Settings → Attendance Location.
8. Validate a valid US address and save it.
9. Confirm organization address fields, latitude, longitude, radius, timestamps, and geocoding provider are saved.
10. Confirm staff/teacher users cannot update attendance location.
11. Confirm tablet attendance geofence uses the updated coordinates.
