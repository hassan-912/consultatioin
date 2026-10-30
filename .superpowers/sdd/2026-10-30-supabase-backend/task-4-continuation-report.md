# Task 4 continuation report

Status: DONE. Local implementation only; no cloud SQL, deployment or push.

## Implementation

- Added migration `0010_customer_staff_boundary.sql`; migrations 0001–0009 remain untouched.
- Private SECURITY DEFINER `assert_customer_access()` uses `current_staff_role()` to reject every active staff role with P0001 / FORBIDDEN. Its search_path is empty and EXECUTE is revoked from PUBLIC, anon, authenticated and service_role.
- Guard runs before lookup, locks, validation, rate counters or writes in find_booking, get_booking, submit_payment, cancel_booking and reschedule_booking. Also guarded reserve_slot because it returns manage_token, as explicitly agreed by controller.
- Converted get_booking from SQL to PL/pgSQL to invoke the guard. Moved cancel_booking's token lookup out of declaration initialization so it occurs after authorization. Original signatures, grants and customer behavior remain intact.
- Migration documents that future customer receipt/token endpoints must use this guard. Task 7 customer pages need a dedicated anonymous client; no app code was changed here.

## Verification and RED/GREEN evidence

Controller supplied an isolated PostgreSQL 17.11 harness with real roles, RLS, constraints and upstream pgTAP. It substitutes a minimal auth.users/auth.uid JWT shim and omits unavailable pg_cron scheduling. Every invocation retained its fresh local database; no cloud connections were used.

Regression RED was run against migrations through 0009 after authoring the test and migration, rather than claiming a chronological test-first run:

```powershell
$env:TEST_MAX_MIGRATION='9'
node .cache/test-db.mjs customer_staff_boundary.test.sql
```

Exit 1. TAP: 6 passed, 55 failed of 61. The runner prints 56 failures because it also counts pgTAP's failure-summary line. Representative output:

```text
not ok 1 - admin: find_booking valid input refused
have: 85f41c4016f7791756ff2c1a3527b2fe
want: ERR:P0001:FORBIDDEN
not ok 38 - consultant: get_booking valid input refused
not ok 49 - staff refusals create no bookings, payments, audit rows or rate counters
# Looks like you failed 55 tests of 61
```

This demonstrates the old token disclosure and customer mutation bypass; later RED failures cascade from those successful unauthorized mutations. Retained database: `verify_1793395946536`; full TAP: `.cache/db-results-verify_1793395946536.txt`.

Focused GREEN initially passed 61/61. After making the helper ACL test handle a missing function as a normal RED assertion instead of throwing, ran the complete suite:

```powershell
$env:TEST_MAX_MIGRATION='10'
node .cache/test-db.mjs
```

Exit 0:

```text
customer.test.sql: 59 passed, 0 failures
customer_staff_boundary.test.sql: 61 passed, 0 failures
rls.test.sql: 82 passed, 0 failures
schema.test.sql: 24 passed, 0 failures
status.test.sql: 32 passed, 0 failures
```

Total: 258/258. Retained database: `verify_1793395954766`; full TAP: `.cache/db-results-verify_1793395954766.txt`.

New tests cover all four active staff roles against all six customer RPCs with valid and null inputs (48 assertions), no booking/payment/audit/counter side effects, unchanged booking state/time, authenticated nonstaff and inactive staff access, private helper ACL, and an actual anonymous customer lifecycle including reserve/find/get/submit/reschedule/cancel, persisted payment and customer audit.

Static checks: six guard invocations, 61 assertions, no DELETE/TRUNCATE in the new migration. Programmatic comparison verified reserve/payment/find/reschedule definitions match the latest originals exactly except the guard. `git diff --check` passed.

## Files changed

- `supabase/migrations/0010_customer_staff_boundary.sql`
- `supabase/tests/customer_staff_boundary.test.sql`
- `.superpowers/sdd/2026-10-30-supabase-backend/task-4-continuation-report.md`

## Self-review and limitations

No correctness issues found. Pre-existing line-ending changes in 0008_rls_staff.sql and rls.test.sql were preserved and excluded from the commit. The new test creates isolated fixtures and rolls back, with no removal or modification of existing records. Existing regression suites also roll back. The controller-owned local harness/cache is not included in this implementation commit.

Validation covers PostgreSQL RPC/RLS behavior, not Supabase HTTP gateway, real managed auth or cron scheduling. Migration 0010 remains unapplied to cloud as requested. The future receipt endpoint and dedicated anonymous customer frontend client remain later-task requirements.
