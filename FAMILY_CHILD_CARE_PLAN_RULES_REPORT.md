# Family Child Care Plan Rules Report

## Rule

Family Child Care providers are allowed to register only for the Starter plan.

Center Daycare providers may register for Starter, Growth, Enterprise, or any plan marked available for center daycare.

## Backend Enforcement

Backend enforcement was added in:

- public pricing plan listing
- public registration application submission
- Super Admin application approval
- internal support organization creation fallback

If a Family Child Care application submits Growth or Enterprise, the API returns HTTP 422 with:

```text
Family Child Care registration is available only on the Starter plan.
```

## Demo Data

Demo reset now configures plans as:

- Starter: family child care and center daycare
- Growth: center daycare only
- Enterprise: center daycare only

## Frontend Behavior

Public registration:

- Family Child Care shows only Starter.
- Center Daycare shows all center-available plans.
- Plan cards include price, child limit, staff limit, device limit, and features.

Super Admin:

- Registration approval dropdown filters Family Child Care to Starter only.
- Internal support fallback also filters Family Child Care to Starter only.

## Verified Locally

- `GET /api/public/pricing-plans?facility_type=family_child_care` returned Starter only.
- `GET /api/public/pricing-plans?facility_type=center_daycare` returned Starter, Growth, and Enterprise.
- Posting a Family Child Care application with Growth returned HTTP 422.
- Posting a Family Child Care application with Starter succeeded.
