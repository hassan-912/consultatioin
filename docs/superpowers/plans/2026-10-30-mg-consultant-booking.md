# MG Consultant Directory & Booking Prototype — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A clickable bilingual (AR/EN) mobile-first prototype of MG International's consultant directory, booking, manual payment review, boarding-pass ticket and staff dashboards.

**Architecture:** Client-only Vite + React SPA with HashRouter. Pure domain modules (availability, status machine, ids, time, stats) are unit-tested; UI reads config + a Zustand store persisted to `sessionStorage` that acts as the demo "database". A single-file build is published as a private artifact.

**Tech Stack:** Vite 6, React 19, TypeScript (strict), Tailwind CSS 4 (`@tailwindcss/vite`), Framer Motion 11, Zustand 5, react-router-dom 7 (HashRouter), `qrcode`, `html-to-image` (ticket download), Vitest + Testing Library, `vite-plugin-singlefile`.

**Spec:** `docs/superpowers/specs/2026-10-30-mg-consultant-booking-design.md`

## Global Constraints

- Every user-visible string comes from `src/i18n/en.ts` / `ar.ts`; no literals in components (brand names, phone, email excepted).
- `<html lang>` and `dir` follow language: `ar` → `rtl`, `en` → `ltr`. Use logical Tailwind utilities only (`ms-/me-/ps-/pe-/start-/end-/text-start`); never `ml-/mr-/pl-/pr-/left-/right-/text-left`.
- Phone numbers, emails, references, prices wrapped in `<bdi dir="ltr">` (component `Ltr`). Western digits in both languages.
- No Qena branch and no consultant named Wael anywhere.
- Never invent bios, titles, specialties, qualifications, reviews or stats. Missing → `Placeholder` component with bilingual label. All demo numbers/schedules rendered with `DemoBadge` ("Demo data / بيانات تجريبية").
- Colour tokens: slate `#2D3845`, slate-deep `#222D35`, mist `#9FAEBE`, navy `#0C2B59`, gold `#C9A86A`; status green/amber/red only for statuses. WCAG AA contrast.
- Fonts (Google Fonts): Changa (headings), Mulish (EN body), IBM Plex Sans Arabic (AR body).
- Touch targets ≥ 44px. All motion disabled under `prefers-reduced-motion` (use Framer `useReducedMotion` / `MotionConfig reducedMotion="user"`).
- Copy labels fixed by spec: "Choose your consultant / اختر مستشارك", "Available appointments / المواعيد المتاحة", "Online consultation / استشارة أونلاين", "In-person consultation / استشارة في الفرع", "Booking confirmed / تم تأكيد الحجز", "Payment under review / الدفع قيد المراجعة", "On hold – Payment under review / معلّق – الدفع قيد المراجعة", "View profile / عرض الملف الشخصي", "Book consultation / احجز استشارة", "Next available appointment / أقرب موعد متاح", "Join consultation / انضم للاستشارة", "Biography under processing / النبذة قيد الإعداد", "Photo pending / الصورة قيد الإعداد".
- Timezones: Nasr City & Sheikh Zayed `Africa/Cairo`; Dubai `Asia/Dubai`.
- Payment config is one shared object for all branches; prices in EGP (configurable). Auto-confirm flag `false`.
- No real messages, payments or network calls besides Google Fonts.

## Review Focus

1. **Arabic-Indic digits typed into phone / reference fields** (`٠١٢٣`) → normalised to Western digits before validation and lookup (test in Task 4).
2. **Egypt DST** (Africa/Cairo observes summer time) → slots and labels on DST-change dates stay correct; local equivalent for a customer in another zone may fall on a different calendar day and must show that date (test in Task 4).
3. **Reservation expires while customer is on the payment step** → countdown hits zero, submit is blocked, status `expired`, slot released and visible again (tests in Tasks 5 & 6).
4. **Double-submit / back-button on payment** → submitting the transaction reference twice does not create two bookings or two holds (test in Task 6).
5. **Language switch mid-wizard** → step index and typed form fields survive switch and reload (test in Task 3).

