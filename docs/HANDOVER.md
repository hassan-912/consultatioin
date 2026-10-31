# Handover — MG Consultations (2026-10-31)

Read this first when resuming. The live progress ledger is copied below (the original lives in the git-ignored `.superpowers/sdd/2026-10-30-supabase-backend/progress.md`).

## Where things stand
- **Prototype** (branch `feat/prototype`, published as the claude.ai artifact v8): complete.
- **Backend** (branch `feat/supabase`): plan `docs/superpowers/plans/2026-10-30-supabase-backend.md`, spec `docs/superpowers/specs/2026-10-30-supabase-backend-design.md`, executed with superpowers:subagent-driven-development.
  - Tasks 1–6 complete and reviewed (data layer, schema, status machine + customer RPCs, staff roles/RLS, receipt storage, hold expiry). Migrations `supabase/migrations/0001–0012`.
  - Tasks 7, 7c (daily-capacity lock, 0014), 7d (deps, audit 0), 8 (real staff auth + invite-staff, 0015), 9 (finance in-site alerts + ticket email outbox, 0016) complete and reviewed.
  - Task 10 partly done (2026-10-31): migrations 0001–0016 applied to the dev project; Edge Functions `create-receipt-upload`, `invite-staff`, `send-ticket-email` deployed (ACTIVE v1, verify_jwt=false, own auth); cron jobs `expire-holds` and `dispatch-ticket-emails` active.
  - Live on Vercel: https://consultatioin.vercel.app (Vercel production branch = `feat/supabase`; env VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_DATA_MODE=supabase, VITE_SITE_URL). Vault entries created by user. First admin: hassanazb.56@gmail.com (bootstrap insert, audit id 146).
  - Remaining for Task 10: user sets function secrets (`SITE_URL`, `TICKET_EMAIL_WEBHOOK_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`) and Vault entries (`project_url`, `ticket_email_webhook_secret`); Auth: disable sign-up, add `${SITE_URL}/#/staff/reset` to redirect URLs; first admin account; schedules (cloud has none — admin enters them, or apply seed.sql only with user OK); Vercel preview (needs user's Vercel access).
  - Task 11 (security review + go-live checklist). Advisor notes to triage there: anon/authenticated SECURITY DEFINER warnings are by design (public RPCs; staff RPCs check role); RLS-no-policy tables are intentionally locked; `pg_net` in `public` schema; 3 unindexed FKs (consultation_records.updated_by, payments.decided_by, schedule_exceptions.consultant_id); drop pgtap before go-live.
- **Supabase**: dev project `mg-consultations`, ref `jqieqoquhjwubenkwmut`, eu-central-1, org Crew-MG, $0/month. Migrations 0001–0016 applied; check `list_migrations` before applying more.
- App tests: 208 passed, 1 skipped (`npx vitest run`); SQL suite via `node .cache/test-db.mjs` (local only).

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
Task 7: finished from WIP c499d40 + 9fb99b3 (153 app tests, 8 SQL files pass locally, artifact has no supabase). Review: 4 Important.
Task 7: Ruling: restore supabase/migrations/0008_rls_staff.sql byte-identical to its last pre-WIP commit (line-ending-only rewrite violates "don't edit prior migrations"; restoring bytes deletes nothing); rls.test.sql keeps its content but its original line endings — supersedes the Codex note preserving those line-ending changes — cost if wrong: none (no semantic change).
Task 7: Ruling: availability board free-slot counts refresh every 60s or on schedule change (not on every booking change) to avoid ~170 RPC bursts — cost if wrong: counts up to 60s stale on the staff board only.
Task 7: fix round 1/5 (4 addressed, 0 open; commits 9fb99b3..df81954)
Task 7: minor (deferred): CRLF conversions in useBookings.ts, lib/supabase.ts, live.integration.test.tsx; AvailabilityBoard stale-on-error not shown; workers not aborted on unmount
Task 7: complete (commits 9b86270..df81954, review clean)
Task 7c: minor (deferred): SKIP LOCKED in apply_transition can give rare safe spurious SLOT_TAKEN; runner always lets reserve lock first; runner doesn't verify template includes 0014 (+3 more in review file)
Task 7c: Ruling: 0012-0014 are not yet applied to the cloud dev project; apply in order in Task 10 before the preview walkthrough (check list_migrations first) — cost if wrong: preview fails until applied.
Task 7c: complete (commits f1f816e..d71bc8e, review clean)
Task 7d: complete (commits d71bc8e..ffe718b, review clean; audit 6 -> 0)
Task 8: Ruling: staff list shows display names (staff_profiles has no email) and invites write no audit row — acceptable for v1; revisit in Task 11 — cost if wrong: a small migration adding email/audit.
Task 8: Ruling: supersedes the earlier 'invites write no audit row' ruling — invite-staff must write audit_log and must not overwrite/reactivate an existing staff_profiles row (existing → 409 or same audited path as set_staff_role); set enable_signup = false in supabase/config.toml; cloud Auth signup/redirect allow-list checked in Task 10/11 — cost if wrong: none.
Task 8: fix round 1/5 (1 addressed, 0 open; commits d0e05a1..bec2e4f)
Task 8: minor (deferred): refused grant after inviteUserByEmail leaves an orphan auth user (no staff access; admin retry gets 409 until removed in dashboard)
Task 8: complete (commits ffe718b..bec2e4f, review clean)
Task 9: Ruling: PDF fallback — ticket email carries the manage link + 'Download PDF' instruction (no server-side PDF; Arabic shaping unverified) per spec §9 — cost if wrong: add server PDF later.
Task 9: minor (deferred): per-row send loop lacks try/catch (one throw can poison a batch); failed-8x rows have no staff UI; stale "email not connected" copy on Send ticket tab
Task 9: complete (commits bec2e4f..fc0714a, review clean)
Next: Task 10 needs user gate — Vercel account/project; apply migrations to dev project (check list_migrations; 0010-0016 likely pending); set function secrets + Vault entries; deploy create-receipt-upload, invite-staff, send-ticket-email.
