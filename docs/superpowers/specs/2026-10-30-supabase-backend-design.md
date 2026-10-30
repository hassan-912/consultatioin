# MG Consultations — Live Website & Supabase Backend

**Date:** 2026-10-30
**Status:** Design approved in conversation — awaiting written-spec review
**Builds on:** `docs/superpowers/specs/2026-10-30-mg-consultant-booking-design.md` (the prototype)

---

## 1. Intent

**Problem.** Bookings live only in the browser where they were made, so a customer's ticket link (WhatsApp, PDF, QR) does not open on their phone, and staff on another device cannot see them. Staff sign-in is a prototype hash check.

**Outcome.** The same app runs as a real website. Bookings, payments, receipts, schedules, audit history and staff accounts live in a dedicated Supabase project, so:
- ticket and booking links work on any device;
- finance sees new payments live and gets an email for each;
- customers who chose email receive their confirmed ticket automatically;
- staff sign in with real accounts, and every rule (no double-booking, hold expiry, single check-in, no auto-confirm) is enforced by the database.

**Decided in conversation**
| Topic | Decision |
|---|---|
| Hosting | Real website on a free Vercel address first; `book.mg-visa.com` later via one DNS record |
| Backend | New dedicated Supabase project, region **eu-central-1 (Frankfurt)**; existing projects untouched |
| Architecture | Browser talks to Supabase directly; Row Level Security + database functions guard every action; no custom API server |
| Finance alerts | Live updates in the staff workspace **and** an email per new payment |
| Customer email | Confirmed ticket emailed automatically when finance verifies (channel = email) |
| Demo | claude.ai artifact stays as the design demo, built in "artifact" mode with browser storage and demo data |

**Out of scope (later):** WhatsApp Business API automation, online payment gateway, moving branch/team/program content into the database, analytics.

## 2. System overview

```
Customer phone ─┐                      ┌─ Supabase (Frankfurt)
Staff browser ──┼─> Vercel (static SPA)│   Postgres + RLS + RPC functions
                │   publishable key ───┼─> Auth (staff email/password)
                │                      │   Storage: receipts (private)
                │                      │   Realtime: bookings changes
                │                      │   pg_cron: expire holds every minute
                │                      │   Edge Functions (secret keys):
                │                      │     notify-finance, send-ticket-email
                │                      └─> Resend (email API)
```

- **One codebase, three build modes:** `development`, `production` (Supabase), `artifact` (browser storage + demo data + prototype controls).
- A **data-access layer** (`src/data/`) exposes the same operations the UI uses today (`createReservation`, `submitPayment`, `applyEvent`, `getBooking…`). Two implementations: `local` (current Zustand store, used by the artifact and tests) and `supabase`. The UI does not know which one is active.

## 3. Data model (Postgres, schema `public`)

All tables have `created_at timestamptz default now()`. Times are stored in UTC (`timestamptz`); branch time zones stay in code.

**`staff_profiles`** — one row per staff auth user
`user_id uuid pk → auth.users`, `display_name text not null`, `role staff_role not null` (`admin|finance|reception|consultant`), `consultant_id text null` (required when role = consultant), `active bool default true`.

**`schedules`** — one row per consultant
`consultant_id text pk`, `weekly jsonb not null`, `breaks jsonb`, `formats text[]`, `max_per_day int`, `buffer_min int default 10`.
**`schedule_exceptions`** — `id uuid pk`, `consultant_id text`, `kind exception_kind` (`holiday|leave|unavailable`), `starts_on date`, `ends_on date` (check `ends_on >= starts_on`).

**`bookings`**
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| reference | text unique | `MG-XXXX-XXXX` |
| qr_token | text unique | 128-bit random; QR payload |
| manage_token | text unique | 128-bit random; private link |
| consultant_id, branch_id | text | |
| format | booking_format | `online|in-person` |
| starts_at, ends_at | timestamptz | `ends_at > starts_at` |
| tz | text | |
| price_amount | int, `price_currency text` | 1000 / EGP |
| customer_name, customer_phone, customer_email | text | phone E.164 |
| channel | text | `email|whatsapp` |
| lang | text | `ar|en` |
| program, note | text | note ≤ 300 |
| status | booking_status | same 12 values as prototype |
| hold_expires_at | timestamptz | |
| reject_reason | text | |
| meeting_url | text | set on verify (online) |
| checked_in_at, ticket_sent_at | timestamptz | |
| ticket_sent_via | text | |

Indexes: `(consultant_id, starts_at)`, `(status)`, unique tokens.
**No double-booking constraint:** `EXCLUDE USING gist (consultant_id WITH =, tstzrange(starts_at - buffer, ends_at + buffer) WITH &&) WHERE (status IN blocking set)` — implemented via a generated `blocks_range tstzrange` column and `btree_gist`. Reserved holds count while unexpired (cron flips them to `expired`).

**`payments`** — `id uuid pk`, `booking_id uuid → bookings`, `method text`, `txn_ref text not null`, `receipt_path text null` (Storage key), `submitted_at timestamptz`, `decided_by uuid → auth.users null`, `decided_at timestamptz`, `decision text`.

**`audit_log`** — `id bigint identity`, `at timestamptz`, `actor_user uuid null`, `actor_kind text` (`customer|system|<role>`), `booking_id uuid null`, `action text`, `from_value text`, `to_value text`.

**`consultation_records`** — `booking_id uuid pk`, `notes text`, `outcome text`, `updated_by uuid`.

## 4. Access rules

