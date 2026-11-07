# EasyKash online payment: design

Date: 2026-11-07 · Branch: `feat/supabase` · Status: draft, waiting for approval

## Decisions (from the user)

| Question | Answer |
|---|---|
| Payment options shown | Instant only: cards (2), mobile wallet (4), Meeza (6), Apple Pay (31). No Fawry/Aman cash, no installments. |
| Confirmation | Automatic when a signed PAID callback matches the booking's amount. Anything else goes to finance. |
| Manual methods | Removed. EasyKash is the only way to pay. |
| Account readiness | Unknown. Build and test without live keys; the user checks with EasyKash before going live. |
| Currencies | The customer pays in **EGP, USD, EUR or AED** (added 2026-11-07). |

## Currencies

- **Choosing a currency:** the payment step shows four currency tabs: EGP, USD, EUR, AED. The default follows the phone number: +20 → EGP, +971 → AED, anything else → USD. The customer can switch.
- **The price:** consultation prices are set in EGP. The foreign amount is the EGP price converted at the day's rate and rounded up to a whole unit, the same way the payment step shows equivalents today. **The server works out the amount** (`easykash-pay` fetches the rate itself and keeps it on the attempt), so a customer can't change what they're charged.
  - Decided 2026-11-07: live rate (not a fixed price list).
- **What EasyKash does with it:** the Pay API takes `amount` + `currency` (EGP, USD, EUR and AED are all supported). Per EasyKash's docs the buyer is then **charged in EGP at the exchange rate at the moment of payment**, and MG receives EGP. A customer who picks USD sees and agrees to the USD price, but their card statement may show EGP (their bank converts it).
  - **To be confirmed with EasyKash:** whether the account can settle in USD/EUR/AED, or only EGP.
- **Amount check:** the attempt stores the currency and amount sent. A callback is accepted when it is signed, `PAID`, and its `customerReference` matches an attempt we created. Its `Amount` must equal the EGP amount for EGP attempts. For foreign-currency attempts, EasyKash may report the converted EGP amount, so we accept it within ±5% of (amount × the rate we stored) and send anything outside that to finance as `wrong-amount`. The first live test settles which unit EasyKash reports, and the tolerance is tightened after that.

## EasyKash API (from easykash.gitbook.io)

- **Pay:** `POST https://back.easykash.net/api/directpayv1/pay`, header `authorization: <API key>`. Body: `amount`, `currency`, `paymentOptions`, `name`, `email`, `mobile`, `redirectUrl`, `customerReference`. Returns `{ redirectUrl: "https://www.easykash.net/DirectPayV1/<productCode>" }`.
- **Redirect back to us:** `?status=success|pending|failed&providerRefNum&customerReference`. These values are **not signed**, so they are used only to show a "checking your payment" screen, never to confirm anything.
- **Callback:** sent after each successful payment with `status = PAID`, signed with HMAC-SHA512 over `ProductCode Amount ProductType PaymentMethod status easykashRef customerReference`. The existing `easykash-webhook` function already verifies and stores these (migration 0028).
- **Inquiry:** `POST https://back.easykash.net/api/cash-api/inquire` with `{ customerReference }`. Returns status `NEW|PAID|FAILED|EXPIRED|...`, `Amount` and `easykashRef`. This is a fallback if a callback is late or lost.

## Flow

1. The customer reserves a slot, as today. The booking is `reserved` with a 30-minute hold.
2. On the payment step the customer sees the amount and one button, **"Pay online"**, with the card/wallet/Meeza/Apple Pay logos.
3. The button calls a new Edge Function, **`easykash-pay`**, with the booking's manage token. The function:
   - loads the booking (it must be `reserved` with an open hold),
   - creates a row in a new table, **`easykash_attempts`**: id, booking_id, customer_reference (unique, `<booking reference>-<n>`), amount, currency, status `started`, created_at,
   - extends the hold by 15 minutes once per booking, so the customer isn't cut off while on EasyKash's page,
   - calls the Pay API with the server-side `EASYKASH_API_KEY`, `paymentOptions: [2, 4, 6, 31]` and `redirectUrl = SITE_URL/#/pay/return`,
   - returns EasyKash's `redirectUrl`. The browser navigates there.
