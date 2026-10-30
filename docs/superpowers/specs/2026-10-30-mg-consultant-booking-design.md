# MG International — Consultant Directory & Booking Prototype

**Date:** 2026-10-30
**Status:** Design approved in conversation — awaiting written-spec review
**Deliverable:** Clickable bilingual (العربية / English) prototype. React codebase in this folder, also published as a private claude.ai artifact for stakeholder review. No real payments or bookings.

---

## 1. Intent

**Outcome.** MG International stakeholders can walk through the full customer journey (find consultant → profile → book → pay → ticket) and the main staff screens on a phone, in either language, and see every operational decision still open.

**Success criteria**
- Every flow completes end-to-end in Arabic (RTL) and English (LTR) with no dead ends.
- Switching language never loses filters or booking progress.
- Nothing about a consultant is invented: missing data shows a labelled placeholder; all statistics and schedules carry **Demo data / بيانات تجريبية**.
- Unresolved operational decisions are visible on a **Pending decisions** board and live in config, not code.

**Out of scope (next step, before production):** real payment links/wallet numbers, real schedules, KPI definitions, policies (cancellation, refund, reschedule, lateness, no-show), meeting platform, reminder channels, CRM/calendar integrations, backend, real auth.

## 2. Content rules

- **Branches (3):** Nasr City, Sheikh Zayed, Dubai — addresses, hotline 17621 and Info@mg-visa.com as given in the brief.
- **Consultants (7):** Nasr City — Mohamed Gamal (5 yrs, *Senior Immigration Specialist & Contract Manager*), Ahmed Salama (3+), Ahmed Khalil (1.5), Mohamed Esmail (2; spelling editable, flagged "spelling to confirm" in admin). Sheikh Zayed — Ahmed Tarek (3), Mohamed Salah (1.5). Dubai — Mohamed Abdelaziz (2).
- **Removed entirely:** Qena branch and Wael — not in data, filters, maps or booking.
- **Placeholders (labelled, bilingual):** photo (initials avatar, "Photo pending / الصورة قيد الإعداد"), biography ("Biography under processing / النبذة قيد الإعداد"), title (all except Mohamed Gamal), intro video ("Video pending" player with caption + control UI), specializations, languages, qualifications.
- **Programs (from mg-visa.com):** Investment, Employment, Job Seeking, Education, Tourism, Immigration. **Countries:** Australia, Canada, New Zealand. Assignment of programs to consultants is demo data until supplied.
- **Feedback:** "No verified feedback yet". The testimonials on mg-visa.com appear to be theme placeholder text and are **not** reused.
- **Footer:** branches, hotline, email, Facebook / TikTok / Instagram links from the brief.

## 3. Visual identity

- **Direction:** premium travel consultancy — private-bank / premium-airline calm, rich detail, not flashy.
- **Colour tokens:** slate `#2D3845` (primary surfaces/buttons), deep slate `#222D35`, mist `#9FAEBE`, navy `#0C2B59` (links), champagne gold `#C9A86A` used sparingly (primary CTA accent, score highlights, ticket details). Status colours only for status: green confirmed, amber on hold / under review, red rejected/expired. All pairs WCAG AA.
- **Type:** Changa (headings, both scripts); Mulish (English body); IBM Plex Sans Arabic (Arabic body). Western digits in both languages; phone numbers, emails and references isolated as LTR (`dir="ltr"` / `<bdi>`).
- **Logo:** official MG monogram file downloaded from mg-visa.com.
- **Signature elements**
  - Hero: deep slate with animated flight-path arcs from Cairo/Dubai to Canada, Australia, New Zealand; filter bar overlaid.
  - Consultant cards: large portrait, layered depth, hover lift, inline row of available slots, tidy stat tiles.
  - Booking: animated stepper, sticky mobile summary bar (consultant · duration · price · Continue), bottom-sheet filters on mobile.
  - **Boarding-pass ticket:** perforated tear line, "From: <branch> → To: Your consultation", QR stub, downloadable.
  - Motion via Framer Motion (page transitions, count-ups, skeletons); disabled under `prefers-reduced-motion`.
  - Staff UI: denser, sidebar + tables + status chips, same brand.