---

## File Structure

```
src/
  main.tsx, App.tsx                    routes + providers
  styles/index.css                     tailwind, tokens, fonts, perforation utilities
  i18n/{en.ts, ar.ts, index.ts}        dictionaries + useT()
  store/useAppStore.ts                 lang, filters, booking draft, bookings db, audit log, role
  config/{branches,consultants,programs,booking,payments,kpi,pendingDecisions}.ts
  domain/{types,ids,time,pricing,availability,bookingStatus,stats,phone}.ts (+ *.test.ts)
  demo/{schedule.ts, seed.ts}           demo availability rules, bookings, stats
  components/                           Button, Chip, Ltr, DemoBadge, Placeholder, Avatar, StatTile,
                                        ScoreBar, CopyField, Countdown, QrCode, LangSwitch, Header,
                                        Footer, BottomSheet, StatusChip, Logo
  features/directory/                   DirectoryPage, Hero, FlightPaths, Filters, ConsultantCard
  features/profile/                     ProfilePage, VideoPlayer, ApprovalStats, SlotCalendar
  features/booking/                     BookingWizard, steps/*, SummaryBar, MapCard
  features/ticket/                      BoardingPass, TicketPage, BookingPage, FindBookingPage
  features/staff/                       StaffLayout, RoleSwitcher, finance/, reception/, consultant/, admin/
  features/demo/DemoPanel.tsx
public/brand/mg-logo-white.webp
```

---

### Task 1: Scaffold, tokens, logo

**Files:** Create project root files (`package.json`, `vite.config.ts`, `tsconfig*.json`, `index.html`), `src/main.tsx`, `src/App.tsx`, `src/styles/index.css`, `public/brand/mg-logo-white.webp`, `src/App.test.tsx`, `.gitignore`.

**Interfaces:** Produces Tailwind theme tokens `slate`, `slate-deep`, `mist`, `navy`, `gold`, `ok`, `warn`, `bad`; font families `font-display`, `font-body` (body switches via `:lang(ar)`).

- [ ] **Step 1:** `git init`; `npm create vite@latest . -- --template react-ts`; install deps from Tech Stack.
- [ ] **Step 2:** Download `https://mg-visa.com/wp-content/uploads/2025/03/MG-Logo-White-HD.png.webp` → `public/brand/mg-logo-white.webp` (user-approved).
- [ ] **Step 3:** `index.html` loads Google Fonts (Changa 500/600/700, Mulish 400/600/700, IBM Plex Sans Arabic 400/500/600). `index.css` defines `@theme` tokens above; `:lang(ar) body { font-family: "IBM Plex Sans Arabic" }`.
- [ ] **Step 4:** Test `App.test.tsx`: renders without crash and `document.documentElement.dir` is `"ltr"` by default.
- [ ] **Step 5:** `npx vitest run` → PASS; `npm run build` → success.
- [ ] **Step 6:** Commit `chore: scaffold vite react app with brand tokens`.

### Task 2: Domain types & config data

**Files:** Create `src/domain/types.ts`, `src/config/*.ts`, `src/config/config.test.ts`.

