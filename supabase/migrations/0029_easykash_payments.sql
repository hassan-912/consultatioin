-- 0029_easykash_payments: customers pay online through EasyKash (cards, wallets, Meeza, Apple Pay) in EGP, USD,
-- EUR or AED. The easykash-pay Edge Function opens an attempt and sends the customer to EasyKash; the signed
-- callback (0028) then settles the attempt here, confirming the booking automatically when the amount matches.
-- Design: docs/superpowers/specs/2026-11-07-easykash-online-payment-design.md

create table public.easykash_attempts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  customer_reference text not null unique,
  currency text not null check (currency in ('EGP','USD','EUR','AED')),
  -- What EasyKash was asked to charge, in `currency`.
  amount numeric(12,2) not null check (amount > 0),
  -- The booking's EGP price when the attempt started, and the rate used (units of `currency` per 1 EGP).
  egp_amount numeric(12,2) not null check (egp_amount > 0),
  units_per_egp numeric not null check (units_per_egp > 0),
  status text not null default 'started' check (status in ('started','confirmed','flagged')),
  outcome text,
  easykash_ref text unique,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index easykash_attempts_booking_idx on public.easykash_attempts (booking_id);
alter table public.easykash_attempts enable row level security;
create policy easykash_attempts_finance_read on public.easykash_attempts for select to authenticated
using ((select public.current_staff_role()) in ('admin','finance'));
revoke all on public.easykash_attempts from public, anon, authenticated;
grant select on public.easykash_attempts to authenticated;

-- Service role only (easykash-pay). Opens a payment attempt for a held booking and returns what EasyKash needs.
-- The amount is worked out here from the booking's price, never taken from the customer.
create function public.start_easykash_attempt(p_manage_token text, p_currency text, p_units_per_egp numeric)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  b public.bookings;
  v_rate numeric := case when p_currency = 'EGP' then 1 else p_units_per_egp end;
  v_amount numeric;
  v_count int;
  v_ref text;
begin
  select * into b from public.bookings where id = (public.booking_by_token(p_manage_token)).id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if b.status = 'expired' or (b.status = 'reserved' and b.hold_expires_at <= now()) then raise exception 'HOLD_EXPIRED'; end if;
  if b.status <> 'reserved' then raise exception 'INVALID_TRANSITION'; end if;
  if p_currency is null or p_currency not in ('EGP','USD','EUR','AED') then raise exception 'INVALID_INPUT' using detail = 'currency'; end if;
  -- Sanity bounds for a live rate (1 EGP is never worth more than 1 unit of these, nor less than 0.001).
  if p_currency <> 'EGP' and (v_rate is null or v_rate <= 0.001 or v_rate >= 1) then raise exception 'INVALID_INPUT' using detail = 'rate'; end if;

  select count(*) into v_count from public.easykash_attempts where booking_id = b.id;
  if v_count >= 6 then raise exception 'RATE_LIMITED'; end if;

  -- Rounded up to a whole unit so the customer is never short.
  v_amount := case when p_currency = 'EGP' then b.price_amount else ceil(b.price_amount * v_rate) end;
  v_ref := b.reference || '-' || (v_count + 1);

  -- First attempt: 15 more minutes so the customer isn't cut off while on EasyKash's page.
  if v_count = 0 then
    update public.bookings set hold_expires_at = hold_expires_at + interval '15 minutes' where id = b.id;
  end if;

  insert into public.easykash_attempts (booking_id, customer_reference, currency, amount, egp_amount, units_per_egp)
  values (b.id, v_ref, p_currency, v_amount, b.price_amount, v_rate);
  insert into public.audit_log (actor_kind, booking_id, action, from_value, to_value)
  values ('customer', b.id, 'payment-started', b.status::text, p_currency || ' ' || v_amount);

  return jsonb_build_object('customer_reference', v_ref, 'amount', v_amount, 'currency', p_currency,
    'name', b.customer_name, 'email', b.customer_email, 'phone', b.customer_phone);
end $$;
revoke execute on function public.start_easykash_attempt(text, text, numeric) from public, anon, authenticated;
grant execute on function public.start_easykash_attempt(text, text, numeric) to service_role;

-- Service role only (easykash-pay "check" mode): the newest attempt still waiting for EasyKash, if any.
create function public.open_easykash_attempt(p_manage_token text)
returns text language sql stable security definer
set search_path = ''
as $$
  select a.customer_reference from public.easykash_attempts a
  where a.booking_id = (public.booking_by_token(p_manage_token)).id and a.status = 'started'
  order by a.created_at desc limit 1
