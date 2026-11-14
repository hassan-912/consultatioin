# Consultant Review Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customer reviews stay off the public site until the consultant they're about approves them, and the consultant gets an in-site alert when a new one arrives.

**Architecture:** A `status` column on `consultant_reviews` (migration 0044) controls what the public sees. Consultants read and decide their own reviews through two security-definer RPCs that check `current_consultant_id()`. The front end adds a consultant **Reviews** screen and a `NewReviewNotice` alert modelled on `NewPaymentNotice`. The customer card shows only a fixed thank-you message.

**Tech Stack:** Supabase Postgres (plpgsql RPCs, RLS, pgTAP run in the cloud dev project via MCP `execute_sql` — no Docker on this machine), React 19 + TypeScript, zustand, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-14-consultant-review-approval-design.md`

## Global Constraints

- Statuses are exactly `pending`, `approved` and `rejected`. New reviews default to `pending`, and every existing review becomes `pending`.
- Public = `status = 'approved' and not hidden`. This applies to the average, the count and the list.
- Customer copy (EN): "Thank you for your feedback, we work our best to enhance our service". It needs an AR translation in the i18n file. Never show the customer their status, stars or comment after submitting.
- Consultant alert copy (EN): "A customer left feedback about you". In-site only: no email or WhatsApp.
- Nothing is deleted. Every status change writes to `audit_log`.
- A consultant may only see or decide reviews where `consultant_id = current_consultant_id()`. Admin may do both for any review.
- Migrations are applied to the dev project only after the user OKs it. The project rule is to never delete existing data.

## Review Focus

1. A consultant calling the RPC with another consultant's review id must get FORBIDDEN, not a silent no-op (Task 1 pgTAP).
2. Finance, reception and sales calling the consultant RPCs must get FORBIDDEN (Task 1 pgTAP).
3. A consultant changing their mind (approved → rejected) must remove the review from the public average and count right away (Task 1 pgTAP).
4. A customer who already reviewed and reopens their link sees only the thank-you text, not their old stars (Task 3 test).
5. Opening the staff app must not announce reviews that were already pending, but the badge must still count them (Task 4 test).

---

### Task 1: Database — status column, consultant RPCs, public filter

**Files:**
- Create: `supabase/migrations/0044_review_approval.sql`
- Create: `supabase/tests/review_approval.test.sql`

**Interfaces:**
- Produces:
  - Type `public.review_status` = enum (`pending`, `approved`, `rejected`). Column `consultant_reviews.status review_status not null default 'pending'`, plus `update ... set status = 'pending'` for existing rows.
  - `public.consultant_my_reviews() returns jsonb` — an array of `{id, rating, comment, name, created_at, status, booking_ref}` for the caller's consultant, newest first. FORBIDDEN if `current_consultant_id()` is null.
  - `public.consultant_set_review_status(p_review_id uuid, p_status public.review_status) returns void` — FORBIDDEN unless the caller is admin or the review's consultant. NOT_FOUND for an unknown id. A no-op if the status is unchanged. Writes `audit_log` action `review-approved` / `review-rejected` / `review-pending`.
  - `public_consultant_reviews` (from 0018) is re-created with `and status = 'approved'` added to all three `not hidden` filters (0018 lines 83, 84 and 87).
  - `staff_reviews` (the admin list) also returns `status`.

- [ ] **Step 1: Write pgTAP tests** in `supabase/tests/review_approval.test.sql`, following the style of `supabase/tests/status.test.sql`. Assertions:
  - a newly submitted review has `status = 'pending'`, and the public function returns `count = 0`
  - consultant A approves their own review → public `count = 1`, `average = rating`
  - consultant A then rejects it → public `count = 0`
  - consultant B on A's review → `throws_ok(..., 'FORBIDDEN')`
  - finance, reception and sales roles → `throws_ok(..., 'FORBIDDEN')` on both RPCs
  - admin may set the status on any review
  - `consultant_my_reviews()` for A returns only A's reviews
  - an audit_log row exists with action `review-approved`
- [ ] **Step 2: Run the tests, before the migration exists, inside `begin; ... rollback;`** via MCP `execute_sql`. Expected: FAIL (type `review_status` does not exist).
- [ ] **Step 3: Write `0044_review_approval.sql`** with the interfaces above. Grant/revoke like 0019: revoke from public and anon, grant to authenticated and service_role. Use `security definer` and `set search_path = ''`.
- [ ] **Step 4: Run migration + tests inside one rolled-back transaction** via `execute_sql`. Expected: all pgTAP `ok`.
- [ ] **Step 5: Ask the user to OK applying 0044 to the dev project**, then apply with MCP `apply_migration`.
- [ ] **Step 6: Commit** `feat: reviews wait for their consultant's approval (0044)`.

### Task 2: Data layer — types and repo methods

**Files:**
- Modify: `src/domain/types.ts:153-172` (`Review`, `StaffReview`)
- Modify: `src/data/types.ts:89-126` (`BookingRepo`)
- Modify: `src/data/supabase.ts` (next to `getReview`, line ~209), `src/data/local.ts` (next to `getReview`, line ~129)
- Test: `src/data/repo.contract.test.ts`

