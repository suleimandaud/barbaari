# Barbaari Remaining Project Gaps

Generated: 2026-05-16  
Project path: `/Users/pioneer/barbaari`  
Reference report: `FULL_SYSTEM_TEST_REPORT.md`

## 1. Executive Summary

Barbaari is **demo-ready with preparation**, but it is **not production-ready**.

The current system has a real Laravel API, MySQL persistence, Sanctum auth, role-based API protection, refactored daycare/super-admin web apps, and a role-aware mobile app. The last full system test confirmed that core API workflows pass: login, child creation, child code generation, guardian linking, attendance check-in/check-out/correction, invoices/payments, incidents, daily notes, notifications, pricing plans, support tickets, settings, alerts, and audit logs.

The largest remaining gaps are not “screen exists” gaps. They are **compliance depth, production integrations, operational hardening, and UI workflow maturity**.

Biggest remaining gaps:
- DCYF/WCCC-grade attendance compliance is incomplete: no real guardian signature flow, real PIN/QR verification, digital signatures, absence tracking, subsidy reporting, record retention policy, or anti-fraud review workflow.
- Payments are not production payments: Stripe is a placeholder, receipts are placeholder JSON, subscriptions are local status fields.
- Documents are metadata-only: upload stores `placeholder://...`, no real file storage, virus scanning, access-controlled download, or retention.
- Messaging/notifications are database-only: no real email/SMS/push delivery, no WebSocket/live updates, no delivery/read receipts beyond simple `read_at`.
- Mobile staff PIN and OTP are UI/API placeholders.
- Super admin organization actions are still rough in places, for example `OrganizationsPage` uses “Approve first/Suspend first/Reactivate first” instead of row-level action controls.
- Test coverage is not production-grade: no browser E2E, mobile E2E, backend feature-test suite for compliance/security, or CI pipeline evidence.
- Deployment and operations are missing: backups, error monitoring, queue/scheduler supervision, environment separation, secret management, HTTPS/domain setup, and runbooks.

Biggest risks:
- A client may mistake placeholders for working compliance/payment features.
- Attendance records could be challenged in an audit because signer verification, absence tracking, retention, and export workflows are incomplete.
- File/document handling is not safe for real child records.
- Browser/mobile UI was not fully click-tested in the last pass because no Playwright/Cypress/mobile E2E tooling exists.

## 2. Completed Features

Working or substantially implemented:
- Laravel backend in `apps/backend`.
- MySQL database `barbaari_db`.
- Laravel Sanctum token authentication.
- Roles and role middleware in `apps/backend/app/Http/Middleware/EnsureRole.php`.
- Main domain tables: users, roles, organizations, classrooms, devices, children, guardians, attendance, invoices, payments, receipts, messages, notifications, incidents, notes, documents, support tickets, audit logs, platform settings, system alerts.
- Unique per-organization child code via `2026_05_13_120000_add_child_code_to_children_table.php`.
- Daycare API workflows for children, guardians, classrooms, attendance, billing, incidents, notes, messages, notifications, documents, devices, reports.
- Super admin API workflows for organizations, pricing plans, subscriptions, users, support tickets, settings, alerts, monitoring, audit logs.
- Mobile role separation for parent vs staff/teacher.
- Parent/staff API permission checks passed in the last test.
- Daycare web pages are split into proper page/component structure.
- Super admin pages are split into proper page/component structure.
- Mobile bottom navigation is role-based and limited to five visible tabs.
- TypeScript checks pass for daycare web, super admin, and mobile.
- Daycare web and super admin builds pass.
- Expo iOS bundling passes.

## 3. Remaining Features by Priority

### P0 - Must Fix Before Any Serious Demo

#### 1. Reset demo tenant status and demo data
- Requirement: Demo should show a healthy active daycare tenant.
- Current status: Full test report found Little Lantern Daycare returned as `suspended`.
- Missing: Clean demo state/reset script and active organization status.
- Why it matters: A suspended tenant undermines the demo and can confuse login/app behavior.
- Priority: P0
- Suggested implementation: Add a `php artisan barbaari:demo-reset` command or seeder mode that restores demo accounts, organization status, representative records, and clears E2E clutter.
- Backend files/modules likely affected: `apps/backend/database/seeders/DatabaseSeeder.php`, new Artisan command, `Organization` model.
- Frontend/mobile files likely affected: none, except demo docs.
- Estimated complexity: low