- Touch targets ≥ 44px.

## 4. Architecture

- **Stack:** Vite + React + TypeScript, Tailwind CSS using logical properties (`ms-`, `pe-`, `start-`) so RTL flips automatically; Framer Motion; `qrcode` for QR; `Intl` for timezone formatting.
- **Routing:** `HashRouter` (works inside a single-file artifact).
- **State:** one store (Zustand) holding `lang`, directory filters, booking draft and the demo booking database; persisted to `sessionStorage` so language switch and reload keep progress.
- **i18n:** typed dictionaries `en.ts` / `ar.ts` with identical keys (compile-time completeness check). `<html lang dir>` updates on switch.
- **Config (data, not code)**
  - `config/branches.ts`, `config/consultants.ts`, `config/programs.ts`
  - `config/booking.ts` — durations per format, buffers, hold deadline, prices, currency
  - `config/payments.ts` — one shared payment config for all branches
  - `config/kpi.ts` — score scale, approval-rate minimum sample
  - `config/pendingDecisions.ts` — every unresolved operational decision, rendered on the admin board
  - `demo/schedule.ts` — generated demo calendars, bookings, stats (all flagged demo)
- **Build:** normal Vite build for the repo; `vite-plugin-singlefile` build for the artifact.

## 5. Screens

### Customer (no account)
1. **Directory `/`** — hero; filters: branch, program, format (online / in-person), date. Cards show: photo, name, title, branch, years of experience, main programs, total completed consultations, completed this month, KPI score `x / 10`, availability for selected date + format, **Next available appointment / أقرب موعد متاح**, **View profile / عرض الملف الشخصي**, **Book consultation / احجز استشارة**.
2. **Profile `/consultant/:id`** — photo, title, biography placeholder, video player (captions, controls), programs & destination countries, languages & qualifications (placeholders), totals + monthly activity, KPI score `x / 10` (10-segment bar, no explanation text), verified feedback (empty state), approval statistics block (hidden below min sample, with method note — see §6.6), appointment calendar, sticky Book button.
3. **Booking `/book/:id`** — 5 steps: format → date/time/duration → details → review → payment. In-person bookings show the branch address and a map card (styled map + "Open in Google Maps" link; no embedded iframe, which artifact sandboxes may block). Online bookings state that a private meeting link is provided after confirmation.
4. **Booking page `/booking/:token`** — private manage link: status, ticket, reschedule, cancel, book again, **Join consultation / انضم للاستشارة** for confirmed online bookings.
5. **Ticket `/ticket/:token`** — boarding-pass ticket, download.
6. **Find my booking `/find`** — reference + phone.

### Staff `/staff` (demo role switcher, no real auth)
- **Finance:** payment review queue → Verify / Reject (with reason) / Wrong amount / Duplicate / Late transfer.
- **Reception:** check-in — QR scan (camera with fallback) or reference search; today's arrivals; attendance.
- **Consultant:** own calendar, own bookings, consultation records, application outcomes entry.
- **Admin:** consultant profile editing; availability rules (hours, breaks, buffers, holidays, leave, unavailable dates, booking limits); all bookings; payment-method config; KPI settings; audit history; **Pending decisions** board.

### Demo panel (prototype only)
Floating panel to act out states: "Finance verifies payment", "Finance rejects", "Skip time → reservation expires", "Mark completed / no-show", "Reset demo". Clearly labelled as prototype tooling.

## 6. Booking & payment rules

### 6.1 Customer details collected
Name; phone with country code (required); **email (required)**; preferred confirmation channel (**Email / WhatsApp**); consultation language; program of interest; optional short note (max 300 chars). Nothing else.

