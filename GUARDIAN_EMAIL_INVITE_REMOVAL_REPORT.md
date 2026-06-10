# Guardian Email Invite Removal Report

## Summary

Parents and guardians are no longer treated as Barbaari login users in the normal attendance flow. They are attendance signers only. Guardian creation now stores guardian contact/linking information and an optional hashed tablet PIN, without requiring or using email, login password, invitation email, invite acceptance, or a `users` account.

## What Changed

- Removed guardian email input from the Daycare Web Guardians create form.
- Removed the "Queue invite email so guardian creates their login password" option.
- Removed guardian invite/password helper text from the Guardians page.
- Removed guardian email and invite/account columns from the Guardians table.
- Removed guardian "Send invite" and "Send reset email" actions from the Guardians table.
- Replaced user-facing helper text with: "Tablet PINs are used for attendance kiosk verification."
- Updated guardian labels so legacy email values are not shown in normal guardian selectors/list rows.
- Backend guardian create/update now ignores email for normal guardian records and does not create parent users.
- Backend guardian invite/password-reset endpoints now return `410 Gone` with an operational message that guardians sign with tablet PIN.

## Backend Behavior

Guardian create now supports:

- `name` required
- `phone` optional
- `relationship` optional
- `child_id` optional
- `can_pickup` optional
- `pin` optional, 4-8 digits

Guardian create no longer:

- requires guardian email
- creates `users` rows with `role=parent`
- creates organization invitations
- queues guardian invite emails
- stores raw PINs
- synchronizes guardian PINs onto user records

Existing legacy guardian invitation data may remain in the database, but the app no longer uses it for new guardian creation.

## Staff/Admin/Owner Invites

Staff/admin/owner invitation flows were not removed. The existing staff invite endpoint was checked and still returns 200 with an invitation payload.

## Files Changed

- `apps/backend/app/Http/Controllers/ApiController.php`
- `apps/backend/app/Http/Controllers/AuthController.php`
- `apps/daycare-web/src/pages/GuardiansPage.tsx`
- `apps/daycare-web/src/pages/TabletPortalPage.tsx`
- `apps/daycare-web/src/utils/labels.ts`
- `apps/mobile/app/kiosk.tsx`
- `apps/mobile/services/auth.ts`
- `apps/mobile/services/mobileApi.ts`

## Migrations

No migration was added. The existing `guardians.email` field is already nullable.

## Tests / Checks

- `php artisan migrate` - passed, nothing to migrate.
- `php artisan route:list` - passed.
- `php artisan config:clear` - passed.
- `php artisan cache:clear` - passed.
- `php -l app/Http/Controllers/ApiController.php` - passed.
- `php -l app/Http/Controllers/AuthController.php` - passed.
- `npm --workspace @barbaari/daycare-web run typecheck` - passed.
- `VITE_API_URL=https://api-barbaari.pioneeriya.com/api npm --workspace @barbaari/daycare-web run build` - passed.
- `npm --workspace @barbaari/super-admin run typecheck` - passed.
- `VITE_API_URL=https://api-barbaari.pioneeriya.com/api npm --workspace @barbaari/super-admin run build` - passed.
- `npm --workspace @barbaari/mobile run typecheck` - passed.

## Targeted API Verification

- Created guardian without email: passed.
- Created guardian with name, phone, relationship, child link, and PIN: passed.
- Confirmed response has `email: null`, `user_id: null`, `invitation: null`: passed.
- Confirmed no guardian invitation row was created for the no-email guardian: passed.
- Guardian invite endpoint returns 410 and no longer queues guardian invite email: passed.
- Staff invite endpoint still works: passed.

## Staging Notes

Build provider and super-admin web apps with:

```bash
VITE_API_URL=https://api-barbaari.pioneeriya.com/api npm --workspace @barbaari/daycare-web run build
VITE_API_URL=https://api-barbaari.pioneeriya.com/api npm --workspace @barbaari/super-admin run build
```

The built web API base points to `https://api-barbaari.pioneeriya.com/api`. A grep for `localhost:` / `127.0.0.1` in built dist returned no matches. Bundled vendor code still contains generic internal fallback strings such as `http://localhost`, but not as the Barbaari API base URL.

## Remaining Notes

- Legacy parent users and old invitation records can remain for historical data, but new guardian creation no longer uses them.
- Guardian email/reset API client methods remain in the shared client only as backward-compatible wrappers; the backend endpoints are disabled with 410.
