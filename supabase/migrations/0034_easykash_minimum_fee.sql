-- 0034_easykash_minimum_fee: EasyKash's fee has a minimum (~6 EGP), so a 5 EGP test booking was charged
-- 11 EGP and 0032's "price + 6%" rule flagged it as a wrong amount. Accept the price plus a fee ceiling of
-- 3% or 10 EGP (whichever is more); still never less than the price. Otherwise unchanged from 0032.
create or replace function public.apply_easykash_payment(p_easykash_ref text)
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
  -- The customer pays EasyKash's processing fee on top: 2.6% with a minimum of about 6 EGP (1,000 EGP was
  -- charged 1,026; 5 EGP was charged 11). So the paid amount is never below the price, and at most the price
  -- plus a generous fee ceiling (3% or 10 EGP, whichever is more, in the attempt's currency). For USD/EUR/AED,
  -- EasyKash may instead report the EGP it collected: accept the EGP price -3% up to +8% plus 10 EGP.
  v_ok := v_paid is not null and (
    (v_paid >= a.amount and v_paid <= a.amount + greatest(a.egp_amount * 0.03, 10) * a.units_per_egp)
    or (a.currency <> 'EGP' and v_paid >= a.egp_amount * 0.97 and v_paid <= a.egp_amount * 1.08 + 10));

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