#### 2. Manual visual QA and browser click testing
- Requirement: Apps must be visually correct and usable, not just buildable.
- Current status: Typecheck/build/API tests pass, but no browser automation is installed and last test could not inspect browser console or click every page.
- Missing: Playwright/Cypress smoke tests and manual visual QA pass.
- Why it matters: A blank page, console error, modal overflow, or hidden button can still exist despite passing API tests.
- Priority: P0
- Suggested implementation: Add Playwright tests for daycare and super admin login/navigation/core forms; add a simple screenshot baseline for mobile via Expo/E2E tooling.
- Backend files/modules likely affected: none directly.
- Frontend/mobile files likely affected: `apps/daycare-web`, `apps/super-admin`, `apps/mobile`, new test folders.
- Estimated complexity: medium

#### 3. Replace obvious demo placeholders in visible user actions or label them clearly
- Requirement: Demo users should know which actions are real and which are placeholders.
- Current status: OTP, receipts, Stripe, document download, PIN quick access, exports, and provider health are placeholders.
- Missing: UI labeling/disabling where actions do not perform real work.
- Why it matters: Pressing “Pay with Stripe” or “Download receipt” should not silently return placeholder behavior in a serious demo.
- Priority: P0
- Suggested implementation: Add clear badges/tooltips like “Demo placeholder”; disable payment/download actions or show explanatory modal.
- Backend files/modules likely affected: `ApiController.php`.
- Frontend/mobile files likely affected: `apps/mobile/app/(tabs)/billing.tsx`, `apps/mobile/app/login.tsx`, `apps/daycare-web/src/pages/DocumentsPage.tsx`, `apps/daycare-web/src/pages/ReportsPage.tsx`, `apps/super-admin/src/pages/SubscriptionsPage.tsx`, `apps/super-admin/src/pages/SettingsPage.tsx`.
- Estimated complexity: low

#### 4. Fix super admin organization row actions
- Requirement: Super admin can approve/suspend/reactivate specific organizations.
- Current status: `OrganizationsPage.tsx` uses “Approve first”, “Suspend first”, and “Reactivate first”.
- Missing: Row-level actions and organization detail actions.
- Why it matters: Operating on the “first” organization is unsafe and unprofessional.
- Priority: P0
- Suggested implementation: Add Actions column with Approve/Suspend/Reactivate buttons per row and confirmation modal.
- Backend files/modules likely affected: existing `ApiController@updateOrganizationStatus`.
- Frontend/mobile files likely affected: `apps/super-admin/src/pages/OrganizationsPage.tsx`, maybe `OrganizationDetailsPage.tsx`.
- Estimated complexity: low

### P1 - Must Fix Before Client Pilot

#### 5. Real guardian/parent attendance signing flow
- Requirement: Attendance should support guardian/authorized pickup identity and signing.
- Current status: API accepts `signer_type`, `verification_method`, and stores signer name from the logged-in user; staff can check children in/out.
- Missing: Guardian-facing check-in/out, authorized pickup verification, signature capture, pickup authorization selection, and kiosk/tablet UX.
- Why it matters: Attendance compliance depends on who signed and how identity was verified.
- Priority: P1
- Suggested implementation: Add kiosk mode endpoints/screens: select child, select guardian/authorized pickup, verify PIN/QR/login, capture signature, store signature artifact/hash and signer relationship.
- Backend files/modules likely affected: attendance migrations/models, `ApiController@checkIn/checkOut`, `Guardian`, `PickupAuthorization`, `Device`, new signature table/storage.
- Frontend/mobile files likely affected: mobile kiosk/staff screens, daycare attendance page, shared API.
- Estimated complexity: high

