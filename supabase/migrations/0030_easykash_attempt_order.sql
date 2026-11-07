-- 0030_easykash_attempt_order: two attempts started in the same transaction (or the same instant) tied on
-- created_at, so "the newest open attempt" could pick the older one. Stamp with the real clock and break
-- any remaining tie on the attempt number.
alter table public.easykash_attempts alter column created_at set default clock_timestamp();
alter table public.easykash_attempts add column attempt_no int;
update public.easykash_attempts set attempt_no = split_part(customer_reference, '-', -1)::int where attempt_no is null;

create or replace function public.start_easykash_attempt(p_manage_token text, p_currency text, p_units_per_egp numeric)
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

  insert into public.easykash_attempts (booking_id, customer_reference, attempt_no, currency, amount, egp_amount, units_per_egp)
  values (b.id, v_ref, v_count + 1, p_currency, v_amount, b.price_amount, v_rate);
  insert into public.audit_log (actor_kind, booking_id, action, from_value, to_value)
  values ('customer', b.id, 'payment-started', b.status::text, p_currency || ' ' || v_amount);

  return jsonb_build_object('customer_reference', v_ref, 'amount', v_amount, 'currency', p_currency,
    'name', b.customer_name, 'email', b.customer_email, 'phone', b.customer_phone);
end $$;

create or replace function public.open_easykash_attempt(p_manage_token text)
returns text language sql stable security definer
set search_path = ''
as $$
  select a.customer_reference from public.easykash_attempts a
  where a.booking_id = (public.booking_by_token(p_manage_token)).id and a.status = 'started'
  order by a.attempt_no desc nulls last, a.created_at desc limit 1
$$;
