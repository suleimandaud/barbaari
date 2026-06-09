# Registration Plan UI Fix Report

## Summary

The provider registration plan explanation UI was simplified and made facility-type aware.

## Family Child Care

Family Child Care registration now shows only the Starter plan returned by the pricing-plan API.

Displayed explanation includes:

- plan name
- selected monthly/yearly price
- child limit
- staff limit
- tablet device limit
- included features
- Family Child Care Starter-only note

Backend enforcement remains active. A Family Child Care application submitted with Growth/Enterprise is rejected with HTTP 422:

`Family Child Care registration is available only on the Starter plan.`

## Center Daycare

Center Daycare registration shows the plan dropdown with all center-available plans:

- Starter
- Growth
- Enterprise

The explanation area now displays only the selected plan. Changing the dropdown updates the card automatically.

## UI Changes

Added a `plan-explainer` card style with separated labels, price, limits, and feature text. This prevents text from running together, such as `Starter$99/month`.

## API Verification

Local API checks:

- `GET /api/public/pricing-plans?facility_type=family_child_care` returned Starter only.
- `GET /api/public/pricing-plans?facility_type=center_daycare` returned Starter, Growth, and Enterprise.
- Family Child Care submitting Growth returned a clean 422 JSON validation response with the required message.

## Files Changed

- `apps/daycare-web/src/pages/RegisterProviderPage.tsx`
- `apps/daycare-web/src/styles.css`
- `apps/backend/app/Http/Controllers/ApiController.php`

## Staging Notes

Build provider and super-admin web apps with:

`VITE_API_URL=https://api-barbaari.pioneeriya.com/api`

Dist checks confirmed both built apps contain the staging API URL and no `127.0.0.1`, `localhost:8000`, `localhost:5173`, or `localhost:5174` API/dev-server URLs.

