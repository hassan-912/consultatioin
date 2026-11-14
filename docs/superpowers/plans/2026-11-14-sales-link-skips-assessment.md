# Sales-link clients skip the assessment: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the self-booked assessment + readiness stop + Not ready list, and skip all of it for clients who arrived through a sales link.

**Architecture:** Revert `60ee963` and `57e0bd5`, resolve conflicts against later commits, reopen the two database functions that `0045` closed, then gate the wizard's assessment on `currentReferral()`.

**Tech Stack:** React + Vite + TypeScript, Zustand, Vitest + Testing Library, Supabase (SQL migrations + pgTAP-style tests in `supabase/tests`).

**Spec:** `docs/superpowers/specs/2026-11-14-sales-link-skips-assessment-design.md`

## Global Constraints
- Restored behaviour is identical to before the removal ("as before").
- Readiness check stays browser-only; no server copy.
- No new booking columns; the referral code already travels via `repo.setReferral`.
- Sales code validity: the existing 30 days in `src/data/referral.ts`; no change.
- Verification gate: `npm run typecheck` and `npm test` both clean.

## Review Focus
1. Customer `save_assessment` overwriting a consultant's later assessment → must not happen. **My call:** the new migration makes the customer write insert-only (first answer wins; consultants keep editing via `staff_save_assessment`). Test in Task 2.
2. Sales client who previously answered questions in the draft (draft persisted before the link) → no assessment saved and no readiness stop. Test in Task 3.
3. Sales client with no program chosen → Details step must still validate (program is required as before). Test in Task 3.
4. Later commits' changes in `staffAdmin.ts`, i18n, permissions → kept, not overwritten by the revert. Covered by the full test suite in Task 1.
5. Existing `notReadyRemoved.test.tsx` asserts the opposite of the new behaviour → deleted by the revert; nothing else should still assert absence.

---

### Task 1: Revert the two removal commits

**Files:** everything listed by `git show --stat 60ee963 57e0bd5`; known conflict: `src/store/staffAdmin.ts`.

**Interfaces:**
- Produces: `readinessOf`, `defaultReadinessRules` (`src/assessment/readiness.ts`), `NotReady` sales screen, `repo.submitReadinessRequest`, `repo.readinessRules`, `repo.saveAssessment`, `DetailsStep` props `assessment / onAssessment / assessmentIncomplete`.

- [ ] **Step 1:** `git revert --no-commit 60ee963 57e0bd5`
- [ ] **Step 2:** Resolve `src/store/staffAdmin.ts` keeping both: `cdb8000`'s reworked assessment-send code and the restored Not ready state. Resolve any conflict from the second revert the same way.
- [ ] **Step 3:** Re-add `repo.saveAssessment` if `cdb8000` removed it from `src/data/types.ts`, `local.ts`, `supabase.ts` (signature `saveAssessment(manageToken: string, a: StoredAssessment): Promise<void>`, RPC `save_assessment(p_token, p_program, p_answers)`, as in `57e0bd5^`).
- [ ] **Step 4:** Run `npm run typecheck` and `npm test`. Expected: clean.
- [ ] **Step 5:** Commit `feat: bring back the self-booked assessment and the Not ready list`.

### Task 2: Reopen the database functions

**Files:**
- Create: `supabase/migrations/0048_readiness_back.sql`
- Test: `supabase/tests/readiness_back.test.sql`

- [ ] **Step 1: Failing tests:** anon can execute `submit_readiness_request(jsonb)`; anon `save_assessment` on a booking with no assessment succeeds; a second `save_assessment` on the same booking raises and leaves the first answers unchanged; `staff_save_assessment` still updates it.
- [ ] **Step 2:** Run the Supabase SQL tests (same command the repo uses for `supabase/tests/consultant_assessment.test.sql`). Expected: FAIL.
- [ ] **Step 3:** Migration: `grant execute` on both functions to `anon, authenticated`; `create or replace save_assessment` with the 0020 validation plus `raise exception 'ALREADY_SAVED'` when the booking already has an assessment.
- [ ] **Step 4:** Rerun. Expected: PASS. Then check `supabase/tests/consultant_assessment.test.sql` still passes (update its "customer cannot write" assertion to "customer cannot overwrite").
- [ ] **Step 5:** Commit `feat: self-booked clients can file their assessment and Not ready request again (0048)`.

### Task 3: Sales-link clients skip the assessment

**Files:**
- Modify: `src/features/booking/BookingWizard.tsx`
- Test: `src/features/booking/BookingWizard.test.tsx`

**Interfaces:** Consumes `currentReferral(): string | null` from `src/data/referral.ts`.

- [ ] **Step 1: Failing tests:**
  - `sales link: no assessment questions` — set referral (`captureReferral({search:'?ref=abcd1234', hash:'', pathname:'/'})`), pick program `tourism`; assert no assessment question is rendered on Details and Next reaches Review.
  - `sales link: weak file still reaches payment` — referral set and a draft assessment that `readinessOf` marks not ready; assert step 4 (payment) shows and `submitReadinessRequest` / `saveAssessment` were not called.
  - `no link: weak file stops before payment` — no referral; same answers; assert the Not ready notice shows.
  - `sales link: program still required` — empty program shows the validation error.
- [ ] **Step 2:** `npx vitest run src/features/booking/BookingWizard.test.tsx`. Expected: the first two FAIL.
- [ ] **Step 3:** In `Wizard`, compute `const viaSales = currentReferral() !== null` once per mount. When `viaSales`: don't pass `onAssessment` to `DetailsStep` (hides the questions), treat `assessmentIncomplete` as false, skip `fileNotReady`, and skip `saveAssessment`.
- [ ] **Step 4:** Rerun the file, then `npm run typecheck && npm test`. Expected: all PASS.
- [ ] **Step 5:** Commit `feat: clients from a sales link book without the assessment`.

### Task 4: Verify in the browser
- [ ] Start the dev server; book with no link: questions show, weak answers end on the Not ready notice, and the request appears in Staff → Not ready.
- [ ] Open `/?ref=<a sales code>` in a fresh tab; book: no questions, straight to payment.