4. The customer pays on EasyKash's page and is sent back to `/#/pay/return?...`. That page shows "Confirming your payment…" and polls the booking's status every few seconds (up to about 2 minutes), then opens the ticket.
5. EasyKash calls `easykash-webhook`. After the signature check, the function stores the callback (as it does today) and then calls a new SQL function, **`apply_easykash_payment(easykash_ref)`**. In one transaction it:
   - finds the attempt by `customerReference`. If there's no match, it only keeps the callback for finance to look at.
   - checks `status = 'PAID'` and `Amount` = the attempt's amount (compared as numbers),
   - if the booking is still `reserved` (or on its extended hold) and the slot is still free → records a payment (method `easykash`, txn_ref = easykashRef) and moves the booking straight to **`confirmed`**, which triggers the existing ticket email,
   - if the hold has expired but the slot is still free → confirms anyway (the money was taken),
   - if the slot is gone or the amount differs → moves the booking to **`late-transfer`** / **`wrong-amount`** (existing statuses) so finance can refund or rebook,
   - is idempotent: a repeated callback (same `easykash_ref`) does nothing the second time.
6. **Fallback:** if the return page times out with no callback, it calls `easykash-pay` in "check" mode. That runs the Inquiry API server-side and, if the result is PAID, feeds it through the same `apply_easykash_payment`. The cron job that expires holds skips bookings with a `started` attempt younger than 45 minutes.

## Changes

| Area | Change |
|---|---|
| DB migration 0029 | `easykash_attempts` table (RLS on, no direct client access); `payment_method` gains `easykash`; `apply_easykash_payment(ref)` (service role only); hold-expiry cron skips bookings with a live attempt; audit entries for every automatic confirm/flag. |
| Edge Function `easykash-pay` (new) | Start a payment and check-status mode. Customer-facing, so: manage-token auth, rate limit, no staff session. Secrets: `EASYKASH_API_KEY`, `SITE_URL`. |
| Edge Function `easykash-webhook` | After recording, call `apply_easykash_payment`. Still returns 200 on duplicates. |
| `src/config/payments.ts` | Remove InstaPay, Vodafone Cash and both bank accounts. Add a single `easykash` method. |
| `PaymentStep.tsx` | Replace the method picker, transaction number and receipt upload with an amount summary and a "Pay online" button; error states (EasyKash unavailable, hold expired). |
| New `PayReturnPage` | `/pay/return`: polls, then shows the ticket or "payment not received yet" with a retry. |
| Finance screens | EasyKash payments are shown as auto-verified (no approve button). Flagged ones (`late-transfer`, `wrong-amount`) show the EasyKash reference for a refund. |
| Prototype/demo mode | A fake EasyKash: "Pay online" goes to a local mock page with Pay / Fail buttons, so the demo and tests work without keys. |
| Tests | Unit tests for the pay function (bad token, expired hold, API error), the webhook → apply path (paid, duplicate, wrong amount, slot taken, unknown reference) and pgTAP for `apply_easykash_payment`; UI tests for the payment step and return page. |

## Before go-live (user)

1. Ask EasyKash support to enable **Direct Payment** and the four payment options.
2. From EasyKash's Integration Settings, copy the **API Key** and **HMAC Secret** into Supabase function secrets `EASYKASH_API_KEY` and `EASYKASH_HMAC_SECRET` (do not paste them in chat).
3. Set the **Callback URL** there to the `easykash-webhook` function URL.
4. Make one small real payment end to end, then refund it.

## Risks and open points

- **Customers abroad:** they can pick USD, EUR or AED, but EasyKash still charges in EGP behind the scenes. Foreign cards may be declined by some Egyptian acquirers, so test with a non-Egyptian card before go-live.
- **No sandbox:** EasyKash doesn't document a test environment, so the first live test uses real money.
- **Fees:** EasyKash's fee is taken from the amount received. Prices are unchanged.
- **Old bookings:** bookings already `on-hold` with manual receipts keep their current finance review path.