#### 6. Real PIN verification and staff PIN login
- Requirement: PIN verification must validate an actual stored credential.
- Current status: `users.pin` exists in seed data and mobile shows PIN input, but staff login still uses password and attendance just accepts `verification_method = pin`.
- Missing: PIN hashing, validation endpoint, lockout/rate limiting, audit on failed attempts.
- Why it matters: “PIN verified” is not meaningful unless the PIN was checked.
- Priority: P1
- Suggested implementation: Store hashed PINs, add `/auth/pin-login` or `/attendance/verify-pin`, enforce verification token for attendance operations, log failures.
- Backend files/modules likely affected: `users` migration/model, `AuthController`, `ApiController`, audit logs.
- Frontend/mobile files likely affected: `apps/mobile/app/login.tsx`, `apps/mobile/app/(tabs)/staff.tsx`, shared `authApi`.
- Estimated complexity: medium

#### 7. Absence tracking
- Requirement: Track absent/excused/unexcused days and reasons.
- Current status: `AttendanceStatus` type includes `absent`, but no first-class absence table or UI workflow exists.
- Missing: Absence records, reason categories, parent/staff reporting, dashboard counts, exports.
- Why it matters: Attendance compliance and subsidy workflows need absence records, not just missing check-ins.
- Priority: P1
- Suggested implementation: Add `absence_records` table with child/date/reason/status/entered_by; add API and daycare/mobile views.
- Backend files/modules likely affected: new migration/model/controller methods/routes/reports.
- Frontend/mobile files likely affected: `AttendancePage.tsx`, reports, mobile attendance.
- Estimated complexity: medium

#### 8. Production document storage
- Requirement: Securely upload, store, list, and download child documents.
- Current status: `uploadDocument` stores `placeholder://title`; download returns placeholder.
- Missing: file upload multipart support, private storage disk/S3, download authorization, file metadata, virus scanning, file size/type validation.
- Why it matters: Child documents are sensitive records.
- Priority: P1
- Suggested implementation: Use Laravel Storage private disk/S3, signed download routes, document file validation, delete lifecycle.
- Backend files/modules likely affected: `Document` model, documents migration, `ApiController@uploadDocument/downloadDocument`, filesystems config.
- Frontend/mobile files likely affected: `DocumentsPage.tsx`, mobile child/documents screen, shared `documentsApi`.
- Estimated complexity: medium

#### 9. Real messaging and notification delivery
- Requirement: Parents/staff need real communication.
- Current status: Messages and notifications persist to DB; delivery is not real-time and no email/SMS/push exists.
- Missing: recipients/participants, push notifications, SMS/email integration, WebSocket/live updates, delivery/read states.
- Why it matters: Daycare communication needs reliability.
- Priority: P1
- Suggested implementation: Add conversation participants, notification delivery jobs, Expo push, SMS/email providers, Laravel queues, Socket.IO/Pusher/Reverb.
- Backend files/modules likely affected: conversations/messages/notifications migrations, jobs, queue config, `ApiController`.
- Frontend/mobile files likely affected: daycare messages/notifications, mobile messages/notifications, shared API.
- Estimated complexity: high

#### 10. Real incident notification workflow
- Requirement: Notify parent when an incident is sent.
- Current status: `notifyParent()` returns “Parent notification placeholder queued.”
- Missing: parent recipient resolution, notification/message creation, push/email/SMS delivery, audit.
- Why it matters: Incidents are time-sensitive and safety-related.
- Priority: P1
- Suggested implementation: On incident sent, create targeted notification(s), optionally send push/email/SMS, log delivery.
- Backend files/modules likely affected: `IncidentReport`, `Notification`, jobs, `ApiController@notifyParent/createIncident`.
- Frontend/mobile files likely affected: `IncidentsPage.tsx`, mobile messages/notifications.
- Estimated complexity: medium

#### 11. Role and tenant hardening
- Requirement: Strict authorization by role, tenant, classroom, guardian relationship, and subscription status.
- Current status: Main tested role boundaries passed, but many methods are consolidated in one large controller and some checks are shallow.
- Missing: policies, form requests, granular permissions, organization status enforcement, subscription limits, staff classroom edge cases.
- Why it matters: Multi-tenant SaaS security is the highest-risk production area.
- Priority: P1
- Suggested implementation: Add Laravel policies, dedicated controllers/form requests, subscription/organization-status middleware, automated authorization tests.
- Backend files/modules likely affected: `ApiController.php`, `EnsureRole.php`, new policies, routes.
- Frontend/mobile files likely affected: error handling across all apps.
- Estimated complexity: high

### P2 - Needed Before Production

