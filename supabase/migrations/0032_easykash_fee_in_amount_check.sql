-- 0032_easykash_fee_in_amount_check: the EasyKash account passes its processing fee to the buyer, so a paid
-- amount is the price plus the fee (1,000 EGP booking -> 1,026 EGP charged). The amount check now accepts the
-- fee in every currency instead of only through the EGP tolerance. Otherwise unchanged from 0029.
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
  -- The customer pays EasyKash's processing fee on top (2.6% today: 1,000 EGP was charged 1,026), so the paid
  -- amount is the price plus up to 6%; never less. For USD/EUR/AED, EasyKash may instead report the EGP it
  -- collected: accept the booking's EGP price from -3% (rate moves) to +8% (fee and rate moves).
  v_ok := v_paid is not null and (
    (v_paid >= a.amount and v_paid <= a.amount * 1.06)
    or (a.currency <> 'EGP' and v_paid >= a.egp_amount * 0.97 and v_paid <= a.egp_amount * 1.08));

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