- **RLS on every table.** No table is readable or writable by the `anon` role directly.
- **Customers (anon)** act only through `SECURITY DEFINER` functions that validate input and return the minimum fields:
  - `reserve_slot(consultant_id, format, starts_at, details jsonb) → {booking_id, reference, manage_token, hold_expires_at}` — checks working hours/exceptions/past time, inserts `reserved`; the exclusion constraint rejects clashes (`SLOT_TAKEN`). Rate-limited per phone.
  - `submit_payment(manage_token, method, txn_ref, receipt_path?)` — only from `reserved` (unexpired) or `rejected` (slot re-checked); normalizes Arabic digits.
  - `get_booking(manage_token) → public booking view` (no other bookings, no staff fields).
  - `find_booking(reference, phone) → manage_token | null`.
  - `cancel_booking(manage_token)`, `reschedule_booking(manage_token, starts_at)` — policy-gated.
  - `available_slots(consultant_id, date, format) → timestamptz[]` — computed server-side from schedules + blocking bookings.
- **Receipt upload:** customer gets a signed upload URL for `receipts/{booking_id}/{uuid}.jpg` via `create_receipt_upload(manage_token)`; bucket is private; read only for finance/admin.
- **Staff (authenticated)** policies by `staff_profiles.role`:
  - finance: read bookings + payments + receipts; `staff_transition(booking_id, event, reason?)` for verify/reject/wrong-amount/duplicate/late/mark-sent.
  - reception: read today's bookings (any branch); `check_in(qr_token|reference)` — single use enforced in the function.
  - consultant: read/update only rows with their `consultant_id`; records + complete/no-show.
  - admin: everything, plus staff/role management and schedules.
- Every state change goes through `staff_transition` / customer functions, which write `audit_log` in the same transaction. The status machine from `src/domain/bookingStatus.ts` is mirrored in SQL and tested against the same cases.
- `autoConfirm` stays off: no code path confirms a booking without a finance user.

## 5. Background work & notifications

- **pg_cron** every minute: `expire_due_holds()` flips unexpired→`expired`, writes audit.
- **Realtime:** staff workspace subscribes to `bookings` changes (RLS-filtered) → Payment review updates live, badge count, optional sound/browser notification.
- **Edge Function `notify-finance`** — triggered by a database webhook on `payments` insert; emails `FINANCE_ALERT_TO` via Resend: reference, customer, amount, method, txn ref, link to the review screen. Retries on failure; failures logged.
- **Edge Function `send-ticket-email`** — triggered when a booking becomes `confirmed` and `channel = email`; renders a bilingual (customer `lang`) email with booking details and the manage link; attaches the ticket PDF (rendered server-side from the same fields) — v1 may link the PDF instead of attaching if server rendering slips (see §9). Sets `ticket_sent_at/via`.
- **WhatsApp** stays the manual finance flow (share sheet / two steps), now reading live data.

## 6. Hosting, config & environments

- **Repo:** GitHub repository (owner to create or grant access; the session's GitHub connector is currently failing).
- **Vercel:** static build of `npm run build` (production mode), free tier, preview deploys per branch.
- **Env vars (browser, public):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SITE_URL`.
- **Secrets (Supabase only):** `RESEND_API_KEY`, `FINANCE_ALERT_TO`, `EMAIL_FROM`, service role key (never shipped to the browser).
- **Links:** manage/ticket links use `VITE_SITE_URL` (free address now; `book.mg-visa.com` later — old links redirected).
- **Artifact build** unchanged: local data layer, demo seed, prototype controls; never contains Supabase keys.
- **Backups:** Supabase daily backups on. Migrations live in `supabase/migrations/` and are the only way schema changes.

## 7. Security & privacy

- Personal data (name, phone, email, receipt) is reachable only by the customer's own unguessable `manage_token` or by authorized staff.
- QR payload stays the random `qr_token` only.
- Tokens never appear in logs or emails to anyone except the customer.
- Staff accounts created by admin (invite email); password reset via Supabase Auth; no public sign-up.
- Rate limits on `reserve_slot`, `find_booking`, `submit_payment` (per phone/IP) to deter scraping and spam holds.
- Security review (backend-design:security-reviewer) and Supabase advisors run before go-live.

## 8. Migration from the prototype

- Live database starts **empty** (no demo bookings). Schedules seeded from `src/demo/schedule.ts` as a starting point for admin to edit.
- Prototype staff logins (`docs/demo-staff-logins.md`) are not carried over; admin creates real accounts.
- Existing UI, texts, ticket, PDF and WhatsApp builder are reused unchanged on top of the data layer.

## 9. Testing & rollout

- **SQL tests** (pgTAP or SQL scripts) for: exclusion constraint, hold expiry, every status transition, single check-in, RLS per role (anon cannot select tables; consultant sees only own rows).
- **App tests:** existing 111 tests keep running against the `local` layer; a contract test suite runs the same scenarios against both layers (the Supabase one against a local `supabase start` stack).
- **Rollout:** 1) project + schema on a branch DB, 2) preview deploy with test data, 3) staff walkthrough, 4) production with real payment details once §10 decisions are made.
- **Risk:** server-side PDF rendering in an Edge Function (fonts, Arabic shaping). Fallback: email contains the manage link and a "Download PDF" button that renders client-side.

## 10. Open decisions (must be settled before go-live)

- Finance alert address (`FINANCE_ALERT_TO`) and sender address/domain (`EMAIL_FROM`; DNS records on mg-visa.com for Resend).
- Retention period for receipts and customer data.
- Which staff get accounts, and their roles.
- Real InstaPay link, Vodafone Cash wallet numbers and recipient name.
- Cancellation / reschedule / refund / no-show policy (customer self-service limits).
- GitHub and Vercel account ownership.
- Supabase plan: confirm cost for the new project (Free tier allows 2 active projects per org; Crew-MG currently has 1 active + 1 paused).