#### 12. Real Stripe payments and subscriptions
- Requirement: Stripe payments, customer/subscription management, webhooks, invoices, receipts.
- Current status: `stripePlaceholder()` returns placeholder; subscription records have `stripe_subscription_id` but no real integration.
- Missing: Checkout/payment intents, saved payment methods, webhook handling, receipt generation, refund/failure handling, subscription sync.
- Why it matters: Production SaaS billing depends on this.
- Priority: P2
- Suggested implementation: Add Laravel Cashier or Stripe SDK; webhook controller; payment status lifecycle; receipts; super admin Stripe logs.
- Backend files/modules likely affected: billing migrations/models/controllers/routes, `stripe_payment_logs`, config/env.
- Frontend/mobile files likely affected: daycare billing/payments, mobile billing, super admin subscriptions/settings.
- Estimated complexity: high

#### 13. Receipt generation
- Requirement: Downloadable receipts.
- Current status: `receipts` table exists; download endpoint returns placeholder.
- Missing: PDF generation, receipt URL/storage, authenticated download, branding, tax/payment metadata.
- Why it matters: Parents and daycare admins expect payment proof.
- Priority: P2
- Suggested implementation: Generate PDF receipts on payment using Laravel PDF library and private storage.
- Backend files/modules likely affected: `Payment`, `Receipt`, billing controller/routes/storage.
- Frontend/mobile files likely affected: `BillingPage.tsx`, `PaymentsPage.tsx`, mobile billing.
- Estimated complexity: medium

#### 14. DCYF/WCCC export and subsidy reporting
- Requirement: Compliance exports and subsidy reporting.
- Current status: `dcyfExport()` and attendance export return placeholders/basic JSON.
- Missing: report formats, subsidy fields, absence inclusion, correction audit export, retention.
- Why it matters: This is a core compliance differentiator.
- Priority: P2
- Suggested implementation: Define jurisdiction-specific export schema; add report generation jobs; CSV/PDF downloads; date range filters; immutable audit bundles.
- Backend files/modules likely affected: reports routes/controller, attendance/absence tables, storage.
- Frontend/mobile files likely affected: `ReportsPage.tsx`, attendance audit pages.
- Estimated complexity: high

#### 15. Record retention and immutable audit policy
- Requirement: Attendance and child records need retention rules and audit integrity.
- Current status: audit tables exist; no retention policy, immutability controls, archival, or tamper-evidence.
- Missing: retention settings, soft deletion/archive, audit log immutability, exportable record bundles.
- Why it matters: Auditors may require records to be retained and traceable.
- Priority: P2
- Suggested implementation: Add retention settings per organization/platform; soft deletes where appropriate; append-only audit log; admin export.
- Backend files/modules likely affected: migrations/models, `AuditLog`, `AttendanceAuditLog`, delete/archive endpoints.
- Frontend/mobile files likely affected: settings, reports, audit logs.
- Estimated complexity: medium

#### 16. Backups and disaster recovery
- Requirement: Production data must be backed up and restorable.
- Current status: no backup scripts/config visible.
- Missing: MySQL backups, file backups, restore process, retention, test restore.
- Why it matters: Childcare records cannot be lost.
- Priority: P2
- Suggested implementation: Add backup package/scripts, scheduled jobs, encrypted storage, documented restore runbook.
- Backend files/modules likely affected: Laravel scheduler, deployment config, ops scripts.
- Frontend/mobile files likely affected: none.
- Estimated complexity: medium

#### 17. Error monitoring and provider monitoring
- Requirement: Operational visibility for API, DB, queues, scheduler, Stripe, SMS, email.
- Current status: monitoring page reports API/database and placeholders for the rest.
- Missing: real checks, alert thresholds, external error tracking.
- Why it matters: SaaS operations need proactive incident detection.
- Priority: P2
- Suggested implementation: Add Sentry/Bugsnag, Laravel health checks, queue/scheduler heartbeat, provider API checks.
- Backend files/modules likely affected: `monitoringHealth`, jobs, scheduler, platform settings.
- Frontend/mobile files likely affected: `MonitoringPage.tsx`, `SystemAlertsPage.tsx`.
- Estimated complexity: medium

