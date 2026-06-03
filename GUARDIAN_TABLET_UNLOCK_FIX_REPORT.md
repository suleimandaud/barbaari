# Guardian Tablet Unlock Fix Report

## Summary

Fixed the Guardian/Parent tablet unlock failure where Daycare Web reported `Guardian tablet PIN reset`, but Tablet/Kiosk Parent/Guardian mode returned `This account is inactive`.

The root issue was a state mismatch in the guardian flow:

- Daycare Web could reset `guardians.pin_hash` while the linked parent user was still `pending_invite`.
- Tablet unlock checked the user account status first and returned a generic inactive-account error.
- Guardian invitation acceptance did not consistently make the guardian account state visible to the UI as tablet-ready.
- Parent/Guardian tablet unlock did not clearly distinguish inactive user, inactive guardian profile, missing PIN, wrong PIN, password unlock, and no linked children.

## Backend Logic Fixed

### Guardian Invitation / Activation

When a guardian invite is resent or accepted, the backend now keeps the user and guardian states aligned:

- Pending invited users remain `pending_invite`.
- Active users cause linked guardian records for the same organization/email to become `active`.
- Guardian records are linked to the accepted user through `guardian.user_id` when possible.
- Guardian child links are preserved.

### Guardian Tablet Unlock

Parent/Guardian tablet unlock now:

- Requires the user role to be `parent`.
- Blocks pending users with:
  `This guardian account is not active yet. Please accept the invite first.`
- Requires at least one active guardian profile linked to the user/email.
- Requires at least one linked child from an active guardian profile.
- Allows either account password or tablet PIN.
- Allows password unlock even when no PIN is configured.
- Returns clear errors for:
  - inactive user
  - inactive guardian profile
  - missing PIN
  - wrong PIN/password
  - no linked children

### Guardian PIN Reset

Guardian PIN reset now returns readiness status:

- Active guardian/user:
  `Guardian tablet PIN reset. Tablet unlock is ready.`
- Pending guardian/user:
  `Guardian tablet PIN reset. Guardian must accept invite before tablet unlock.`

Raw PINs are not stored. PINs continue to be hashed.

## Frontend Messages Fixed

### Daycare Web Guardians Page

The Guardians page now shows:

- Guardian account status
- Invite status
- PIN configured / PIN missing
- Accurate PIN reset result message based on backend readiness

It no longer implies tablet unlock is ready when the guardian invite is still pending.

### Tablet/Kiosk Parent Mode

Tablet unlock now surfaces backend validation messages directly, including guardian-specific errors.

## Files Changed

- `apps/backend/app/Http/Controllers/AuthController.php`
- `apps/backend/app/Http/Controllers/ApiController.php`
- `apps/daycare-web/src/pages/GuardiansPage.tsx`
- `apps/mobile/app/kiosk.tsx`

## Targeted Verification

API tests were run against a local Laravel server after `php artisan barbaari:demo-reset`.

### Pending Guardian Cannot Unlock

Created `qa.guardian@example.test`, linked to Samira, set PIN `654321`, and did not accept invite.

Result:

- `POST /api/auth/tablet-unlock`
- Response: `403`
- Message: `This guardian account is not active yet. Please accept the invite first.`

### Accepted Guardian Can Unlock With PIN

Accepted invite for `qa.guardian@example.test`, then unlocked with PIN `654321`.

Result:

- `POST /api/auth/tablet-unlock`
- Response: `200`
- Returned only linked child ID `27`.

### Accepted Guardian Can Unlock With Password

Unlocked `qa.guardian@example.test` with accepted password.

Result:

- `POST /api/auth/tablet-unlock`
- Response: `200`
- Returned only linked child ID `27`.

### Wrong PIN Is Blocked

Used `000000`.

Result:

- `POST /api/auth/tablet-unlock`
- Response: `422`
- Message: `Incorrect PIN or password.`

### Accepted Guardian With No PIN Gets Clear Message

Created and accepted `no.pin.guardian@example.test` with a linked child but no tablet PIN, then attempted PIN unlock.

Result:

- `POST /api/auth/tablet-unlock`
- Response: `422`
- Message: `No tablet PIN is configured for this guardian. Use the account password or ask daycare staff to reset the tablet PIN.`

### Accepted Guardian With No Linked Children Is Blocked

Created and accepted `unlinked.guardian@example.test` without child links, then attempted password unlock.

Result:

- `POST /api/auth/tablet-unlock`
- Response: `403`
- Message: `No linked children are available for this guardian account.`

## Tests Passed

- `php -l apps/backend/app/Http/Controllers/AuthController.php`
- `php -l apps/backend/app/Http/Controllers/ApiController.php`
- `php artisan migrate`
- `php artisan barbaari:demo-reset`
- `php artisan route:list`
- `php artisan config:clear`
- `php artisan cache:clear`
- `npm --workspace @barbaari/daycare-web run typecheck`
- `npm --workspace @barbaari/daycare-web run build`
- `npm --workspace @barbaari/daycare-web run test:e2e`
- `npm --workspace @barbaari/super-admin run typecheck`
- `npm --workspace @barbaari/super-admin run build`
- `npm --workspace @barbaari/super-admin run test:e2e`
- `npm --workspace @barbaari/mobile run typecheck`

## Remaining Limitations

- Real email delivery still depends on configured production/staging mail credentials and a queue worker.
- Manual iPad simulator verification should be repeated in the final QA pass, but the backend unlock behavior is verified through the same API endpoint used by the tablet app.
- Guardian accounts must accept their invite before tablet unlock works, unless an admin explicitly activates the account through a supported future management action.
