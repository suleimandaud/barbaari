# Barbaari Backend API Test Report

Test date: 2026-05-13  
Base URL: `http://127.0.0.1:8000/api`  
Database: `barbaari_db`  
Method: `php artisan route:list`, `curl` with Sanctum bearer tokens, Laravel log inspection.

## Test Accounts

All seeded accounts use password `Password123!`.

| Role | Email | Result |
| --- | --- | --- |
| Super admin | `super@barbaari.test` | Login passed, platform routes passed |
| Daycare admin | `admin@littlelantern.test` | Login passed, manager/admin routes passed |
| Teacher | `teacher@littlelantern.test` | Login passed, staff routes passed |
| Parent | `parent@littlelantern.test` | Login passed, mobile/parent routes passed |
| Registered test parent | `registered.<random>@example.test` | Register, me, logout passed |

## Fixes Applied

| Area | Error found | Fix applied | Final status |
| --- | --- | --- | --- |
| Manager dashboard | `attendanceTrend()` declared `array` but returned `Collection` | Converted trend collection with `->all()` | Passed |
| Platform support | Undefined `organization` relationship on `SupportTicket` | Removed invalid eager load | Passed |
| Platform audit logs | Undefined `organization` relationship on `AuditLog` | Removed invalid eager load | Passed |
| Attendance correction | Future correction timestamps were accepted by validation | Added `before_or_equal:now` to correction timestamps | Passed |
| Registered user roles | Registered users had role string but no pivot role | Synced named role during registration | Passed |
| Missing module routes | Several checklist operations had no REST route | Added scoped CRUD/placeholder routes for users, classrooms, daily notes, devices, reports, documents, conversations, notifications, incidents | Passed |
| Frontend connectivity | CORS allowed fixed ports only | Added localhost/127.0.0.1 dev-port origin pattern and Sanctum dev domains | Passed |

## Endpoint Results

