# Consultant review approval — design (approved 2026-11-14)

## Why
Consultants choose which customer reviews appear on their own public profile (a testimonial showcase, accepted knowingly over an "honest rating" model), and they hear right away when a customer leaves feedback about them.

## Goals
- A new review is not public until its consultant approves it.
- Each consultant sees and decides only reviews about themselves.
- An in-site notification tells the consultant a new review arrived.

## Non-goals
- No manager or admin approval step.
- No email or WhatsApp notification to consultants. The notification is in-site only.
- No change to how customers submit reviews.

## Anti-goals
- The customer must never learn whether their review was approved or rejected.
- No review is ever deleted.

## Approaches considered
1. **Consultant manager approves all reviews** (a switch on a consultant account, like the sales manager in 0043). Dropped: the user chose self-approval.
2. **New "consultant manager" staff role.** Dropped: Mohamed Gamal is a consultant, and leaving the consultant role breaks his bookings, schedule and profile.
3. **Each consultant approves their own reviews (chosen).** It's the simplest choice, and the user accepted that it makes the reviews a curated showcase rather than a neutral rating.

## Behaviour (decided with the user)
- **Customer:** submits stars (1–5) and an optional comment after a completed consultation, as today. After submitting, and on every later visit, they see only: "Thank you for your feedback, we work our best to enhance our service." (needs an Arabic translation too). They are never shown their stars or comment again, or any status.
- **Consultant:** a new **Reviews** screen in the consultant staff area lists their own reviews in three tabs: Pending, On the site and Not shown. Each review has **Show on site** / **Don't show**, and a decision can be changed later. A badge shows the pending count.
- **Notification:** in-site only, reusing the finance payment-alert pattern (`src/features/staff/finance/paymentAlerts.tsx`): a pop-up card, a chime, a flashing tab title and an optional desktop notification while the staff workspace is open. Text: "A customer left feedback about you."
- **Public profile:** shows approved reviews that are also not hidden by an admin. The average and count include only those.
- **Existing reviews:** all set to pending when this ships.
- **Admin:** keeps the existing hide/restore override (0019) and can read every review.

## Builder's calls (stated, not user-decided)
- New migration: `consultant_reviews.status` (`pending` | `approved` | `rejected`, default `pending`), with every existing row set to `pending`. The public function filters on `status = 'approved' and not hidden`.
- A security-definer RPC `consultant_set_review_status(review_id, status)`. It raises FORBIDDEN unless the caller is the review's consultant (or admin), and it writes to `audit_log`.
- An RPC for the consultant's own reviews, so RLS or the RPC limits a consultant to rows where `consultant_id` matches their linked consultant.
- The notification detects new pending reviews the same way paymentAlerts detects new on-hold payments.
- `get_review` (customer) may keep returning the row, but the customer screen shows only the thank-you text.
- TDD: pgTAP tests for the permissions and the public filter; component tests for the consultant screen and the customer message.
