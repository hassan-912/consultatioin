# Simple Booking & Consultant Assessment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Customers book with name/phone/email only. Consultants fill in the assessment and send the client a link to it on WhatsApp once.

**Architecture:** Migration 0045 adds staff-side assessment saving, a customer read of their own assessment, and a first-send stamp. The front end strips the booking form, removes the readiness/Not-ready feature from the UI, adds the consultant assessment editor, a customer assessment route, and a send button in the next-step panel.

**Tech Stack:** Supabase Postgres + pgTAP (run in a rolled-back tx via MCP execute_sql), React 19 + TS, zustand, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-14-simple-booking-consultant-assessment-design.md`

## Global Constraints
- Required fields: name (≥3 chars, as today) and phone. Email is optional but validated when present.
- Never delete existing data. The readiness tables stay; only the UI and the public submit RPC go.
- Staff assessment saving: the booking's own consultant or an admin. Anyone else gets FORBIDDEN.
- The WhatsApp send is offered only when the next step is `will-sign` (contract) or `thinking`, and only until the first send.
- All new copy needs EN and AR translations.

## Review Focus
1. A consultant saving an assessment for another consultant's booking → FORBIDDEN (Task 1 pgTAP).
2. Customer link for a booking with no assessment yet → a friendly "not ready yet" page, not a crash (Task 5 test).
3. Second press of send (or another tab) → no second stamp or audit, and the UI shows Sent (Task 1 pgTAP + Task 6 test).
4. Old bookings whose `program` is set and assessment came from the customer still show the ring and report (Task 4 test).
5. Booking with an email that's empty vs invalid → empty passes, invalid blocks (Task 2 test).

---

### Task 1: Migration 0045
**Files:** Create `supabase/migrations/0045_consultant_assessment.sql` and `supabase/tests/consultant_assessment.test.sql`.
**Produces:**
- `staff_save_assessment(p_booking_id uuid, p_program text, p_answers jsonb) returns void`: upserts into `booking_assessments` (sets `updated_at`), with 0020's program/answers validation, and audits `assessment-saved`.
- `get_my_assessment(p_manage_token text) returns jsonb`: `{program, answers}` or null; calls `assert_customer_access()`; anon + authenticated.
- `bookings.assessment_sent_at timestamptz`.
- `staff_mark_assessment_sent(p_booking_id uuid) returns timestamptz`: stamps only if null, audits `assessment-sent` once, and returns the stamp.
- `revoke execute on function submit_readiness_request(jsonb) from anon, authenticated`.
- [ ] pgTAP tests: own consultant saves → OK and a row exists; another consultant → FORBIDDEN; finance → FORBIDDEN; admin → OK; bad program → INVALID_INPUT; `get_my_assessment` returns the program; mark-sent twice → same timestamp and one audit row; anon `submit_readiness_request` → 42501.
- [ ] RED without the migration, then GREEN with it, in one rolled-back transaction.
- [ ] Commit `feat: consultants save assessments; clients read their own (0045)`.

### Task 2: Simple booking form, no score check
**Files:** `src/features/booking/steps/DetailsStep.tsx`, `src/features/booking/shared.tsx` (`validateDetails`), `src/features/booking/BookingWizard.tsx` (remove readiness, `NotReadyNotice` and assessment gating), delete `src/features/booking/NotReadyNotice.tsx`, plus the review step if it shows program/channel/note. Tests: `src/features/booking/*.test.tsx` and the existing wizard tests in `src/App.test.tsx`.
- [ ] Tests: `'details step shows only name, phone and email'`; `'empty email is allowed, invalid email blocks'`; `'a booking with no program reaches payment'` (the former low-score path now proceeds).
- [ ] Implement: `validateDetails` drops the program rule; the form renders three fields; `channel` defaults to `'whatsapp'`.
- [ ] Update or remove old tests that asserted program, assessment or not-ready behaviour (ledger each).
- [ ] Commit `feat: book with name, phone and email only`.

### Task 3: Remove Not ready clients
**Files:** `src/features/staff/permissions.ts` (drop `notReady` and the `salesManager` argument), `StaffApp.tsx`, delete `src/features/staff/sales/NotReady.tsx`, `StaffAccounts.tsx` (the sales-manager switch), `src/store/staffAdmin.ts` and `liveAuth.ts` references, i18n keys, and the data-layer readiness methods if nothing else uses them.
- [ ] Test: `'no role sees a Not ready clients menu entry'`.
- [ ] Remove, run `npx tsc --noEmit` and the whole suite, then commit `feat: remove Not ready clients`.

### Task 4: Consultant fills the assessment
**Files:** Create `src/features/staff/consultant/AssessmentEditor.tsx`. Modify the `ConsultantOverview.tsx` card (add the **Assessment** button) and `ClientFile.tsx` (add the button too). Modify `src/data/types.ts`, `local.ts` and `supabase.ts` to add `staffSaveAssessment(bookingId: string, a: StoredAssessment): Promise<void>`.
- The editor is a dialog with a program picker (`tourism` / `immigration` / `job-seeking`) plus `AssessmentQuestions`, pre-filled from the stored answers, with Save.
- [ ] Tests: `'consultant fills the assessment from the overview card and the ring shows a score'`; `'existing customer-filled assessment is pre-filled'`; local repo `staffSaveAssessment` by another consultant → FORBIDDEN.
- [ ] Commit `feat: consultants fill the client assessment`.

### Task 5: Client assessment link and ticket section
**Files:** Create `src/features/ticket/AssessmentPage.tsx` (route `/booking/:token/assessment` in `src/App.tsx`) and `src/assessment/report/assessmentReport.ts` with `buildAssessmentReport(b: Booking, r: AssessmentResult): ClientReportProps`. Modify `BookingPage.tsx` to add the **Your assessment** section. Repo: `myAssessment(manageToken: string): Promise<StoredAssessment | null>`.
- [ ] Tests: `'the assessment link shows the client report'`; `'no assessment yet shows a friendly message'`; `'booking page shows Your assessment once it exists'`.
- [ ] Commit `feat: clients open their assessment from a link or their ticket`.

### Task 6: WhatsApp first-time send
**Files:** `NextStepPanel.tsx` (the button), `Booking.assessmentSentAt?: number` in the domain types and mappers, repo `markAssessmentSent(bookingId: string): Promise<number>`, plus the message text in EN and AR (it includes the client's first name and the link `${VITE_SITE_URL origin}/#/booking/<manageToken>/assessment`).
- The button opens `whatsappLink(phone, text)` and calls `markAssessmentSent`. After that the panel shows "Sent ✓ <date>" and no button.
- [ ] Tests: `'after Thinking about it, Send assessment on WhatsApp opens wa.me with the link'`; `'after sending it shows Sent and no button'`; `'no button for refund'`.
- [ ] Commit `feat: send the client their assessment on WhatsApp once`.

### Task 7: Review, apply, deploy
- [ ] Whole-branch review. Run the browser check on the dev server. Ask the user, then apply 0045 and push.
