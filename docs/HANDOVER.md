# Handover — MG Consultations (2026-10-31)

Read this first when resuming. The live progress ledger is copied below (the original lives in the git-ignored `.superpowers/sdd/2026-10-30-supabase-backend/progress.md`).

## Where things stand
- **Prototype** (branch `feat/prototype`, published as the claude.ai artifact v8): complete.
- **Backend** (branch `feat/supabase`): plan `docs/superpowers/plans/2026-10-30-supabase-backend.md`, spec `docs/superpowers/specs/2026-10-30-supabase-backend-design.md`, executed with superpowers:subagent-driven-development.
  - Tasks 1–6 complete and reviewed (data layer, schema, status machine + customer RPCs, staff roles/RLS, receipt storage, hold expiry). Migrations `supabase/migrations/0001–0012`.
  - **Task 7 in progress** (Supabase repo implementation + live screen reads): committed as a WIP snapshot (`wip(task7)` commit) including `0013_public_metadata.sql`. Not yet reviewed. Queued after it: Task 7c (daily-capacity race fix, migration 0014), Task 7d (dependency audit fixes).
  - Remaining: Tasks 8 (real staff auth), 9 (notifications — finance alerts in-website only, per user), 10 (Vercel preview — needs GitHub/Vercel access), 11 (security review + go-live checklist).
- **Supabase**: dev project `mg-consultations`, ref `jqieqoquhjwubenkwmut`, eu-central-1, org Crew-MG, $0/month. Migrations 0001–0009 were applied to it in the first session; check `list_migrations` before applying more.
- App tests at handover: 151 passed, 1 skipped (`npx vitest run`).

## User decisions to respect
- Do not delete existing database data or files the user didn't ask to remove.
- Finance notifications inside the website only (no finance email). Customer ticket email stays.
- Meeting platform (Zoom/Google Meet) is informational only.
- Demo staff logins (`docs/demo-staff-logins.md`) are prototype-only; real accounts come in Task 8.

## Progress ledger (verbatim)
# SDD ledger — plan: docs/superpowers/plans/2026-10-30-supabase-backend.md
Spec: docs/superpowers/specs/2026-10-30-supabase-backend-design.md. Branch feat/supabase from feat/prototype @ d812537.

## Pre-flight scan
| Tasks | Shared | Finding |
|---|---|---|
| 1 ↔ 7 | BookingRepo interface (types.ts) | Task 7 implements the same interface; contract suite `runContract` shared — consistent |
| 1 ↔ 8 | auth / staff screens | Task 1 moves staff screens to repo; Task 8 swaps sign-in. Consistent if Task 1 leaves auth.ts untouched |
| 1 ↔ 9 | PaymentQueue | Task 1 moves it to repo/useBookings; Task 9 adds realtime via repo.subscribe — consistent |
| 2 ↔ 3/4/5/6 | migrations numbering 0001-0007 | sequential, no overlap |
| 3 ↔ src/domain/bookingStatus.ts | status machine | SQL must mirror TS table incl. review-fix rules (verify blocked if slot re-booked; rejected resubmit regardless of hold) |
| 5 ↔ 3 | submit_payment receipt_path | Task 3 RPC accepts receipt_path; Task 5 creates bucket/upload RPC — order ok |
| 9 ↔ 0007 | payments.notified_at | column added in 0007, not 0001 — consistent |
| Task 1 self | tests vs code | contract tests run against local only — ok |
| Task 2 self | gate | project creation needs user cost OK; local stack (Docker) needed for pgTAP |
| Task 10 self | gate | GitHub/Vercel accounts from user |