#### 18. Automated tests and CI
- Requirement: Repeatable verification before releases.
- Current status: typecheck/build pass; no Playwright/Cypress/mobile E2E found; backend feature tests were not evidenced.
- Missing: backend PHPUnit feature tests, frontend E2E, mobile E2E, CI pipeline.
- Why it matters: Current system can regress silently.
- Priority: P2
- Suggested implementation: Add PHPUnit API tests for roles/compliance; Playwright web tests; Expo/mobile E2E smoke; GitHub Actions.
- Backend files/modules likely affected: `apps/backend/tests`.
- Frontend/mobile files likely affected: app test folders and scripts.
- Estimated complexity: high

#### 19. Deployment readiness
- Requirement: Production deployment pipeline and environment separation.
- Current status: local XAMPP-oriented setup.
- Missing: production env config, Docker or hosting recipe, queues, scheduler, HTTPS, CORS domains, secrets, migrations/deploy scripts.
- Why it matters: Local demo stack is not a SaaS deployment.
- Priority: P2
- Suggested implementation: Add Docker Compose or cloud deployment docs; configure queue workers/scheduler; env templates; production CORS; CI/CD.
- Backend files/modules likely affected: `.env.example`, config files, deployment manifests.
- Frontend/mobile files likely affected: environment URLs, build configs.
- Estimated complexity: high

### P3 - Nice to Have Later

#### 20. Advanced analytics
- Requirement: Rich global/daycare analytics.
- Current status: simple dashboard metrics and analytics tables.
- Missing: charts, trend comparisons, cohort retention, occupancy forecasting, revenue churn, attendance anomaly views.
- Why it matters: Useful for growth, not required for first pilot.
- Priority: P3
- Suggested implementation: Add analytics endpoints and Recharts dashboards.
- Backend files/modules likely affected: reports/platform dashboard methods.
- Frontend/mobile files likely affected: `AnalyticsPage.tsx`, daycare dashboard/reports.
- Estimated complexity: medium

#### 21. Polished onboarding
- Requirement: Organization onboarding flow.
- Current status: create organization exists; no full onboarding workflow.
- Missing: owner creation, plan selection, license upload, staff/classroom setup wizard, trial/subscription initiation.
- Why it matters: Improves sales/demo and self-serve SaaS.
- Priority: P3
- Suggested implementation: Add onboarding wizard and backend transaction.
- Backend files/modules likely affected: organization/user/subscription controllers.
- Frontend/mobile files likely affected: super admin org pages, maybe public onboarding app.
- Estimated complexity: high

## 4. DCYF Compliance Gap Analysis

| Requirement | Current status | Missing | Priority | Notes |
|---|---|---|---|---|
| Parent/guardian signature | Partially working | No signature capture or signature artifact storage | P1 | Attendance stores signer name/type, but not a real signature. |
| Parent/guardian check-in/out | Partially working | Parent/guardian/kiosk flow for authorized pickup | P1 | Staff/admin can check in/out; parents are blocked from staff APIs. |
| Exact time in/out | Working | Timezone policy and audit display polish | P1 | `check_in_time` and `check_out_time` are timestamps. |
| Identity of signer | Partially working | Guardian/authorized pickup identity selection and verification | P1 | Currently signer name is logged-in user name. |
| PIN verification | Placeholder/partial | Real PIN validation, hashing, lockout | P1 | API accepts `verification_method=pin` without proving verification. |
| QR verification | Placeholder/partial | QR token generation/scanning/expiry/device binding | P1 | API accepts `qr`; no scanner flow or token model. |
| Digital signature | Placeholder/partial | Signature capture, storage, hash, audit display | P1 | API accepts method string only. |
| No future attendance | Mostly working | Explicit tests and UI validation for all future-dated paths | P1 | Corrections validate `before_or_equal:now`; check-in uses `now()`. |
| Audit history | Working basic | Better actor names and original/corrected display in UI | P1 | Audit logs exist; UI shows edited user ID in attendance modal. |
| Correction reason | Working | Stronger reason categories and policy controls | P1 | Required for correction endpoint. |
| Original vs corrected values | Working backend | UI needs clearer original/corrected comparison | P1 | Stored in audit/corrections tables. |
| Absence tracking | Missing | Absence table, reasons, reports | P1 | No absence records. |
| WCCC/subsidy support | Missing | Subsidy fields, eligibility, billing/report exports | P2 | No WCCC-specific model or report. |
| Export/report retention | Placeholder | Real CSV/PDF export, immutable bundles, retention settings | P2 | Export endpoints return placeholders/basic data. |
| Anti-fraud controls | Missing | Duplicate/timing anomaly detection, device trust, failed PIN logs | P2 | No anomaly/approval workflow. |
| Record retention | Missing | Retention policy, archive, legal hold | P2 | No retention settings or jobs. |
| Kiosk/tablet mode | Partial | Dedicated kiosk UI, device enrollment, lock-down flow | P1 | Devices table exists; no real kiosk mode. |

