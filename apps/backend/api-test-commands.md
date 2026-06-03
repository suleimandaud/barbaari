# Barbaari API Test Commands

Base URL:

```sh
BASE_URL=http://127.0.0.1:8000/api
```

Replace `TOKEN_HERE` with the token returned by login. Replace IDs like `CHILD_ID`, `ATTENDANCE_ID`, `INVOICE_ID`, and `NOTIFICATION_ID` with values from your local API responses.

## Login

```sh
curl -s -X POST "$BASE_URL/auth/login" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@littlelantern.test","password":"Password123!"}'
```

## Current User

```sh
curl -s "$BASE_URL/auth/me" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer TOKEN_HERE"
```

## List Children

```sh
curl -s "$BASE_URL/children" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer TOKEN_HERE"
```

## Create Child

```sh
curl -s -X POST "$BASE_URL/children" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_HERE" \
  -d '{"first_name":"API","last_name":"Child","date_of_birth":"2022-01-15","classroom_id":1,"allergies":["none"]}'
```

## Check In Child

```sh
curl -s -X POST "$BASE_URL/attendance/check-in" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_HERE" \
  -d '{"child_id":CHILD_ID,"signer_type":"staff","verification_method":"secure_login","device_id":1}'
```

## Check Out Child

```sh
curl -s -X POST "$BASE_URL/attendance/check-out" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_HERE" \
  -d '{"child_id":CHILD_ID,"signer_type":"staff","verification_method":"secure_login","device_id":1}'
```

## Attendance History

```sh
curl -s "$BASE_URL/attendance/history?child_id=CHILD_ID&classroom_id=CLASSROOM_ID&date=2026-05-13" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer TOKEN_HERE"
```

## Attendance Correction

```sh
curl -s -X POST "$BASE_URL/attendance/ATTENDANCE_ID/correct" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_HERE" \
  -d '{"reason":"Correct checkout time after parent signature review","check_out_time":"2026-05-13 06:00:00"}'
```

## Attendance Audit Logs

```sh
curl -s "$BASE_URL/attendance/audit-logs" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer TOKEN_HERE"
```

## Create Invoice

```sh
curl -s -X POST "$BASE_URL/billing/invoices" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_HERE" \
  -d '{"child_id":CHILD_ID,"guardian_id":GUARDIAN_ID,"amount":250.00,"due_date":"2026-05-20"}'
```

## Record Payment

```sh
curl -s -X POST "$BASE_URL/billing/invoices/INVOICE_ID/payments" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_HERE" \
  -d '{"amount":250.00,"method":"cash"}'
```

## Create Incident Report

```sh
curl -s -X POST "$BASE_URL/incidents" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_HERE" \
  -d '{"child_id":CHILD_ID,"severity":"low","summary":"Minor incident recorded during API test."}'
```

## List Notifications

```sh
curl -s "$BASE_URL/notifications" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer TOKEN_HERE"
```

## Mark Notification Read

```sh
curl -s -X POST "$BASE_URL/notifications/NOTIFICATION_ID/read" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer TOKEN_HERE"
```

## Super Admin Dashboard Stats

Use a super admin token from `super@barbaari.test`.

```sh
curl -s "$BASE_URL/platform/dashboard" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer TOKEN_HERE"
```
