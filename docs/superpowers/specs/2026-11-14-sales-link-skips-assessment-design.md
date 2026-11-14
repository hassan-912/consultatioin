# Two booking routes: self-booked clients take the assessment, sales-link clients skip it

## Intent
Clients who find us on their own must pass the file assessment before paying, as they did before
commits `57e0bd5` and `60ee963`. Clients a salesperson sends already have someone handling them, so
they book with no assessment at all.

## Goals
- Self-booked route: restore the program questions, the readiness check, the "Not ready" stop
  (no payment, request goes to the sales manager), the "Not ready" list and the admin rules screen,
  exactly as before.
- Sales route: a client with a valid sales code (`currentReferral()`, `?ref=` link, kept 30 days)
  sees no assessment questions, gets no readiness check, and goes straight to review and payment.

## Non-goals
- No server-side enforcement. As before, the check runs in the browser; bypassing it only means
  paying for a consultation.
- No new database columns: the booking already records the referral code.
- No per-salesperson on/off switch; the link itself is the switch.

## Approaches
- **A (picked):** revert `57e0bd5` and `60ee963`, resolve conflicts with later commits, then add the
  sales-code condition in the booking wizard. Reuses tested code and its tests.
- B: rebuild by hand. Slower and riskier, with no benefit.

## Decisions
- A sales code stays valid for its full 30 days, so a returning client from that link still skips.
- Restored behaviour is identical to the pre-removal code (user: "as before").

## Left to the builder
- How conflicts with later commits (i18n, permissions, store, liveAuth) are resolved, keeping both sides.
- Tests: restored tests pass, plus new tests for "sales code → no questions, no check" and
  "no code → questions and Not ready stop".