## 5. Daycare Web Gap Analysis

| Module | Working | Partially working | Missing | Recommended next fix |
|---|---|---|---|---|
| Dashboard | Real API metrics load | Metrics are basic | More compliance/revenue/attendance drilldowns | Add detailed widgets and links to filtered pages. |
| Organization | Profile get/update works | Settings/status visible only lightly | License docs, timezone/policy settings | Expand organization settings form and persist `organization_settings`. |
| Users & Staff | Staff list works | Staff page is read-only table | Create/edit staff, assign classroom, block/unblock, reset invite | Build full staff/user management UI using existing user APIs. |
| Children | Create/edit/assign/link works | Archive is status update | Rich profile, emergency contacts, documents, pickup authorizations | Add child detail page and emergency/pickup management. |
| Guardians | Create/link/list works | Pickup permission is simple | Edit guardian, revoke pickup, emergency contacts | Add row actions and pickup authorization workflow. |
| Attendance | Check-in/out/correct/audit works | Verification methods are accepted, not verified | Absences, signatures, kiosk, anti-fraud, audit UI details | Build compliance-grade attendance workflow. |
| Classrooms | List/create/update/delete API exists | UI coverage likely basic | Staff assignment polish, occupancy warnings | Add full classroom management row actions. |
| Billing | Create invoice works | Payments separated; Stripe missing | Line items, discounts, subsidies, payment plans | Add invoice items and payment lifecycle. |
| Reports | Basic incidents/report export button | Export placeholder | DCYF/WCCC exports, date filters, PDFs | Replace placeholder exports with generated files. |
| Incidents | Create/list works | Parent notify placeholder | Attachments, parent signature/ack, severity critical option | Implement notification and acknowledgment workflow. |
| Documents | Metadata creation works | Upload/download placeholder | Real file upload/download/security | Implement Laravel Storage private files. |
| Audit Logs | Attendance/platform logs exist | Attendance modal shows user ID | Human actor names, filters, export | Improve payload/UI for audit readability. |
| Devices | Device model/list/register API exists | Kiosk device workflow missing | Enrollment code, disable/assign UI, health status | Add device management and kiosk pairing. |
| Payments | List/payment recording works | Cash/manual only | Stripe, refunds, receipts | Implement Stripe and receipt downloads. |
| Daily Notes | Create/list works | Simple text notes only | Templates, categories, parent acknowledgment | Add note templates and media/visibility controls. |
| Messages | DB messages work | No real-time/delivery UX | Participants, push/email/SMS, read receipts | Add conversation participants and live delivery. |
| Notifications | DB notifications work | Delivery is local/API only | Push/SMS/email, targeting, templates | Add notification delivery jobs/providers. |
| Settings | Basic organization settings | Platform/daycare policy settings thin | Attendance, billing, notification policies | Persist richer `organization_settings` sections. |

## 6. Super Admin Gap Analysis