### 6.2 Status model
```
Reserved (awaiting payment) ──submit transfer ref──▶ On hold – payment under review ──finance verifies──▶ Confirmed
        │                                                  │                                          │
        └─deadline passes─▶ Expired                        ├─▶ Rejected (reason; may resubmit before deadline)
                                                           ├─▶ Wrong amount (pay difference / refund pending policy)
                                                           ├─▶ Duplicate (flagged for refund)
                                                           └─▶ Late transfer (rebook if slot free, else refund pending policy)
Confirmed ──▶ Checked in ──▶ Completed      Confirmed ──▶ No-show      Any pre-completion ──▶ Cancelled
```

### 6.3 Ticket lifecycle
- On submitting the transaction reference (+ optional receipt), the customer **immediately receives the ticket** marked **On hold – Payment under review / معلّق – الدفع قيد المراجعة** (amber banner/watermark). The on-hold ticket is **not valid for entry**; the scanner shows it as on hold.
- When finance verifies, the ticket switches to **Confirmed / تم تأكيد الحجز** and is sent to the customer via their chosen channel: **email (Gmail)** or **manually via WhatsApp** by staff (staff screen gives a prefilled WhatsApp message + "mark as sent"). Prototype simulates sending; no real messages.
- A receipt screenshot never confirms by itself. Automatic confirmation is a config flag, **off**, enabled only after a verified payment integration.

### 6.4 Slot holding & availability
- Booking reference generated on entering the payment step; slot held until the reservation deadline (config; demo 30 min) with visible countdown.
- One timeline per consultant across both formats. Available = working hours − breaks − holidays/leave/unavailable dates − held/confirmed bookings, with buffer before/after.
- Durations: online 15 / 30 min; in-person 30 / 45 min (config).

### 6.5 Time zones, prices, payments
- Nasr City & Sheikh Zayed: Africa/Cairo. Dubai: Asia/Dubai. Times always show their zone; online bookings also show the customer's local equivalent.
- **Payment info is identical for all branches** (one shared config): InstaPay (company link) and Vodafone Cash (company wallet numbers), recipient name, exact amount, currency, copy buttons, instructions. Real values are placeholders pending decision.
- *Assumption:* since both methods settle in EGP, prices are shown in **EGP for all branches** (demo values, configurable). Confirm during review.
- Selected duration, price and currency are shown before payment.

### 6.6 Statistics
- Public totals count **completed** consultations only (no cancelled, no-shows).
- KPI score: `x / 10`, demo values, separate from customer ratings and approval rate.
- Approval rate = approved ÷ (approved + refused); pending & withdrawn excluded. Hidden below minimum decided cases (config; demo 20). When shown: reporting period, number of decided applications, case-attribution rule, and "Historical outcomes do not guarantee future approval."

### 6.7 Identifiers & check-in
- Booking reference: human-readable random (`MG-7K4Q-92XD`), no personal info.
- QR payload: separate unguessable random token — no name, phone or meeting link.
- Manage link: separate secret token.
- Check-in once only; scanner flags cancelled, already used, on hold / unpaid, expired and wrong-date tickets; every action written to audit history.

## 7. Error handling & edge states
Empty filter results (suggest clearing filters / other branch); no slots on date (show next available); validation messages bilingual and inline; expired reservation screen with "Book again"; rejected/wrong-amount screens with clear next steps; offline/camera-denied fallback on scanner (manual reference entry).

## 8. Quality checks
- TypeScript strict; dictionary key parity enforced by types.
- Unit tests (Vitest) for availability/overlap calculation, status transitions, timezone formatting, approval-rate visibility rule.
- Browser verification at 375px and desktop, AR and EN.
- Accessibility audit (WCAG 2.2 AA) and i18n review, then fixes.

## 9. Open decisions (shown on Pending decisions board)
Schedules, breaks, buffers, booking limits, leave rules · payment link, wallet numbers, recipient name, verification ownership · currency for Dubai customers · consultation records, KPI definitions, outcome data · cancellation, refund, reschedule, lateness, no-show policies · staff responsibilities, meeting platform, reminder channels · CRM / calendar / spreadsheet integrations · consultant photos, videos, bios, titles, specializations, languages, qualifications · spelling of "Mohamed Esmail".