$$;
revoke execute on function public.open_easykash_attempt(text) from public, anon, authenticated;
grant execute on function public.open_easykash_attempt(text) to service_role;

-- Service role only (easykash-webhook and easykash-pay). Settles a verified, recorded EasyKash payment.
-- Idempotent: an attempt is settled once; a repeat of the same payment changes nothing.
-- Returns the outcome: confirmed | wrong-amount | slot-taken | needs-refund | duplicate | unmatched | ignored.
create function public.apply_easykash_payment(p_easykash_ref text)
returns text language plpgsql volatile security definer
set search_path = ''
as $$
declare
  c public.easykash_callbacks;
  a public.easykash_attempts;
  b public.bookings;
  v_paid numeric;
  v_ok boolean;
  v_outcome text;
begin
  select * into c from public.easykash_callbacks where easykash_ref = p_easykash_ref;
  if not found then raise exception 'NOT_FOUND'; end if;
  if upper(coalesce(c.status, '')) <> 'PAID' then return 'ignored'; end if;

  select * into a from public.easykash_attempts where customer_reference = c.customer_reference for update;
  if not found then return 'unmatched'; end if;
  if a.status <> 'started' then
    if a.easykash_ref = c.easykash_ref then return 'duplicate'; end if;
    -- A second, different payment for an attempt that was already settled: money to give back.
    insert into public.audit_log (actor_kind, booking_id, action, from_value, to_value)
    values ('system', a.booking_id, 'easykash-extra-payment', c.easykash_ref, coalesce(c.amount, ''));
    return 'needs-refund';
  end if;

  select * into b from public.bookings where id = a.booking_id for update;
  v_paid := nullif(regexp_replace(coalesce(c.amount, ''), '[^0-9.]', '', 'g'), '')::numeric;
  -- EasyKash may report the amount in the currency we sent, or converted to EGP. Accept either; the EGP
  -- figure within 5% of the booking's price (rates move between our quote and the payment).
  v_ok := v_paid is not null and (v_paid = a.amount or abs(v_paid - a.egp_amount) <= a.egp_amount * 0.05);

  insert into public.payments (booking_id, method, txn_ref, decided_at, decision)
  values (b.id, 'easykash', c.easykash_ref, now(), case when v_ok then 'auto-verified' else 'amount-mismatch' end);

  if b.status in ('reserved','rejected') then
    -- Money was taken, so an elapsed hold doesn't stop the payment: a still-'reserved' booking means nobody
    -- has claimed the slot (any new reservation expires stale holds first).
    update public.bookings set hold_expires_at = greatest(hold_expires_at, now() + interval '1 minute') where id = b.id;
    begin
      perform public.apply_transition(b.id, 'submit-payment', 'system');
      if v_ok then
        perform public.apply_transition(b.id, 'verify', 'system');
        v_outcome := 'confirmed';
      else
        perform public.apply_transition(b.id, 'wrong-amount', 'system');
        v_outcome := 'wrong-amount';
      end if;
    exception when others then
      if sqlerrm <> 'SLOT_TAKEN' then raise; end if;
      v_outcome := 'slot-taken';
    end;
  elsif b.status = 'expired' then
    perform public.apply_transition(b.id, 'late', 'system');
    v_outcome := 'slot-taken';
    if v_ok then
      begin
        perform public.apply_transition(b.id, 'verify', 'system');
        v_outcome := 'confirmed';
      exception when others then
        if sqlerrm <> 'SLOT_TAKEN' then raise; end if;
      end;
    end if;
  else
    -- Cancelled, already paid another way, or already past the appointment.
    v_outcome := 'needs-refund';
  end if;

  update public.easykash_attempts
  set status = case when v_outcome = 'confirmed' then 'confirmed' else 'flagged' end,
      outcome = v_outcome, easykash_ref = c.easykash_ref, settled_at = now()
  where id = a.id;
  insert into public.audit_log (actor_kind, booking_id, action, from_value, to_value)
  values ('system', b.id, 'easykash-' || v_outcome, c.easykash_ref, coalesce(c.amount, '') || ' (' || a.currency || ' ' || a.amount || ')');
  return v_outcome;
end $$;
revoke execute on function public.apply_easykash_payment(text) from public, anon, authenticated;
grant execute on function public.apply_easykash_payment(text) to service_role;