| Module | Working | Partially working | Missing | Recommended next fix |
|---|---|---|---|---|
| Platform dashboard | Metrics and alerts load | Metrics are basic | Churn, MRR trend, trial conversion, health summary | Add platform analytics endpoints. |
| Organizations | List/create/status API works | UI actions operate on first org | Row-level approve/suspend/reactivate, onboarding workflow | Fix `OrganizationsPage.tsx` actions first. |
| Subscriptions | List/status/change plan works | Stripe logs placeholder | Real Stripe sync, invoices, payment failures | Integrate Stripe subscriptions/webhooks. |
| Pricing Plans | Create/edit/activate/deactivate works | Feature entry is comma text | Feature catalog, plan usage enforcement | Add structured features and subscription limit checks. |
| Analytics | Basic org table | Not real analytics dashboard | Global trends, revenue, attendance activity | Build real analytics page. |
| Global Users | Filter/block/unblock/reset/role works | Reset is placeholder | Impersonation controls, invites, MFA, audit filters | Implement real password reset/invite flow. |
| Support | Ticket lifecycle works | Basic comments | Email piping, SLA, attachments, internal notes | Add support workflows after pilot. |
| Security | Audit logs load | Basic audit center | Filtering, anomaly alerts, MFA/session controls | Add filters, exports, security events. |
| Settings | Structured settings save | Provider keys placeholders | Secret storage, validation, test-send buttons | Store secrets securely and validate providers. |
| System Alerts | Create/resolve/reopen works | Alerts are manual | Auto-alert creation from monitoring/errors | Connect monitoring and error tracking. |
| Monitoring | API/database real; others placeholders | Queue/scheduler/providers fake | Real provider checks and heartbeats | Implement health checks and scheduler/queue telemetry. |
| Onboarding | Create organization exists | No true onboarding | Admin user creation, plan/trial setup, license docs | Build onboarding wizard/transaction. |

## 7. Mobile Gap Analysis

### Parent Mobile

Working:
- Parent/staff role selector.
- Parent login/register path.
- SecureStore token storage.
- Session restore via `/auth/me`.
- Parent-only route area.
- Child profile.
- Attendance status/history.
- Invoices/payments list.
- Documents list.
- Incidents/daily notes/messages/notifications.
- Mark notification read.
- Emergency call button.
- Logout.
- Parent cannot access staff APIs in tested cases.

Missing:
- Real OTP.
- Real payment/Stripe checkout.
- Real receipt download.
- Real document download.
- Push notifications.
- Real-time message updates.
- Parent acknowledgment/signature for incidents or attendance.
- Rich child profile detail: emergency contacts, pickup authorizations, documents by type.

UX issues:
- Billing button says “Pay with Stripe” but backend is placeholder.
- Receipt button calls placeholder endpoint.
- Messages screen currently sends a hardcoded body (`Parent message from mobile app`) instead of the typed TextInput value.
- Some secondary parent features are grouped under More but still rely on broad combined screens.

Security issues:
- Tested parent API restrictions passed.
- Needs additional automated tests for deep links, expired tokens, organization suspended state, document access, and message participant scoping.

### Staff Mobile

Working:
- Staff/teacher login.
- Staff-only route area.
- Assigned classroom children list.
- Child check-in/check-out.
- Staff check-in/check-out API calls.
- Create incident.
- Add daily note.
- Notifications/messages screens.
- Staff cannot access parent invoices or platform APIs in tested cases.

Missing:
- Real PIN quick access.
- QR scanner flow.
- Kiosk mode.
- Digital signature capture.
- Authorized pickup/guardian verification.
- Incident report form with details/action/severity beyond draft summary.
- Daily note templates/categories.
- Staff announcements to parents as real notifications.

UX issues:
- Staff screen title is hardcoded “Blue Room attendance” even if assigned to another room.
- Staff note/incident share one draft field per child.
- Staff PIN input is not connected to a verification action.

Security issues:
- Tested staff API restrictions passed.
- Needs automated tests for classroom boundary edge cases, staff without classroom, suspended org, blocked user, and device-scoped kiosk actions.

## 8. Placeholder List

Known remaining placeholders:
- OTP verification: `AuthController@otp`.
- Stripe payment endpoint: `ApiController@stripePlaceholder`.
- Stripe settings fields: `SettingsPage.tsx`.
- Stripe logs placeholder: `SubscriptionsPage.tsx`.
- Receipt download: `ApiController@receiptDownload`, mobile billing button.
- Document upload path: `placeholder://...` in `uploadDocument`.
- Document download: `ApiController@downloadDocument`.
- Staff PIN quick access: `apps/mobile/app/(tabs)/staff.tsx`.
- QR scanning/QR verification: accepted as string, no real flow.
- Digital signature: accepted as string, no signature capture/storage.
- Attendance CSV/PDF export: `attendanceExport`.
- DCYF export: `dcyfExport`.
- Parent incident notification: `notifyParent`.
- Announcement sending: `announcement`.
- Real-time WebSocket updates: Socket dependencies exist, but no implemented live messaging/attendance update flow observed.
- SMS/email sending: settings exist, no provider delivery jobs.
- Password/account reset: `resetPlatformUser` placeholder.
- Monitoring providers: queue, scheduler, Stripe, SMS, email placeholders.
- Backups: no backup implementation found.

