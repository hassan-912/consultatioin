# Security review — 7 Nov 2026

Scope: the live booking site (consultatioin.vercel.app), its Supabase database, the Edge Functions and the EasyKash payment flow. The review followed the OWASP Top 10 and ASVS areas (access control, injection, authentication, security configuration, vulnerable components, integrity of payments) and Supabase's own security advisors.

## Fixed

| # | Risk | What could happen | Fix | Status |
|---|---|---|---|---|
| 1 | **Fake payment** | Anyone with a booking link could call the retired `submit_payment` directly and move the booking to "paid, under review" with a made-up transaction number, which also blocked the slot. | Public access revoked; receipt uploads closed too (migration 0035). | Tested; **waiting for your approval to apply** |
| 2 | **Slot hoarding** | Reservations were limited per phone number only, so rotating fake numbers could hold every slot. | Also limited per connection: 15 reservations per 10 minutes (0035). | Tested; **waiting for approval** |
| 3 | **Booking-lookup brute force** | "Find my booking" was limited per reference and phone, not per connection. | 30 lookups per 10 minutes per connection (0035). | Tested; **waiting for approval** |
| 4 | **Payment API abuse** | The payment-status check had no limit, so it could be used to exhaust EasyKash's API. | 40 checks per 10 minutes per booking (0035). | Tested; **waiting for approval** |
| 5 | **5 EGP test consultant** | Anyone who found its link could book a 5 EGP consultation. | Switched off (no bookable hours, 0035). | Tested; **waiting for approval** |
| 6 | **No browser security headers** | Injected scripts or a fake page framing the site (clickjacking) weren't blocked by the browser. | `vercel.json`: strict Content-Security-Policy, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP, HSTS. Checked on a production build: no violations. | **Live** |
| 7 | EasyKash amount check | A small booking plus EasyKash's minimum fee was treated as a wrong amount. | Fee-aware check (0032, 0034). | **Live** |
| 8 | EasyKash return status | The customer's return link isn't signed, and was being misread. | Never trusted; read only for wording (1f37abd). | **Live** |

## Checked and sound

- **Payments.** EasyKash callbacks are HMAC-SHA512 verified with a constant-time compare. The amount is set on the server, never by the browser. A payment is applied once (unique EasyKash reference). Payment-inquiry results come straight from EasyKash's API with our key. The background check needs a shared secret.
- **Accounts and roles.** Every staff function checks the caller's role inside the database: admin-only actions use `require_admin()`, and finance, reception, consultant and sales are each limited to their own actions. You can't demote or deactivate yourself. Sign-ups get no access until an admin approves them (requests are capped at 200).
- **Data access.** Row-level security is on for every table. Signed-in users get read-only access filtered by role, and the public has no direct table access. Booking tokens are hidden from staff, and receipts storage is private (finance and admin only).
- **Customer access.** Every customer action needs the booking's random 32-character token. Staff sessions can't use customer functions.
- **Injection.** Database functions use fixed `search_path` and parameters (no dynamic SQL from input). React escapes everything on screen, and the only raw HTML is the QR code a library generates from our own value. The ticket email escapes every customer value, and meeting links must be `https://`.
- **Secrets.** There are no secret keys in the website build or the git history. The service-role and EasyKash keys exist only as Supabase function secrets.
- **Dependencies.** `npm audit` reports 0 vulnerabilities.
- **Edge Functions.** `easykash-pay`, `create-receipt-upload` and `invite-staff` accept only this site's origin and the public key, never a staff token passed through. `invite-staff` verifies the caller is an active admin. `send-ticket-email` requires its shared secret.

## Needs you (dashboard settings I can't change from here)

1. **Supabase → Authentication → Passwords:** turn on **leaked-password protection** (flagged by Supabase's advisor) and set a minimum length of at least 10.
2. **Supabase → Authentication → Multi-factor:** enable **MFA (TOTP)**, and turn it on for every admin account.
3. **Supabase → Authentication → URL configuration:** the redirect allow-list should only contain `https://consultatioin.vercel.app/**`.
4. **EasyKash:** refund the two 11 EGP test payments (MG-CD23-9X5E, MG-ANTZ-P5DD).
5. **Approve migration 0035.** It's tested; applying it closes items 1–5.

## Accepted / later

- **`pg_net` in the public schema** (advisor warning). Moving it means dropping and recreating it under the running email and payment jobs. Its functions stay in the `net` schema and aren't callable by the public. Plan it with a maintenance window.
- **pgTAP** is still installed on the live database for tests. It isn't reachable by the public. Drop it at final go-live.
- **"Public can execute SECURITY DEFINER function"** advisor warnings are by design: these are the customer and staff functions above, each with its own token or role check.
- **Live data:** the site runs on the same Supabase project as development, and test bookings exist. Clean them up before marketing the site.