**Interfaces — Produces:**
```ts
type Lang = 'ar' | 'en'; type L10n = Record<Lang, string>;
type BranchId = 'nasr-city' | 'sheikh-zayed' | 'dubai';
type Format = 'online' | 'in-person';
type ProgramId = 'investment'|'employment'|'job-seeking'|'education'|'tourism'|'immigration';
interface Branch { id: BranchId; name: L10n; address: L10n; timeZone: 'Africa/Cairo'|'Asia/Dubai'; mapsUrl: string; country: 'EG'|'AE' }
interface Consultant { id: string; name: L10n; title: L10n | null; branchId: BranchId; experienceYears: number;
  experienceLabel?: L10n; /* "3+" */ photo: string | null; bio: L10n | null; videoUrl: string | null;
  programs: ProgramId[]; countries: ('AU'|'CA'|'NZ')[]; languages: L10n[] | null; qualifications: L10n[] | null;
  nameNeedsConfirmation?: boolean; demoPrograms: boolean }
interface BookingConfig { durations: Record<Format, number[]>; bufferMin: number; holdMinutes: number;
  prices: Record<Format, Record<number, number>>; currency: 'EGP'; autoConfirm: false; slotStepMin: 15 }
interface PaymentConfig { methods: { id: 'instapay'|'vodafone-cash'; label: L10n; recipient: string; detail: string; link?: string; placeholder: true }[]; instructions: L10n[] }
interface KpiConfig { scale: 10; approvalMinSample: 20; reportingPeriod: L10n; attributionRule: L10n }
interface PendingDecision { id: string; area: L10n; question: L10n; owner: L10n | null }
```
Exports: `branches: Branch[]`, `consultants: Consultant[]`, `programs: {id: ProgramId; name: L10n}[]`, `bookingConfig`, `paymentConfig`, `kpiConfig`, `pendingDecisions`.

- [ ] **Step 1: Failing tests** in `config.test.ts`:
  - `branches.length === 3`; ids exactly the three above; no name/address contains `Qena`/`قنا`.
  - `consultants.length === 7`; none contains `Wael`/`وائل`; branch counts nasr-city 4, sheikh-zayed 2, dubai 1.
  - Only `mohamed-gamal` has non-null `title` = `"Senior Immigration Specialist & Contract Manager"`; every `bio === null`; `mohamed-esmail.nameNeedsConfirmation === true`.
  - Experience: gamal 5, salama 3 (label "3+"), khalil 1.5, esmail 2, tarek 3, salah 1.5, abdelaziz 2.
  - `bookingConfig.durations` = `{ online: [15, 30], 'in-person': [30, 45] }`; `autoConfirm === false`; `holdMinutes === 30`.
  - Every `pendingDecisions` item covers spec §9 (assert ≥ 10 entries, ids include `payment-details`, `dubai-currency`, `policies`, `meeting-platform`, `integrations`, `esmail-spelling`).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement configs. Addresses, hotline `17621`, email `Info@mg-visa.com` verbatim from spec; Arabic translations written for each. Demo prices (EGP): online 15→500, 30→900; in-person 30→1000, 45→1400. Payment methods with placeholder recipient `"[Recipient name – pending]"`, detail `"[Wallet / link – pending]"`.
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat: domain types and branch/consultant config`.

### Task 3: i18n + store

**Files:** Create `src/i18n/{en,ar,index}.ts`, `src/store/useAppStore.ts`, `src/store/useAppStore.test.ts`, `src/components/LangSwitch.tsx`.

**Interfaces — Produces:**
```ts
type Dict = typeof en; // ar: Dict  (type-enforced parity)
function useT(): { t: (key: DotPath<Dict>, vars?: Record<string,string|number>) => string; lang: Lang; dir: 'rtl'|'ltr' }
interface Filters { branch: BranchId | 'all'; program: ProgramId | 'all'; format: Format | 'any'; date: string /* YYYY-MM-DD */ }
interface BookingDraft { consultantId: string | null; step: 0|1|2|3|4; format: Format | null; durationMin: number | null;
  slotStartIso: string | null; details: CustomerDetails; bookingId: string | null }
interface CustomerDetails { name: string; phone: string; email: string; channel: 'email'|'whatsapp'; consultationLang: Lang; program: ProgramId | ''; note: string }
store: { lang; setLang(l); filters; setFilters(p: Partial<Filters>); draft; updateDraft(p); resetDraft();
  bookings: Record<string, Booking>; audit: AuditEntry[]; role: StaffRole; setRole(r); now(): number; timeOffsetMs; }