**Interfaces:**
- Consumes: the Task 1 RPC names and JSON shape.
- Produces:
  - `export type ReviewStatus = 'pending' | 'approved' | 'rejected'` in `src/domain/types.ts`
  - `export interface ConsultantReview extends Review { id: string; status: ReviewStatus; bookingRef?: string }`
  - `StaffReview` gains `status: ReviewStatus`
  - `BookingRepo.myReviews(): Promise<ConsultantReview[]>`
  - `BookingRepo.setReviewStatus(reviewId: string, status: ReviewStatus): Promise<void>`
  - The local repo enforces the same rules: a new review is `pending`, `consultantReviews()` counts only approved and not hidden reviews, and a mismatched consultant gets `RepoError('FORBIDDEN')`.

- [ ] **Step 1: Add contract tests:** `'new review is pending and not public'`, `'consultant approves own review -> public count 1'`, `'consultant cannot set status on another consultant review -> FORBIDDEN'`.
- [ ] **Step 2: Run** `npx vitest run src/data/repo.contract.test.ts`. Expected: FAIL (`myReviews is not a function`).
- [ ] **Step 3: Implement** the types and both repo adapters (supabase: `rpc('consultant_my_reviews')`, `rpc('consultant_set_review_status', { p_review_id, p_status })`, mapping errors as the existing review methods do).
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat: repo methods for consultant review approval`.

### Task 3: Customer card shows only the thank-you message

**Files:**
- Modify: `src/features/reviews/Reviews.tsx:51-59` (the `existing` branch of `ReviewCard`)
- Modify: the i18n EN and AR dictionaries (where `review.thanks` lives): add the key `review.thanksEnhance`
- Test: `src/features/reviews/Reviews.test.tsx` (create if it doesn't exist)

- [ ] **Step 1: Write the tests:** `'after submitting, shows only the thank-you text'` and `'reopening a reviewed booking shows no stars or comment'`. The second asserts that the thank-you text is present and that `queryByRole('img', { name: /stars/i })` and the old comment text are both null.
- [ ] **Step 2: Run** `npx vitest run src/features/reviews`. Expected: FAIL.
- [ ] **Step 3: Replace the `existing` branch** with one heading `t('review.thanksEnhance')`. EN value: "Thank you for your feedback, we work our best to enhance our service". AR: "شكرًا على رأيك، نعمل بكل جهدنا لتحسين خدمتنا".
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: customers see one thank-you message after reviewing`.

### Task 4: Consultant Reviews screen and new-review alert

**Files:**
- Create: `src/features/staff/consultant/MyReviews.tsx`
- Create: `src/features/staff/consultant/reviewAlerts.tsx`
- Modify: `src/features/staff/StaffApp.tsx` (add `reviews: () => <MyReviews />` next to line 53, add a nav entry for the consultant role, and mount `<NewReviewNotice />` beside `<NewPaymentNotice />`)
- Modify: the i18n EN and AR dictionaries (keys under `staff.reviews.*`)
- Test: `src/features/staff/consultant/MyReviews.test.tsx`

**Interfaces:**
- Consumes: `repo.myReviews()` and `repo.setReviewStatus()` from Task 2. `Stars` from `src/features/reviews/Reviews.tsx`. `chime`, `flashTitle` and `desktopNotify` from `src/features/staff/finance/paymentAlerts.tsx` (export them if they aren't exported).
- Produces:
  - `MyReviews()`: three tabs, `Pending` / `On the site` / `Not shown`. Each card has stars, the comment, the first name, the date and the booking ref, plus the buttons `Show on site` (→ approved) and `Don't show` (→ rejected). Each button appears only when it would change the status.
  - `useMyReviews()`: polls `repo.myReviews()` every 60 s while the consultant workspace is open. It returns `{ reviews, pendingCount, reload }`.
  - `ReviewBadge()`: shows the pending count on the nav entry.
  - `NewReviewNotice()`: the first snapshot only seeds the seen ids (same rule as `NewPaymentNotice`). A later pending id fires the pop-up card "A customer left feedback about you", plus the chime, the tab flash and the desktop notification. Clicking it goes to the reviews screen.

- [ ] **Step 1: Write the tests:**
  - `'lists only pending reviews under Pending'`
  - `'Show on site calls setReviewStatus(id, "approved") and moves it to On the site'`
  - `'first load does not pop up for reviews already pending, but the badge shows their count'`
  - `'a new pending review after load shows "A customer left feedback about you"'` (use fake timers to advance 60 s)
  - `'non-consultant roles do not see the Reviews nav entry or the notice'`
- [ ] **Step 2: Run** `npx vitest run src/features/staff/consultant/MyReviews.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** `MyReviews.tsx` and `reviewAlerts.tsx`, then wire them into `StaffApp.tsx`.
- [ ] **Step 4: Run** the same command, then the full `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat: consultants approve their own reviews and get an in-site alert`.

### Task 5: Admin list shows status, end-to-end check

**Files:**
- Modify: `src/features/staff/admin/ReviewsAdmin.tsx` (add a status chip per review; keep the hide/restore button)
- Test: the existing admin test, if there is one, else add one assertion to `MyReviews.test.tsx`: `'admin sees status chip'`

- [ ] **Step 1: Write the test** asserting the chip text `Pending` / `On the site` / `Not shown`.
- [ ] **Step 2: Run** it. Expected: FAIL. **Step 3: Implement** the change. **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Browser check** on the dev server. As a customer, review a completed booking and see the thank-you text only. As that consultant, see the pop-up and badge, approve the review, and confirm it now shows on the public profile. Then reject it and confirm it's gone. Take a screenshot as proof.
- [ ] **Step 6: Commit** `feat: admin review list shows approval status`.
