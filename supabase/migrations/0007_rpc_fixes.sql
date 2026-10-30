-- 0007_rpc_fixes (Task 3 review round 1)
-- I1: once cron has flipped a hold to 'expired', submit_payment / reschedule_booking still answer HOLD_EXPIRED
--     (not INVALID_TRANSITION), so the UI can show the "your hold expired" screen.
-- I2: find_booking is limited per reference (any phone) and per phone (any reference); stale rate-limit windows
--     are purged so anon calls cannot grow rate_limits without bound.

create index if not exists rate_limits_window_start_idx on public.rate_limits (window_start);

-- Removes counters whose window ended long ago (every window in use is <= 10 min). Also callable from cron.
create function public.purge_rate_limits(p_older_than interval default interval '1 hour')
returns int language plpgsql
set search_path = ''
as $$
declare n int;
begin
  delete from public.rate_limits where window_start < now() - p_older_than;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.purge_rate_limits(interval) from public, anon, authenticated;

create or replace function public.hit_rate_limit(p_key text, p_max int, p_window interval)
returns void language plpgsql
set search_path = ''
as $$
declare c int;
begin
  perform public.purge_rate_limits(greatest(p_window, interval '1 hour'));
  insert into public.rate_limits as r (key, window_start, count) values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when r.window_start <= now() - p_window then 1 else r.count + 1 end,
    window_start = case when r.window_start <= now() - p_window then now() else r.window_start end
  returning count into c;
  if c > p_max then raise exception 'RATE_LIMITED'; end if;
end $$;

-- reference + phone -> manage_token, or null. Accepts lowercase, inner spaces and Arabic digits.
-- Limits: 10 lookups per reference and 20 per phone, per 10 minutes. Lookups that return null still count.
create or replace function public.find_booking(p_reference text, p_phone text)
returns text language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_ref text := upper(regexp_replace(public.normalize_digits(coalesce(p_reference, '')), '\s', '', 'g'));
  v_phone text := public.clean_phone(coalesce(p_phone, ''));
begin
  if v_ref !~ '^MG-[A-Z0-9]{4}-[A-Z0-9]{4}$' or v_phone !~ '^\+\d{8,15}$' then return null; end if;
  perform public.hit_rate_limit('find-ref:' || v_ref, 10, interval '10 minutes');
  perform public.hit_rate_limit('find-phone:' || v_phone, 20, interval '10 minutes');
  return (select manage_token from public.bookings where reference = v_ref and customer_phone = v_phone);
end $$;

create or replace function public.submit_payment(p_manage_token text, p_method text, p_txn_ref text, p_receipt_path text default null)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  b public.bookings;
  v_txn text := btrim(public.normalize_digits(coalesce(p_txn_ref, '')));
begin
  select * into b from public.bookings where id = (public.booking_by_token(p_manage_token)).id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if b.status = 'on-hold' then return public.customer_view(b); end if;
  if b.status = 'expired' then raise exception 'HOLD_EXPIRED'; end if;

  if p_method is null or p_method not in ('instapay','vodafone-cash') then raise exception 'INVALID_INPUT' using detail = 'method'; end if;
  if v_txn = '' or char_length(v_txn) > 100 then raise exception 'INVALID_INPUT' using detail = 'txn_ref'; end if;
  if p_receipt_path is not null and (char_length(p_receipt_path) > 200
      or p_receipt_path !~ ('^(receipts/)?' || b.id::text || '/[A-Za-z0-9._-]+$')) then
    raise exception 'INVALID_INPUT' using detail = 'receipt_path';
  end if;

  b := public.apply_transition(b.id, 'submit-payment', 'customer');
  insert into public.payments(booking_id, method, txn_ref, receipt_path) values (b.id, p_method, v_txn, p_receipt_path);
  return public.customer_view(b);
end $$;

create or replace function public.reschedule_booking(p_manage_token text, p_starts_at timestamptz)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  b public.bookings;
  nb public.bookings;
begin
  select * into b from public.bookings where id = (public.booking_by_token(p_manage_token)).id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_starts_at is null then raise exception 'INVALID_INPUT' using detail = 'starts_at'; end if;
  if b.status = 'expired' or (b.status = 'reserved' and now() > b.hold_expires_at) then raise exception 'HOLD_EXPIRED'; end if;
  if b.status not in ('reserved','on-hold','confirmed','rejected','wrong-amount','duplicate','late-transfer') then
    raise exception 'INVALID_TRANSITION' using detail = format('cannot reschedule from %s', b.status);
  end if;

  perform public.expire_stale_holds(b.consultant_id, public.booking_blocks_range(p_starts_at, p_starts_at + (b.ends_at - b.starts_at)), b.id);
  perform public.assert_slot_open(b.consultant_id, b.format::text, p_starts_at, b.id);
  begin
    update public.bookings set starts_at = p_starts_at, ends_at = p_starts_at + (b.ends_at - b.starts_at)
    where id = b.id returning * into nb;
  exception when exclusion_violation then raise exception 'SLOT_TAKEN';
  end;
  insert into public.audit_log(actor_kind, booking_id, action, from_value, to_value)
  values ('customer', b.id, 'transition', b.starts_at::text, nb.starts_at::text);
  return public.customer_view(nb);
end $$;