```
`setLang` updates `document.documentElement.lang/dir`. Persist via `zustand/middleware` `persist` + `createJSONStorage(() => sessionStorage)`, key `mg-proto-v1`.

- [ ] **Step 1: Failing tests:** `setLang('ar')` sets `dir="rtl"` & `lang="ar"`; with draft `{step: 3, details.name: 'Sara'}` + filters `{branch:'dubai'}`, calling `setLang('ar')` then rehydrating the store from sessionStorage keeps step 3, name `Sara`, branch `dubai` (Review Focus 5).
- [ ] **Step 2:** FAIL. **Step 3:** Implement; dictionaries include every spec label from Global Constraints verbatim, plus statuses, validation messages, payment instructions, staff screens. **Step 4:** PASS + `tsc --noEmit` clean. **Step 5:** Commit `feat: bilingual dictionaries and persisted app store`.

### Task 4: ids, phone, time, pricing

**Files:** Create `src/domain/{ids,phone,time,pricing}.ts` + tests.

**Interfaces — Produces:**
```ts
makeReference(): string            // /^MG-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/  (crypto.getRandomValues; no 0/O/1/I)
makeToken(): string                // 32 hex chars (128-bit)
normalizeDigits(s: string): string // ٠-٩ and ۰-۹ → 0-9
validatePhone(s: string): boolean  // after normalize: /^\+\d{8,15}$/ (country code required)
validateEmail(s: string): boolean
formatInZone(iso: string, tz: string, lang: Lang, opts?): string  // Intl, numberingSystem 'latn'
zoneLabel(tz: string, lang: Lang): string                          // "Cairo time (GMT+3)" / "بتوقيت القاهرة"
localEquivalent(iso: string, viewerTz: string, lang: Lang): { text: string; differentDay: boolean }
zonedDateTimeToIso(date: 'YYYY-MM-DD', minutes: number, tz: string): string
priceFor(format: Format, durationMin: number): { amount: number; currency: 'EGP' }
```
- [ ] **Step 1: Failing tests:**
  - 1000 references all unique and match regex; tokens 32 hex.
  - `normalizeDigits('+٢٠١٠٠١٢٣٤٥٦٧') === '+201001234567'`; `validatePhone('٠١٠٠١٢٣٤٥٦٧') === false` (no `+`); `validatePhone('+20 100 123 4567')` true after stripping spaces (Review Focus 1).
  - `zonedDateTimeToIso('2026-07-15', 600, 'Africa/Cairo')` → `'2026-07-15T07:00:00.000Z'` (DST, UTC+3); `'2026-12-15'` → `T08:00` (UTC+2) (Review Focus 2).
  - `localEquivalent('2026-07-15T21:00:00Z', 'Asia/Tokyo', 'en').differentDay === true`.
  - `formatInZone` in `ar` contains Western digits only.
  - `priceFor('online', 30)` → `{amount: 900, currency: 'EGP'}`; unknown duration throws.
- [ ] **Step 2:** FAIL. **Step 3:** Implement (offset via `Intl.DateTimeFormat(...).formatToParts` with `timeZoneName: 'shortOffset'`). **Step 4:** PASS. **Step 5:** Commit `feat: ids, phone validation, timezone helpers, pricing`.

### Task 5: Availability engine + demo schedule

**Files:** Create `src/domain/availability.ts`, `src/domain/availability.test.ts`, `src/demo/schedule.ts`.

**Interfaces — Produces:**
```ts
interface ScheduleRules { consultantId: string; weekly: Record<0|1|2|3|4|5|6, {start: number; end: number}[]>; // minutes from midnight local
  breaks: {start: number; end: number}[]; holidays: string[]; leave: {from: string; to: string}[]; unavailable: string[]; maxPerDay?: number; formats: Format[] }