Ruling: Task 2 may build migrations/tests against the local Supabase stack (Docker) before the cloud project exists; cloud project creation waits for the user's cost OK — cost if wrong: none.
Ruling: Status machine in SQL includes the review-fix rules already in TS (late-transfer verify clash, rejected resubmit regardless of hold, reschedule clash) — spec §4 says mirror TS — cost if wrong: one migration edit.
Ruling: no Docker on this machine — Tasks 2-7 test against the new cloud project (dev phase) via MCP apply_migration/execute_sql + pgTAP, instead of a local stack; production cutover in Task 11 — cost if wrong: dev data in the same project; mitigated by wiping before go-live.
Task 2 gate: user approved $0/month; created Supabase project mg-consultations ref jqieqoquhjwubenkwmut (eu-central-1, org Crew-MG) on 2026-10-30.
Task 1: Ruling: ⚠️ reads stay on store selectors (one read hook) — controller's dispatch allowed this; Task 7 adds async read hooks for the Supabase layer — cost if wrong: Task 7 grows.
Task 1: Ruling: ⚠️ PaymentStep calls expireDue directly — local-only behaviour; Task 7 must route expiry through repo/getByManageToken — cost if wrong: stale expiry UI in Supabase mode until Task 7.
Task 1: minor (deferred): move runContract out of the .test file before Task 7 reuses it (Task 7 dispatch will carry this).
Task 1: fix round 1/5 (1 addressed, 0 open; commits 70ae432..9594514)
Task 1: minor (deferred): fatal truthiness check; throw before useEffect hooks; test restoreAllMocks not in finally; no RED shown for new test
Task 1: complete (commits d812537..9594514, review clean)
Task 2: Ruling: 10-min buffer fixed in the exclusion constraint (generated column can't read schedules.buffer_min); schedules.buffer_min kept for slot generation only — matches config bufferMin 10 — cost if wrong: a migration if buffers become per-consultant.
Task 2: Ruling: pgtap stays enabled during development; drop before go-live (added to Task 11 checklist) — cost if wrong: an unused extension in prod.
Task 2: Ruling: buffer applied once between bookings (pad each row's END by 10 min only: blocks_range = [starts_at, ends_at + 10m)), matching src/domain/availability.ts and global constraint "buffer (10)"; spec §3 formula padding both sides is superseded — cost if wrong: one migration.
Task 2: Ruling: fixes go in a NEW migration file 0002_schema_fixes.sql (0001 is already applied to the dev project); later plan migrations shift +1 (status machine 0003, customer RPCs 0004, rls 0005, storage 0006, cron 0007, notify 0008) — cost if wrong: renaming files.
Task 2: Ruling: fix round added 0002-0004; later tasks take the next free migration number (status machine starts at 0005) — supersedes the earlier +1 shift ruling — cost if wrong: renames.
Task 2: fix round 1/5 (3 addressed, 0 open; commits e585fd1..999abca)
Task 2: minor (deferred): supabase_admin default ACLs in public still grant anon/authenticated on objects created by supabase_admin (dashboard/extensions) — check at final review
Task 2: complete (commits 9594514..999abca, review clean)
Task 3: Ruling: ⚠️ cancel/resubmit/verify/reschedule after start time and no cancel cutoff — policy is an open decision (spec §10); leave permissive, revisit in Task 11 — cost if wrong: a policy migration.
Task 3: Ruling: ⚠️ concurrent-reserve guarantee rests on the EXCLUDE constraint (atomic in Postgres); sequential test accepted since execute_sql cannot run two sessions — cost if wrong: none expected.
Task 3: fix round 1/5 (2 addressed, 0 open; commits bc03ca3..f44f261)
Task 3: minor (deferred): per-reference lookup limit lets junk lookups lock a real customer out for 10 min; daily cap not race-safe; schedules.buffer_min unused
Task 3: complete (commits 999abca..f44f261, review clean)
Task 4: Ruling: staff reads must list bookings columns explicitly (no select *); Task 7 supabase repo must follow — cost if wrong: query errors caught by contract tests.
Task 4: fix round 1/5 (0 addressed, 1 open — find_booking returns manage_token to staff; commits f889ac5..70722a0)
Task 4: Ruling: every customer RPC that takes or returns a manage_token (find_booking, get_booking, submit_payment, cancel_booking, reschedule_booking, create_receipt_upload later) raises FORBIDDEN when current_staff_role() is not null; staff act only through staff RPCs. Task 7 customer pages must call customer RPCs through an anon-only supabase client (no staff session attached) — cost if wrong: a staff member testing the public site while signed in sees FORBIDDEN.

## Codex continuation — 2026-10-30
User authorized using the same skills and completing the remaining work. Binding constraint: do not delete any existing database data or unrequested files. All destructive cleanup, database resets, dropping pgTAP, and the earlier wipe-before-go-live ruling are superseded. Existing 0008/test line-ending changes are preserved. Reuse existing feat/supabase checkout; no new worktree needed for this continuation.
Baseline: 119 app tests pass, production build passes. Task 4 still has an open security finding; resume before Task 5. Supabase connector requested, not connected yet; no cloud mutations until verified.
Ruling: preserve all SDD scratch artifacts instead of the skill's final cleanup — explicit user no-deletion instruction overrides cleanup — cost if wrong: extra local scratch files.
Preflight remaining interfaces: Task 4 customer RPCs require an anonymous-only client in Task 7; Task 5 signed uploads need an Edge Function (SQL cannot mint Storage JWTs); Task 6 cron is database-owned; Task 7 must replace all live read/write paths, not only repo methods; Task 8 auth uses separate staff client; Task 9 webhook functions need secret authentication and idempotency; Task 10 build modes must exclude live client from artifact; Task 11 external configuration remains separately verifiable.
Task 4: fix round 2/5 (customer token RPC staff bypass addressed; 258 isolated PostgreSQL assertions pass; commit 71572a5). Task 4: complete (70722a0..71572a5, scoped review clean). Local harness uses real PostgreSQL 17.11 with auth.uid JWT shim; Storage gateway and pg_cron scheduler remain managed-platform checks. Cloud unchanged.
Task 5: Ruling: hit_rate_limit no longer purges aged rows; counters are retained and reset in place — explicit no-delete instruction — cost if wrong: growing counter table, retention decision remains open. Task 5: minor (deferred): add sanitized signing failure response test. Task 5: complete (71572a5..af33126, spec/quality review approved; 278 SQL + 128 app tests pass). Storage HTTP/Deno/cloud integration remains unverified; no cloud mutation.
Task 6: complete (af33126..015b628, spec/quality review approved; 297 SQL assertions pass). Actual pg_cron execution and multisesion contention unverified. Task 7 next: full live repo + screen reads/writes; controller supplemental brief written. Local Vite preview session 98820 on 127.0.0.1:5173; CUA previewTab id1 iab. Baseline browser AR/EN switch works with no error logs. Vercel read-only list found no consultation project/teams; Supabase connection still pending. No cloud writes.

Task 7c queued after Task7: real two-session check confirmed same-slot exclusion safe, but daily capacity race reproducible (max1 commits2). Evidence .cache/concurrency_1793396598666.txt. Integration implementer requested separate 0014 fix to keep0013 metadata/UI scope clean; controller accepted. No cloud writes.
Additional Task5 validation: installed isolated Deno runtime under .cache/edge-tools; deno check --no-lock --node-modules-dir=none supabase/functions/create-receipt-upload/index.ts exited0 (native entrypoint types verified). Real Storage HTTP signing/upload still unverified. No global installation or cloud operation.

USER STEERING: Finance notifications inside website only; no finance email, FINANCE_ALERT_TO or notify-finance email function. Customer ticket email remains separate existing channel unless user changes it. Meeting platform Zoom or Google Meet is informational only; no integration/provisioning. Task7 implementer notified; Task9 brief updated before dispatch.

Task7d queued: readonly npm audit reports6 dependency advisories (3critical,2high,1moderate), primarily older jspdf/sharp/vitest plus transitives. No exploitability assertion; patch direct dependencies with PDF/image/test compatibility validation, no blanket force update. Run after feature integration to avoid concurrent package changes.
