# Tablet Only Portal Report

## Summary

Barbaari now has a standalone tablet/kiosk web portal that does not show the normal provider dashboard navigation.

Supported routes:

- `https://tablet-barbaari.pioneeriya.com`
- `https://barbaari.pioneeriya.com/tablet`
- `https://barbaari.pioneeriya.com/tablet/*`

The same daycare-web build supports the tablet subdomain by detecting the `tablet-barbaari.*` hostname and rendering only the tablet portal.

## Tablet Unlock Behavior

The tablet portal supports three modes:

- Parent / Guardian
- Staff
- Admin

The portal calls `POST /api/auth/tablet-unlock`, then calls `GET /api/tablet/bootstrap`.

Backend unlock now checks:

- user exists
- user role can unlock selected mode
- user is active
- organization exists
- organization status is active
- subscription allows access

If the organization is unpaid or inactive, tablet unlock returns:

```json
{
  "message": "This organization is not subscribed/active. Please contact the administrator."
}
```

## Facility Behavior

Family Child Care:

- `uses_classrooms=false`
- no classroom screen
- starts directly from child list
- admin/owner sees all children
- parent/guardian sees linked children only

Center Daycare:

- `uses_classrooms=true`
- classroom-first flow remains
- admin/manager sees all classrooms
- staff sees assigned classrooms through existing backend rules
- parent/guardian sees linked children only

## Tablet Actions

The tablet portal supports:

- check-in
- check-out
- absence for staff/admin modes
- browser geolocation submission
- typed digital-signature reference
- backend permission enforcement

The existing React Native/Expo tablet app remains unchanged.

## Verified Locally

- Unpaid family child care owner was blocked at tablet unlock with HTTP 402.
- Active family child care owner unlocked admin mode.
- Family child care tablet bootstrap returned no classrooms and one visible child.
- Active family guardian unlocked parent/guardian mode and saw only the linked child.
- Existing Little Lantern center daycare admin unlocked and bootstrap returned classroom cards with children.

## Remaining Manual QA

- Deploy the daycare-web build to `tablet-barbaari.pioneeriya.com`.
- Configure SPA fallback at tablet subdomain root.
- Verify iPad/tablet browser geolocation prompts and attendance action UX on the hosted domain.