interface Busy { startIso: string; endIso: string }               // held or confirmed bookings, any format
interface Slot { startIso: string; endIso: string }
getSlots(args: { rules: ScheduleRules; date: string; durationMin: number; format: Format; tz: string; busy: Busy[]; bufferMin: number; stepMin: number; nowMs: number }): Slot[]
nextAvailable(args: Omit<..., 'date'> & { fromDate: string; horizonDays: 30 }): Slot | null
busyFromBookings(bookings: Booking[], consultantId: string, nowMs: number): Busy[]  // includes reserved (unexpired), on-hold, confirmed, checked-in; excludes expired/cancelled/rejected
```
`demo/schedule.ts` exports `scheduleRules: ScheduleRules[]` (Sun–Thu 10:00–18:00 Egypt, Mon–Fri 10:00–18:00 Dubai; break 13:00–13:30; one leave range and one holiday so they're visible; flagged demo).

- [ ] **Step 1: Failing tests:**
  - Busy in-person 11:00–11:45 blocks an online 30-min slot at 11:30 and, with buffer 10, at 11:50 (cross-format overlap).
  - No slot overlaps break 13:00–13:30.
  - Holiday / leave / unavailable date → `[]`; format not in `rules.formats` → `[]`.
  - Slots before `nowMs` excluded.
  - `nextAvailable` skips a fully booked day to the next working day.
  - `busyFromBookings` excludes a `reserved` booking whose `holdExpiresAt < nowMs` (Review Focus 3: slot released).
- [ ] **Step 2:** FAIL. **Step 3:** Implement: walk `stepMin` grid inside each working window; reject if `[start-buffer, end+buffer)` intersects busy or break. **Step 4:** PASS. **Step 5:** Commit `feat: availability engine with buffers, breaks, leave`.

### Task 6: Booking status machine, stats, seed

**Files:** Create `src/domain/{bookingStatus,stats}.ts` + tests, `src/demo/seed.ts`; Modify `src/store/useAppStore.ts` (actions).

**Interfaces — Produces:**
```ts
type BookingStatus = 'reserved'|'on-hold'|'confirmed'|'checked-in'|'completed'|'no-show'|'expired'|'rejected'|'wrong-amount'|'duplicate'|'late-transfer'|'cancelled';
interface Booking { id: string; reference: string; qrToken: string; manageToken: string; consultantId: string; branchId: BranchId;
  format: Format; durationMin: number; startIso: string; endIso: string; tz: string; price: {amount: number; currency: 'EGP'};
  customer: CustomerDetails; status: BookingStatus; holdExpiresAt: number; payment?: { method: 'instapay'|'vodafone-cash'; txnRef: string; receiptName?: string; submittedAt: number };
  rejectReason?: string; checkedInAt?: number; meetingUrl?: string; ticketSentVia?: 'email'|'whatsapp'; ticketSentAt?: number; createdAt: number }
