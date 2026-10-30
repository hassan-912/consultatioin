# MG Consultations — Supabase Backend & Live Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the existing app as a real website whose bookings, payments, receipts, schedules, audit history and staff accounts live in a dedicated Supabase project, with live finance updates and email alerts.

**Architecture:** A data-access layer (`src/data/`) sits between the UI and storage, with a `local` implementation (today's Zustand store; used by tests and the claude.ai demo) and a `supabase` implementation. Supabase enforces every rule in Postgres (exclusion constraint, `SECURITY DEFINER` RPCs, RLS, pg_cron). Two Edge Functions send email through Resend. The SPA deploys to Vercel.

**Tech Stack:** Supabase (Postgres 17, Auth, Storage, Realtime, pg_cron, btree_gist, Edge Functions on Deno), `@supabase/supabase-js` v2, Supabase CLI (local stack + migrations), Resend, Vercel, existing Vite/React/TS app, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-30-supabase-backend-design.md`

## Global Constraints

- New Supabase project in org **Crew-MG**, region **eu-central-1**. Never touch `mgvisa-reviewer` or `queue are code`. Creating the project requires `confirm_cost` and the user's explicit OK.
- Schema changes only through files in `supabase/migrations/`; apply to a Supabase branch / local stack first, production last.
- The browser only ever holds `VITE_SUPABASE_URL` + publishable key. Service-role key, `RESEND_API_KEY`, `FINANCE_ALERT_TO`, `EMAIL_FROM` exist only as Supabase secrets.
- RLS enabled on every table; `anon` has **no** table privileges — customers act only through RPCs.
- Status machine, hold minutes (30), buffer (10), price (1000 EGP), duration range (15–30, slot 30) identical to `src/config/booking.ts` and `src/domain/bookingStatus.ts`.
- No code path confirms a booking without a finance/admin user (`autoConfirm` stays false).
- QR payload = `qr_token` only. Tokens: 128-bit random (`encode(gen_random_bytes(16),'hex')`).
- Existing 111 tests keep passing against the `local` layer after every task.
- The artifact build (`--mode artifact`) never imports `@supabase/supabase-js` or contains keys.
- Commit per task; never push to a shared branch or deploy production without the user's OK.

## Review Focus

1. **Concurrent reservations for the same slot** → exactly one succeeds; the other gets `SLOT_TAKEN` (Task 2 exclusion test with two transactions).
2. **Customer guessing another booking** → `get_booking` with a wrong token returns nothing; `anon` `select * from bookings` is denied (Task 4 RLS test).
3. **Hold expiring between page load and submit** → `submit_payment` refuses an expired `reserved` hold and the UI shows the expired screen (Task 3 SQL test + Task 7 contract test).
4. **Arabic-Indic digits / spaces in phone and txn ref sent to RPCs** → normalized in SQL, so lookups match (Task 3 test).
5. **Email function failure** → booking state unaffected; failure logged; retry does not double-send (Task 9 idempotency test via `ticket_sent_at` / `notified_at`).

---

## File Structure

```
src/data/
  types.ts            BookingRepo interface + DTOs
  local.ts            implementation over useAppStore/actions (today's behaviour)
  supabase.ts         implementation over supabase-js RPCs/tables
  index.ts            picks implementation from import.meta.env.MODE / VITE_DATA_MODE
  useBookings.ts      React hooks (query + realtime) used by screens
src/lib/supabase.ts   createClient (production builds only)
supabase/
  config.toml
  migrations/0001_schema.sql, 0002_status_machine.sql, 0003_customer_rpcs.sql,
             0004_rls_staff.sql, 0005_storage.sql, 0006_cron.sql, 0007_notify.sql
  tests/*.sql         pgTAP tests
  functions/notify-finance/index.ts
  functions/send-ticket-email/index.ts
  seed.sql            schedules from src/demo/schedule.ts (dev only)
vercel.json
```

---

### Task 1: Data-access layer (local implementation)

**Files:** Create `src/data/{types,local,index}.ts`, `src/data/repo.contract.test.ts`; Modify screens that call `src/store/actions.ts` directly (BookingWizard, PaymentStep callers, BookingPage, FindBookingPage, staff screens, DemoPanel).

**Interfaces — Produces:**
```ts
interface BookingRepo {
  availableSlots(consultantId: string, date: string, format: Format): Promise<Slot[]>
  reserve(draft: { consultantId: string; format: Format; startIso: string; details: CustomerDetails; lang: Lang }): Promise<{ bookingId: string; reference: string; manageToken: string; holdExpiresAt: number }>
  submitPayment(manageToken: string, p: { method: PaymentMethodId; txnRef: string; receipt?: Blob }): Promise<Booking>
  getByManageToken(token: string): Promise<Booking | null>
  find(reference: string, phone: string): Promise<string | null>          // manage token
  cancel(manageToken: string): Promise<Booking>
  reschedule(manageToken: string, startIso: string): Promise<Booking>
  staffList(filter: { statuses?: BookingStatus[]; consultantId?: string; date?: string }): Promise<Booking[]>
  staffTransition(bookingId: string, e: BookingEvent): Promise<Booking>
  checkIn(code: string): Promise<{ verdict: CheckInVerdict; booking?: Booking }>
  receiptUrl(bookingId: string): Promise<string | null>
  subscribe(onChange: () => void): () => void
}
class SlotTaken extends Error {}  class HoldExpired extends Error {}
```
`local.ts` wraps existing `actions.ts` (sync → `Promise.resolve`). `index.ts` exports `repo`.

- [ ] **Step 1:** Write `repo.contract.test.ts` as a factory `runContract(makeRepo)` covering: reserve → submit → staff verify → check-in once; second reserve on same slot throws `SlotTaken`; submit after hold expiry throws `HoldExpired`; `getByManageToken('wrong')` → null; `find` with Arabic-digit phone works. Run it for `local`.
- [ ] **Step 2:** Run → FAIL (module missing). **Step 3:** Implement `types/local/index`. **Step 4:** Move UI call sites to `repo` + `useBookings` hooks (loading/empty states for async). **Step 5:** `npx vitest run` → all existing tests + contract PASS. **Step 6:** Commit `refactor: data-access layer with local implementation`.

### Task 2: Supabase project, local stack, base schema

**Files:** `supabase/config.toml`, `supabase/migrations/0001_schema.sql`, `supabase/tests/schema.test.sql`, `supabase/seed.sql`.

- [ ] **Step 1 (user gate):** `get_cost` → show the user the cost → on explicit OK `confirm_cost` + `create_project` (name `mg-consultations`, eu-central-1). Record project ref in `.env.example` (no secrets).
- [ ] **Step 2:** `supabase init`; enable `btree_gist`, `pgcrypto`, `pg_cron`. Write pgTAP tests: tables exist; `bookings` exclusion rejects overlapping blocking rows for the same consultant incl. 10-min buffer; allows overlap when one row is `expired`/`cancelled`; check constraints (`ends_at > starts_at`, note ≤ 300, channel/lang enums).
- [ ] **Step 3:** Run `supabase test db` → FAIL. **Step 4:** Write `0001_schema.sql` per spec §3 (enums `booking_status`, `booking_format`, `staff_role`, `exception_kind`; tables; generated `blocks_range`; `EXCLUDE USING gist`; indexes). **Step 5:** PASS. **Step 6:** `seed.sql` from demo schedules. Commit `feat(db): base schema with no-double-booking constraint`.

### Task 3: Status machine, customer RPCs, normalization

**Files:** `0002_status_machine.sql`, `0003_customer_rpcs.sql`, `supabase/tests/{status,customer}.test.sql`.

**Produces (SQL):** `normalize_digits(text)`, `apply_transition(booking_id uuid, event text, actor_kind text, actor_user uuid, reason text)` (private; mirrors `allowed`/`target` tables in `bookingStatus.ts`, writes `audit_log`), and anon-executable RPCs from spec §4: `available_slots`, `reserve_slot`, `submit_payment`, `get_booking`, `find_booking`, `cancel_booking`, `reschedule_booking`. Error codes raised as `SLOT_TAKEN`, `HOLD_EXPIRED`, `INVALID_TRANSITION`, `RATE_LIMITED`.

- [ ] **Step 1:** pgTAP tests mirroring `src/domain/bookingStatus.test.ts` cases one-to-one; plus: `submit_payment` on expired `reserved` → `HOLD_EXPIRED`; on `rejected` with slot taken → `SLOT_TAKEN`; `find_booking('mg-abcd-efgh', '+٢٠١…')` matches; `get_booking` never returns `qr_token` of other rows; `reserve_slot` outside working hours / in the past / on leave → error; 6th `reserve_slot` from same phone in 10 min → `RATE_LIMITED`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit `feat(db): status machine and customer RPCs`.

### Task 4: Staff auth, roles, RLS

**Files:** `0004_rls_staff.sql`, `supabase/tests/rls.test.sql`.

**Produces:** `staff_profiles`, helper `current_role()`; RLS policies per spec §4; staff RPCs `staff_transition(booking_id, event, reason)`, `check_in(code)`, `save_record(booking_id, notes, outcome)`, admin-only `upsert_schedule`, `add_exception`, `set_staff_role`.

- [ ] **Step 1:** Tests (`tests.authenticate_as` helpers): anon cannot select any table; finance sees all bookings + payments, cannot `upsert_schedule`; reception cannot verify; consultant sees only own `consultant_id`; `check_in` twice → second returns `already-used`; every transition writes `audit_log` with `actor_user`.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** Commit `feat(db): staff roles and row-level security`.

### Task 5: Receipts storage

**Files:** `0005_storage.sql`, `supabase/tests/storage.test.sql`.
Private bucket `receipts`; `create_receipt_upload(manage_token)` returns path `receipts/{booking_id}/{uuid}.jpg` + signed upload token (Edge-free via `storage.create_signed_upload_url` wrapper or client `uploadToSignedUrl`); read policy finance/admin only; 5 MB, image/* and application/pdf.
- [ ] Tests: anon cannot read receipts; finance can; path outside own booking rejected. FAIL → implement → PASS → commit.

### Task 6: Hold expiry job

**Files:** `0006_cron.sql`, `supabase/tests/cron.test.sql`.
`expire_due_holds()` + `cron.schedule('expire-holds', '* * * * *', ...)`.
- [ ] Test: function flips only `reserved` with `hold_expires_at <= now()`; writes audit actor `system`; slot becomes reservable. FAIL → implement → PASS → commit.

### Task 7: Supabase implementation of the repo

**Files:** `src/lib/supabase.ts`, `src/data/supabase.ts`, `src/data/repo.supabase.test.ts` (runs `runContract` against local stack; skipped unless `SUPABASE_TEST_URL` set), `.env.example`.
Maps RPC error codes to `SlotTaken` / `HoldExpired`; receipt upload via signed URL; `subscribe` via Realtime channel on `bookings`.
- [ ] Contract suite FAIL → implement → PASS on local stack. `npm run build` (production) bundles supabase-js; `npm run build:artifact` output contains no `supabase` string (assert in script). Commit.

### Task 8: Real staff sign-in and staff management

**Files:** Modify `src/store/auth.ts`, `src/features/staff/StaffLogin.tsx`, `StaffApp.tsx`; Create `src/features/staff/admin/StaffAccounts.tsx`.
Production: `supabase.auth.signInWithPassword`, session from Supabase, role from `staff_profiles`; password reset link. Admin screen: invite by email (Edge `inviteUserByEmail` through an admin-only function), set role/consultant, deactivate. Artifact mode keeps the prototype accounts.
- [ ] Tests (local layer + mocked auth): signed-out → login screen; deactivated profile → refused; consultant session only shows own data. Commit.

### Task 9: Notifications (live + email)

**Files:** `0007_notify.sql` (database webhooks → functions; `payments.notified_at`), `supabase/functions/notify-finance/index.ts`, `supabase/functions/send-ticket-email/index.ts` (+ `deno test` files), Modify `PaymentQueue.tsx` (realtime badge, optional sound/Notification API).
- [ ] Tests: `notify-finance` builds the email (reference, customer, amount, method, txn, review link) and is idempotent on `notified_at`; `send-ticket-email` only for `confirmed` + `channel=email`, bilingual by `lang`, sets `ticket_sent_at`, idempotent; Resend errors leave booking unchanged and are logged. PDF: attach server-rendered PDF if Arabic shaping passes a visual check; otherwise send manage link + "Download PDF" (spec §9 fallback) — record the decision in the ledger.
- [ ] Deploy functions to the dev branch with secrets; send one test email to an address the user provides. Commit.

### Task 10: Build modes, Vercel, preview

**Files:** `vercel.json` (SPA rewrite), `package.json` scripts, `src/data/index.ts` mode switch, `README.md` (setup, env, deploy).
- [ ] User gate: user creates/grants GitHub repo + Vercel project. Push branch; set Vercel env vars; preview deploy against the Supabase **dev branch**. Verify: book on laptop → open ticket link on a phone → finance verifies on another device → ticket turns confirmed live → reception check-in once. Commit.

### Task 11: Security review & go-live checklist

- [ ] Run `backend-design:security-reviewer` on migrations + functions + `src/data/supabase.ts`; run Supabase `get_advisors` (security + performance); fix Critical/Important with a failing test first.
- [ ] Walk spec §10 open decisions with the user; only after all are settled: apply migrations to production, set production secrets, switch Vercel production env, deploy (user OK required). Commit `chore: go-live`.
