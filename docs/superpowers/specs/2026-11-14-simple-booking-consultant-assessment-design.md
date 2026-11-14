# Simple booking, consultant-led assessment — design (approved 2026-11-14)

## Why
Anyone can book a consultation without being judged by a score. The consultant does the assessment, then hands the client their result on WhatsApp, which makes the follow-up easy.

## Decisions (user)
1. **Booking form:** name (required), phone (required), email (optional). No assessment questions, no program, no channel and no note on the customer side. Everyone goes straight to payment.
2. **Not ready clients: removed.** The screen, the "sales manager" switch and the readiness rules leave the app. Existing database rows stay (standing rule: never delete existing data); the public submit RPC is closed.
3. **Consultant assessment:** the client card on the consultant Overview gets an **Assessment** button, which opens the existing assessment questions for the consultant to fill in (they choose the program first). The score ring and the staff report show it as today.
4. **WhatsApp:** after the next step is **Will sign a contract** or **Thinking about it**, a **Send assessment on WhatsApp** button opens wa.me with a ready message containing the client's assessment link. First time only: after sending it shows "Sent ✓ <date>". Later contact goes through the existing follow-up reminders.
5. **Client link, both ways:** a direct link `#/booking/<manageToken>/assessment` opens the client-facing report, and the booking (ticket) page shows a **Your assessment** section once one exists.

## Non-goals
- Automatic WhatsApp sending (needs the paid WhatsApp Business API).
- The Google review button.
- Deleting any stored readiness or assessment data.

## Builder's calls
- Migration 0045:
  - `staff_save_assessment(booking_id, program, answers)` for the booking's consultant or an admin, with the same validation as 0020 `save_assessment`.
  - `get_my_assessment(manage_token)` for the customer, returning `{program, answers}` or null.
  - `bookings.assessment_sent_at timestamptz` and `staff_mark_assessment_sent(booking_id)`. These are idempotent: only the first call stamps and audits.
  - Revoke execute on `submit_readiness_request` from anon and authenticated.
- `customer.program` becomes optional in the app (the DB column is already nullable). The `channel` defaults to WhatsApp.
- The client report is built from the assessment alone (`buildAssessmentReport`), following the structure of `buildConsultationReport`.
- The customer's `save_assessment` (0020) stays in the DB, unused by the app.