type BookingEvent = {type:'submit-payment'; payment} | {type:'verify'} | {type:'reject'; reason} | {type:'wrong-amount'} | {type:'duplicate'} | {type:'late'} | {type:'expire'} | {type:'check-in'} | {type:'complete'} | {type:'no-show'} | {type:'cancel'} | {type:'mark-sent'; via};
transition(b: Booking, e: BookingEvent, nowMs: number): Booking   // throws InvalidTransition
checkInVerdict(b: Booking | undefined, todayInTz: string): 'ok'|'not-found'|'on-hold'|'unpaid'|'already-used'|'cancelled'|'expired'|'wrong-date'
approvalStats(o: {approved: number; refused: number; pending: number; withdrawn: number}, minSample: number): { visible: boolean; rate?: number; decided: number }
publicTotals(bookings: Booking[], consultantId: string, nowMs: number): { total: number; thisMonth: number }   // completed only
```
Store actions: `createReservation(draft) → Booking` (idempotent: if `draft.bookingId` exists and not expired, return it), `submitPayment(id, payment)`, `applyEvent(id, event, actor)` (appends `AuditEntry {at, actor: StaffRole|'customer'|'system', bookingRef, action, from, to}`), `expireDue()` run on interval.
`seed.ts`: ~40 demo bookings across statuses/consultants (incl. one on-hold per payment edge case for finance queue), per-consultant demo KPI scores (x/10) and demo outcomes where only Mohamed Gamal's exceeds min sample.

- [ ] **Step 1: Failing tests:**
  - Happy path reserved → on-hold → confirmed → checked-in → completed.
  - `submit-payment` after `holdExpiresAt` → result status `expired` is NOT reached silently: throws `InvalidTransition('expired')` (Review Focus 3); `expire` from `reserved` ok, from `on-hold` invalid (payment already submitted goes to finance).
  - `verify` only from `on-hold`; `late` only from `expired`; `check-in` twice → second throws.
  - `createReservation` called twice with same draft → one booking (Review Focus 4); `submitPayment` twice → status stays `on-hold`, single audit entry for submission.
  - `checkInVerdict` covers each verdict.
  - `approvalStats({approved: 12, refused: 4, pending: 9, withdrawn: 3}, 20)` → `{visible: false, decided: 16}`; `{approved: 18, refused: 6, ...}` → `{visible: true, rate: 0.75, decided: 24}`.
  - `publicTotals` ignores cancelled and no-show.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit `feat: booking status machine, stats, demo seed`.

### Task 7: Design system components + shell

**Files:** Create `src/components/*` (list in File Structure), `src/App.tsx` layout with Header (logo, nav: Consultants / Find my booking / Staff, `LangSwitch` showing "العربية" when EN and "English" when AR), Footer (3 branches, hotline `17621` as `tel:17621`, `mailto:Info@mg-visa.com`, Facebook/TikTok/Instagram links from spec with `rel="noopener"`), `MotionConfig reducedMotion="user"`.

**Interfaces — Produces:** `Button({variant: 'primary'|'gold'|'ghost'|'danger', size})`, `StatusChip({status: BookingStatus})`, `Placeholder({kind: 'photo'|'bio'|'video'|'title'|'specializations'|'languages'|'qualifications'})`, `DemoBadge()`, `Avatar({consultant, size})`, `StatTile({label, value, demo?})` (count-up), `ScoreBar({score: number /*0-10*/})`, `CopyField({label, value})`, `Countdown({untilMs, onDone})`, `QrCode({value})`, `Ltr({children})`, `BottomSheet({open, onClose, title})`.

- [ ] **Step 1: Failing tests** (Testing Library): `ScoreBar score={8.6}` renders `8.6 / 10` and 10 segments with 8 full; `CopyField` copies value (mock `navigator.clipboard`) and announces "Copied" via `aria-live`; `LangSwitch` click toggles dir; `Footer` has no "Qena"/"قنا" and has 3 social links with exact URLs.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit `feat: design system components and app shell`.

### Task 8: Directory page

**Files:** Create `src/features/directory/{DirectoryPage,Hero,FlightPaths,Filters,ConsultantCard}.tsx` + `DirectoryPage.test.tsx`.

**Interfaces — Consumes:** `consultants`, `getSlots`, `nextAvailable`, `busyFromBookings`, `publicTotals`, store `filters`.
Card fields per spec §5.1; availability = slots for `filters.date` + `filters.format` (if `any`, union of both formats, labelled per format); KPI as `ScoreBar`. Filters: inline bar on ≥768px, `BottomSheet` on mobile. `FlightPaths`: inline SVG arcs Cairo/Dubai → CA/AU/NZ with `pathLength` animation.

- [ ] **Step 1: Failing tests:** default shows 7 cards; branch `dubai` → 1 card (Mohamed Abdelaziz); format filter excludes consultants whose rules lack that format; a date that is a demo holiday shows "No appointments on this date" and each card's next available appointment; empty result shows clear-filters action; each card has both "View profile" and "Book consultation" links.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit `feat: consultant directory with filters and cards`.

### Task 9: Consultant profile

**Files:** Create `src/features/profile/{ProfilePage,VideoPlayer,ApprovalStats,SlotCalendar}.tsx` + test.

`VideoPlayer`: when `videoUrl` null → poster placeholder with disabled-state controls bar + captions toggle UI and "Video pending" text; when present → `<video controls>` with `<track kind="captions">`. `ApprovalStats`: hidden-state card ("Not enough decided applications to publish a rate") or rate with period, decided count, attribution rule and disclaimer — copy from `kpiConfig`. `SlotCalendar`: 14-day strip + slots for chosen format/duration; selecting a slot writes draft and navigates to `/book/:id` at step 2.

- [ ] **Step 1: Failing tests:** profile for `ahmed-khalil` shows bio placeholder text "Biography under processing", "No verified feedback yet", approval stats hidden; `mohamed-gamal` shows title and approval rate with "do not guarantee" disclaimer; KPI, customer rating and approval rate render in three separate labelled regions.
- [ ] **Step 2–5:** FAIL → implement → PASS → commit `feat: consultant profile page`.

### Task 10: Booking wizard

**Files:** Create `src/features/booking/{BookingWizard,SummaryBar,MapCard}.tsx`, `steps/{FormatStep,SlotStep,DetailsStep,ReviewStep,PaymentStep}.tsx` + `BookingWizard.test.tsx`.

Steps per spec §5.3 / §6. Details form fields exactly spec §6.1 (email required, channel Email/WhatsApp). Review shows consultant, format, date/time + `zoneLabel`, local equivalent for online, duration, price `Ltr`, branch address + `MapCard` for in-person / meeting-link note for online. Payment: calls `createReservation` on entry, shows reference, `Countdown`, method tabs from `paymentConfig` with `CopyField`s, txn-ref input (required), optional receipt file input (name only stored), submit → `submitPayment` → navigate `/ticket/:manageToken`. Countdown done → expired screen with "Choose another time".

- [ ] **Step 1: Failing tests:** cannot advance details step with invalid phone (`0100…` without +) or empty email — bilingual messages shown; online durations offered are 15/30, in-person 30/45; price shown before payment matches `priceFor`; reloading on payment step keeps the same reference; expired countdown disables submit.
- [ ] **Step 2–5:** FAIL → implement → PASS → commit `feat: five-step booking wizard with manual payment`.

### Task 11: Ticket, booking page, find booking

**Files:** Create `src/features/ticket/{BoardingPass,TicketPage,BookingPage,FindBookingPage}.tsx` + test.

`BoardingPass` per spec §3/§7: reference, customer + consultant names, format, date/time/tz/duration, branch address (in-person), status banner (amber "On hold – Payment under review" with diagonal watermark, or green "Booking confirmed"), `QrCode value={qrToken}`, manage link, support (17621, email). Download via `html-to-image` → PNG. `BookingPage` (`/booking/:manageToken`): status explainer per status (expired, rejected w/ reason, wrong-amount, duplicate, late-transfer messages), actions Reschedule / Cancel (policy placeholder note) / Book again / Join consultation (confirmed online only). `FindBookingPage`: reference + phone (normalised) → manage page.

- [ ] **Step 1: Failing tests:** QR value equals `qrToken` and contains neither phone, name nor `meetingUrl`; on-hold ticket shows amber banner and no Join button; confirmed online shows "Join consultation"; find with Arabic digits phone succeeds; wrong phone → "No booking found".
- [ ] **Step 2–5:** FAIL → implement → PASS → commit `feat: boarding-pass ticket and booking management`.

### Task 12: Staff — finance & reception

**Files:** Create `src/features/staff/{StaffLayout,RoleSwitcher}.tsx`, `finance/PaymentQueue.tsx`, `reception/{CheckIn,Arrivals}.tsx` + tests.

`StaffLayout`: sidebar (drawer on mobile), role switcher (Admin, Consultant, Finance, Reception) with "Demo access – no real login" note; nav items filtered by role permission map `permissions: Record<StaffRole, StaffScreen[]>`. Finance queue: on-hold bookings with amount expected vs method/txn ref/receipt name; actions Verify / Reject (reason required) / Wrong amount / Duplicate / Late transfer; after Verify → "Send ticket" panel: email (simulated "Sent to …") or WhatsApp (prefilled bilingual text + `wa.me` link opened only on click, then "Mark as sent"). Reception: camera scan via `BarcodeDetector` when available, else manual entry; search by reference; verdict card from `checkInVerdict`; "Record check-in" once.

- [ ] **Step 1: Failing tests:** Reception role cannot see Payment queue nav; verifying an on-hold booking makes its ticket show "Booking confirmed" and appends audit entry with actor `finance`; check-in of same token twice → second shows "Already used"; on-hold ticket scan shows "On hold – not valid for entry".
- [ ] **Step 2–5:** FAIL → implement → PASS → commit `feat: finance payment review and reception check-in`.

### Task 13: Staff — consultant & admin

**Files:** Create `consultant/{MyCalendar,MyBookings,ConsultationRecord}.tsx`, `admin/{ConsultantsAdmin,AvailabilityAdmin,BookingsAdmin,PaymentsAdmin,KpiAdmin,AuditLog,PendingDecisions}.tsx` + tests.

Admin edits write to store overrides (`consultantOverrides`, `scheduleOverrides`, `paymentOverrides`, `kpiOverrides`) layered over config; every edit audited. ConsultantsAdmin shows "Spelling to confirm" badge on Mohamed Esmail with editable EN/AR name. ConsultationRecord: notes + application outcome (approved/refused/pending/withdrawn) feeding `approvalStats`. Mark completed / no-show here. PendingDecisions renders `pendingDecisions` grouped by area with "Unresolved" chips.

- [ ] **Step 1: Failing tests:** editing Esmail's name updates the directory card; adding a leave range removes those dates' slots; marking a booking no-show leaves `publicTotals` unchanged, completed increments it; audit log lists both edits; PendingDecisions shows ≥ 10 unresolved items; consultant role sees only own bookings.
- [ ] **Step 2–5:** FAIL → implement → PASS → commit `feat: consultant desk and admin tools`.

### Task 14: Demo panel

**Files:** Create `src/features/demo/DemoPanel.tsx` + test.

Floating, collapsible, labelled "Prototype controls". Actions on the most recent customer booking: Finance verifies / rejects / wrong amount; Skip 31 min (increments `timeOffsetMs`, triggers `expireDue`); Mark completed / no-show; Reset demo (re-seed).

- [ ] **Step 1: Failing test:** "Skip 31 min" turns a fresh `reserved` booking `expired` and its slot reappears in `getSlots`.
- [ ] **Step 2–5:** FAIL → implement → PASS → commit `feat: prototype demo controls`.

### Task 15: Single-file build, verification, audits, publish

**Files:** Modify `vite.config.ts` (mode `artifact` uses `vite-plugin-singlefile`, logo inlined as data URI), `package.json` script `build:artifact`.

- [ ] **Step 1:** `npm run build:artifact` → `dist-artifact/index.html` single file < 5 MB.
- [ ] **Step 2:** Browser pane at 375×812 and desktop, EN and AR: walk directory → profile → booking → payment → on-hold ticket → finance verify → confirmed ticket → reception check-in → second check-in flagged; switch language mid-wizard. Fix issues.
- [ ] **Step 3:** Run `design-skills:accessibility-audit` and `agentic-council:i18n-review` on the running app; fix AA failures and RTL defects.
- [ ] **Step 4:** `npx vitest run` + `tsc --noEmit` → all green.
- [ ] **Step 5:** Publish `dist-artifact/index.html` as private artifact (icon `calendar`). Commit `chore: artifact build`.