| API | Endpoint | Method | Test data used | Result | Error found | Final status |
| --- | --- | --- | --- | --- | --- | --- |
| Auth login | `/auth/login` | POST | seeded admin/super/teacher/parent | Passed | None | 200 |
| Auth register | `/auth/register` | POST | `registered.<random>@example.test` | Passed | Role pivot missing before fix | 201 |
| Current user | `/auth/me` | GET | bearer token | Passed | None | 200 |
| Logout | `/auth/logout` | POST | bearer token | Passed | None | 200 |
| Role access | `/children` as parent | POST | parent token | Passed | None | 403 expected |
| Organization view | `/manager/organization` | GET | admin token | Passed | None | 200 |
| Organization update | `/manager/organization` | PUT | phone update | Passed | None | 200 |
| Platform organizations | `/platform/organizations` | GET | super token | Passed | None | 200 |
| Create organization | `/platform/organizations` | POST | API Test Org | Passed | None | 201 |
| Approve/suspend/reactivate org | `/platform/organizations/{id}/status` | POST | active, suspended, active | Passed | None | 200 |
| Users list | `/manager/users`, `/users` | GET | admin token | Passed | Manager route initially used global list | 200 |
| Create user | `/users` | POST | API Test Teacher | Passed | None | 201 |
| Update user | `/users/{id}` | PUT | phone update | Passed | None | 200 |
| Assign role | `/users/{id}/assign-role` | POST | staff role | Passed | None | 200 |
| Block user | `/users/{id}/status` | POST | blocked | Passed | None | 200 |
| Classrooms list/create/update/delete | `/classrooms` | GET/POST/PUT/DELETE | API Test Room | Passed | Routes missing before fix | 200/201 |
| Children list/create/view/update/delete | `/children` | GET/POST/GET/PUT/DELETE | API test child | Passed | Delete route missing before fix | 200/201 |
| Assign child classroom | `/children/{id}/assign-classroom` | POST | API Test Room | Passed | None | 200 |
| Guardians list/create/update | `/guardians` | GET/POST/PUT | Test Guardian | Passed | None | 200/201 |
| Link guardian to child | `/children/{id}/guardians` | POST | pickup authorized | Passed | None | 200 |
| Attendance check-in | `/attendance/check-in` | POST | child, signer, verification, device | Passed | None | 201 |
| Attendance check-out | `/attendance/check-out` | POST | child, signer, verification, device | Passed | None | 200 |
| Attendance realtime/history/filter | `/attendance`, `/attendance/history` | GET | date/classroom/child filters | Passed | None | 200 |
| Attendance correction | `/attendance/{id}/correct` | POST | valid past timestamp | Passed | Future timestamp rejected | 200 |
| Attendance audit logs | `/attendance/audit-logs` | GET | admin token | Passed | None | 200 |
| Staff profile | `/staff/profile` | GET | teacher token | Passed | Route missing before fix | 200 |
| Staff check-in/out | `/staff/check-in`, `/staff/check-out` | POST | teacher token | Passed | None | 201/200 |
| Staff classroom children | `/staff/classroom-children` | GET | teacher token | Passed | None | 200 |
| Staff activity | `/staff/activity` | GET | teacher/admin token | Passed | None | 200 |
| Invoices list/view/create | `/billing/invoices` | GET/GET/POST | test invoice | Passed | None | 200/201 |
| Record payment | `/billing/invoices/{id}/payments` | POST | cash payment | Passed | None | 200 |
| Payment history | `/billing/payments` | GET | admin token | Passed | None | 200 |
| Receipt placeholder | `/billing/receipts/{id}/download` | GET | receipt id | Passed | Placeholder only | 200 |
| Stripe placeholder | `/billing/stripe/placeholder` | POST | empty payload | Passed | Placeholder only | 200 |
| Incidents list/create/view/update | `/incidents` | GET/POST/GET/PUT | API test incident | Passed | Update route missing before fix | 200/201 |
| Parent notification placeholder | `/incidents/{id}/notify-parent` | POST | incident id | Passed | Placeholder only | 200 |
| Daily notes list/create/update | `/daily-notes` | GET/POST/PUT | API daily note | Passed | Routes missing before fix | 200/201 |
| Conversations list/create | `/conversations` | GET/POST | API Conversation | Passed | Create route missing before fix | 200/201 |
| Messages send/list | `/messages`, `/conversations/{id}/messages` | POST/GET | API message | Passed | Message-list route missing before fix | 201/200 |
| Announcements | `/announcements` | POST | API Test | Passed | Placeholder only | 200 |
| Notifications list/create/read | `/notifications` | GET/POST/POST | API notification | Passed | Create route missing before fix | 200/201 |
| Documents list/upload/download/delete | `/documents` | GET/POST/GET/DELETE | API Test Document | Passed | Delete route missing before fix | 200/201 |
| Devices list/register/assign/disable | `/devices` | GET/POST/POST/POST | API Test Kiosk | Passed | Routes missing before fix | 200/201 |
| Reports dashboard | `/reports/dashboard` | GET | admin token | Passed | Dashboard type bug before fix | 200 |
| Attendance report | `/reports/attendance` | GET | admin token | Passed | Route missing before fix | 200 |
| Revenue report | `/reports/revenue` | GET | admin token | Passed | Route missing before fix | 200 |
| Staff activity report | `/reports/staff-activity` | GET | admin token | Passed | Route missing before fix | 200 |
| Occupancy report | `/reports/occupancy` | GET | admin token | Passed | Route missing before fix | 200 |
| DCYF export placeholder | `/reports/dcyf-export` | GET | admin token | Passed | Placeholder only | 200 |
| Platform dashboard | `/platform/dashboard` | GET | super token | Passed | None | 200 |
| Platform subscriptions | `/platform/subscriptions` | GET | super token | Passed | None | 200 |
| Platform users | `/platform/users` | GET | super token | Passed | None | 200 |
| Support tickets | `/platform/support` | GET | super token | Passed | Undefined relationship before fix | 200 |
| Platform audit logs | `/platform/audit-logs` | GET | super token | Passed | Undefined relationship before fix | 200 |
| Platform settings | `/platform/settings` | GET/PUT | `api_test` setting | Passed | None | 200 |
| System alerts | `/platform/system-alerts` | GET | super token | Passed | Route missing before fix | 200 |
| Mobile children/attendance | `/mobile/children`, `/mobile/attendance` | GET | parent token | Passed | None | 200 |
| CORS preflight | `/children` | OPTIONS | local frontend origin | Passed | Needed broader dev pattern | 200 |

## Test Data Created

Created through APIs during testing:

- Test parent registration: `registered.<random>@example.test`
- API Test Teacher user, then assigned `staff` and blocked
- API Test Room classroom, then deleted after child cleanup
- API test child records, most deleted after test cleanup
- Test Guardian with pickup permission update
- API Test Kiosk device, then disabled
- Attendance check-in/check-out records and correction/audit rows
- API invoice, payment, receipt placeholder row
- API incident report and update
- API daily child note
- API conversation and message
- API notification
- API document placeholder, then deleted
- API Test Org platform organization with active/suspended/reactivated status
- `api_test` platform setting

## Remaining Warnings

- Receipt downloads, document downloads, Stripe payment handling, announcements, parent incident notifications, and DCYF export are intentionally placeholder JSON responses.
- This report covers local development API behavior on `barbaari_db`; it does not assert production payment/document integrations.
