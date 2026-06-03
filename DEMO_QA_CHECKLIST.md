# Barbaari Demo QA Checklist

Run this checklist before every controlled demo.

## Backend

- [ ] XAMPP MySQL is running.
- [ ] Backend starts from `apps/backend` with `php artisan serve`.
- [ ] `php artisan config:clear` completed.
- [ ] `php artisan cache:clear` completed.
- [ ] `php artisan migrate` completed.
- [ ] `php artisan barbaari:demo-reset` completed.
- [ ] Little Lantern Daycare status is active.
- [ ] Super admin login works: `super@barbaari.test / Password123!`.
- [ ] Daycare admin login works: `admin@littlelantern.test / Password123!`.
- [ ] Teacher login works: `teacher@littlelantern.test / Password123!`.
- [ ] Staff login works: `staff@littlelantern.test / Password123!`.
- [ ] Parent login works: `parent@littlelantern.test / Password123!`.

## Daycare Web

- [ ] Login page loads at `http://localhost:5173`.
- [ ] Dashboard loads after daycare admin login.
- [ ] Sidebar appears as one clean vertical navigation list.
- [ ] Organization page opens and shows editable organization profile fields.
- [ ] Users & Staff page opens.
- [ ] Children page opens and child codes are visible.
- [ ] Guardians page opens.
- [ ] Attendance page opens, dropdowns stay inside cards, and row actions are visible.
- [ ] Billing page opens and child invoice creation uses a child dropdown.
- [ ] Payments page opens.
- [ ] Incidents page opens and incident creation uses a child dropdown.
- [ ] Daily Notes page opens and notes use a child dropdown.
- [ ] Documents page opens and is clearly labeled as demo metadata storage.
- [ ] Reports page opens and DCYF/export action is clearly labeled as a demo placeholder.
- [ ] Messages page opens.
- [ ] Notifications page opens.
- [ ] Devices page opens.
- [ ] Audit Logs page opens.
- [ ] No page is blank after refresh.
- [ ] Browser console has no red runtime errors.

## Super Admin

- [ ] Login page loads at `http://localhost:5174`.
- [ ] Platform dashboard loads after super admin login.
- [ ] Organizations page opens.
- [ ] Organization row actions show View, Approve, Suspend, Reactivate.
- [ ] Suspend action asks for confirmation with the selected organization name.
- [ ] Reactivate action asks for confirmation with the selected organization name.
- [ ] Pricing Plans page opens and create/edit/activate/deactivate actions are visible.
- [ ] Global Users page opens and filters/actions are visible.
- [ ] Support Tickets page opens and create/status/comment/close actions are visible.
- [ ] Settings page opens and SMS/email/Stripe controls are labeled as demo configuration.
- [ ] System Alerts page opens and create/resolve/reopen actions are visible.
- [ ] Monitoring page opens and provider checks are labeled as demo placeholders.
- [ ] Security / Audit Logs page opens.
- [ ] Subscription dates are human-readable.
- [ ] No page is blank after refresh.
- [ ] Browser console has no red runtime errors.

## Mobile

- [ ] Expo starts from `apps/mobile` with `npx expo start --ios`.
- [ ] Login screen respects safe area spacing.
- [ ] Parent/Staff role selector is visible.
- [ ] Parent login works: `parent@littlelantern.test / Password123!`.
- [ ] Parent sees only parent tabs: Home, Child, Billing, Attend, More.
- [ ] Parent does not see Staff tab.
- [ ] Parent More screen includes secondary parent features.
- [ ] Parent cannot access staff actions.
- [ ] Staff login works: `teacher@littlelantern.test / Password123!`.
- [ ] Staff sees only staff tabs: Home, Kids, Attend, Notes, More.
- [ ] Staff does not see parent Billing tab.
- [ ] Staff can access children, attendance, notes, incidents, messages, alerts through staff navigation.
- [ ] Staff cannot access parent-only/platform data.
- [ ] Bottom tab icons are real icons, not placeholders.
- [ ] Bottom tab labels are not cut.
- [ ] Content does not overlap iPhone status bar or home indicator.

## Demo Placeholders To Disclose

- OTP verification is a placeholder. SMS/email provider delivery is not connected.
- Stripe payments are placeholders. Real payment processing is not connected.
- Receipt PDF download is a placeholder.
- Document upload/download stores demo metadata only. Real file storage is not connected.
- Staff PIN quick access is a placeholder.
- QR scanning is a placeholder.
- Digital signature capture is a placeholder.
- DCYF/subsidy exports are placeholders.
- Password reset/account reset is a placeholder. No SMS/email delivery is connected.
- Monitoring provider checks for queue, scheduler, Stripe, SMS, and email are placeholders.
- Real-time WebSocket updates are not required for this demo.