## 9. Recommended Build Roadmap

### Phase 1: Demo Polish

Tasks:
- Reset/reseed demo organization as active.
- Stop duplicate dev servers and document standard demo startup ports.
- Label or disable placeholder actions visibly.
- Fix super admin organization row actions.
- Add Playwright smoke tests for login and navigation.
- Manual browser/iPhone visual QA pass.

Why:
- This removes demo confusion and catches UI/runtime issues that API tests cannot see.

Expected result:
- Strong, controlled demo with honest placeholder disclosure.

### Phase 2: Client Pilot

Tasks:
- Implement real staff/user management UI.
- Implement real document storage/download.
- Implement real incident parent notifications.
- Implement absence tracking.
- Implement guardian/authorized pickup attendance signing flow.
- Implement real PIN verification.
- Add backend feature tests for role/tenant security.

Why:
- A pilot needs safe daily operations, not just demo flows.

Expected result:
- A daycare can use Barbaari for limited real operations with controlled scope.

### Phase 3: Compliance and Payments

Tasks:
- Implement Stripe payments/subscriptions/webhooks.
- Generate PDF receipts.
- Build DCYF/WCCC attendance/subsidy export.
- Add record retention policy and immutable audit controls.
- Add anti-fraud/anomaly detection for attendance.
- Add kiosk/tablet mode with device trust and QR/PIN/signature verification.

Why:
- These are the features that make the product credible for regulated childcare and paid SaaS.

Expected result:
- Compliance-grade attendance and production-grade payments.

### Phase 4: Production Launch

Tasks:
- Add deployment pipeline, production env templates, HTTPS/CORS configuration, queue workers, scheduler.
- Add backups and tested restore.
- Add error monitoring.
- Add provider health checks.
- Add secret management for SMS/email/Stripe.
- Add CI for backend/frontend/mobile tests.

Why:
- Production SaaS needs operational reliability and secure infrastructure.

Expected result:
- Barbaari can run as a real hosted SaaS system.

### Phase 5: Scale and Monitoring

Tasks:
- Advanced analytics and dashboards.
- Support SLA tooling.
- Organization onboarding wizard.
- Usage limits by pricing plan.
- Performance tuning, query indexes, caching.
- Multi-region/storage lifecycle planning if needed.

Why:
- These improve scaling, sales, and operations after first production release.

Expected result:
- Barbaari is easier to sell, operate, and scale.

## 10. Final Recommendation

What to fix next:
1. Reactivate/reset the demo tenant and clean demo data.
2. Add visible placeholder labels/disabling for Stripe, receipts, documents, OTP, PIN, and exports.
3. Fix super admin organization actions to operate per row.
4. Add Playwright smoke tests and do a manual browser/mobile QA pass.
5. Start the client-pilot work with document storage, incident notifications, absence tracking, and real PIN verification.

What not to waste time on now:
- Advanced analytics polish before compliance basics.
- Complex public onboarding before the core pilot workflow is safe.
- UI redesigns. The current design is good enough; functional/compliance gaps matter more.
- Scaling optimizations before deployment, backups, and tests exist.

Fastest path to a strong demo:
- Clean the demo data and org status.
- Label placeholders clearly.
- Demo API-backed flows only: child/guardian/classroom, attendance correction/audit, invoice/payment record, incident/note/notification, super admin pricing/users/tickets/settings/alerts, mobile parent/staff separation.
- Avoid claiming Stripe, OTP, document downloads, DCYF exports, or kiosk mode are complete.

Fastest path to a real client pilot:
- Implement real document storage.
- Implement real parent/staff notification delivery.
- Implement absence tracking.
- Implement guardian/authorized pickup check-in/out with PIN/signature.
- Add automated security tests for tenant/role boundaries.
- Add backup/restore and basic production deployment runbook.

