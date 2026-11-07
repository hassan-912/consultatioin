-- 0035_security_hardening (security review, 2026-11-07):
--  1. Fake payments: manual transfer submission is retired (checkout is EasyKash only), but submit_payment was
--     still callable by anyone holding a booking link, moving it to "paid, under review" with a made-up
--     transaction number. Revoke it and the receipt-upload capability from the public API.
--  2. Slot hoarding / brute force: reservations and booking lookups were limited per phone/reference only.
--     Add a per-connection (client IP) limit.
--  3. The payment-status check (easykash-pay "check") is limited per booking, so it can't be used to exhaust
--     the EasyKash API.
--  4. The hidden 5 EGP payment-test consultant is switched off (no bookable hours). Re-enable for a test with:
--       update public.schedules set weekly = (select weekly from public.schedules where consultant_id = 'mohamed-gamal')
--       where consultant_id = 'test-ek-q7m4x9';

-- 1 ---------------------------------------------------------------------------------------------------------
revoke execute on function public.submit_payment(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.create_receipt_upload(text, text) from public, anon, authenticated;

-- 2 ---------------------------------------------------------------------------------------------------------
-- The caller's IP as seen by the API gateway (Cloudflare's header first). Null when not called over HTTP.
create function public.request_ip()
returns text language sql stable
set search_path = ''
as $$
  select nullif(btrim(coalesce(
    nullif(current_setting('request.headers', true), '')::json->>'cf-connecting-ip',
    split_part(nullif(current_setting('request.headers', true), '')::json->>'x-forwarded-for', ',', 1))), '')
$$;
revoke execute on function public.request_ip() from public, anon, authenticated;

create or replace function public.reserve_slot(p_consultant_id text, p_format text, p_starts_at timestamp with time zone, p_details jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_name text := btrim(p_details->>'name');
  v_phone text := public.clean_phone(coalesce(p_details->>'phone', ''));
  v_email text := nullif(btrim(coalesce(p_details->>'email', '')), '');
  v_channel text := coalesce(p_details->>'channel', 'whatsapp');
  v_lang text := coalesce(p_details->>'lang', p_details->>'consultationLang', 'ar');
  v_program text := nullif(btrim(coalesce(p_details->>'program', '')), '');
  v_note text := nullif(btrim(coalesce(p_details->>'note', '')), '');
  v_cb public.consultant_branches;
  b public.bookings;
begin
  perform public.assert_customer_access();
  if p_details is null or jsonb_typeof(p_details) <> 'object' then raise exception 'INVALID_INPUT' using detail = 'details'; end if;
  if p_format is null or p_format not in ('online','in-person') then raise exception 'INVALID_INPUT' using detail = 'format'; end if;
  if p_starts_at is null then raise exception 'INVALID_INPUT' using detail = 'starts_at'; end if;
  if v_name is null or v_name = '' or char_length(v_name) > 100 then raise exception 'INVALID_INPUT' using detail = 'name'; end if;
  if v_phone !~ '^\+\d{8,15}$' then raise exception 'INVALID_INPUT' using detail = 'phone'; end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$') then
    raise exception 'INVALID_INPUT' using detail = 'email';
  end if;
  if v_channel not in ('email','whatsapp') or (v_channel = 'email' and v_email is null) then
    raise exception 'INVALID_INPUT' using detail = 'channel';
  end if;
  if v_lang not in ('ar','en') then raise exception 'INVALID_INPUT' using detail = 'lang'; end if;
  if char_length(v_program) > 50 then raise exception 'INVALID_INPUT' using detail = 'program'; end if;
  if char_length(v_note) > 300 then raise exception 'INVALID_INPUT' using detail = 'note'; end if;
  select * into v_cb from public.consultant_branches where consultant_id = p_consultant_id;
  if not found then raise exception 'INVALID_INPUT' using detail = 'consultant'; end if;

  perform public.hit_rate_limit('reserve:' || v_phone, 5, interval '10 minutes');
  -- Per connection too, so rotating fake phone numbers can't hold every slot.
  if public.request_ip() is not null then
    perform public.hit_rate_limit('reserve-ip:' || public.request_ip(), 15, interval '10 minutes');
  end if;

  perform public.lock_consultant_day(p_consultant_id, p_starts_at);
  perform public.expire_stale_holds(p_consultant_id, public.booking_blocks_range(p_starts_at, p_starts_at + interval '30 minutes'));
  perform public.assert_slot_open(p_consultant_id, p_format, p_starts_at);

  for attempt in 1..5 loop
    begin
      insert into public.bookings (reference, qr_token, manage_token, consultant_id, branch_id, format, starts_at, ends_at, tz,
        price_amount, price_currency, customer_name, customer_phone, customer_email, channel, lang, program, note,
        status, hold_expires_at)
      values (public.gen_reference(), public.gen_token(), public.gen_token(), p_consultant_id, v_cb.branch_id,
        p_format::public.booking_format, p_starts_at, p_starts_at + interval '30 minutes', v_cb.tz,
        v_cb.price_amount, 'EGP', v_name, v_phone, v_email, v_channel, v_lang, v_program, v_note,
        'reserved', now() + interval '30 minutes')
      returning * into b;
      exit;
    exception
      when exclusion_violation then raise exception 'SLOT_TAKEN';
      when unique_violation then
        if attempt = 5 then raise; end if;  -- reference/token collision: retry with fresh values
    end;
  end loop;

  insert into public.audit_log(actor_kind, booking_id, action, from_value, to_value)
  values ('customer', b.id, 'created', null, 'reserved');
  return jsonb_build_object('booking_id', b.id, 'reference', b.reference, 'manage_token', b.manage_token,
                            'hold_expires_at', b.hold_expires_at);
end $function$;


create or replace function public.find_booking(p_reference text, p_phone text)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_ref text := upper(regexp_replace(public.normalize_digits(coalesce(p_reference, '')), '\s', '', 'g'));
  v_phone text := public.clean_phone(coalesce(p_phone, ''));
begin
  perform public.assert_customer_access();
  if public.request_ip() is not null then
    perform public.hit_rate_limit('find-ip:' || public.request_ip(), 30, interval '10 minutes');
  end if;
  if v_ref !~ '^MG-[A-Z0-9]{4}-[A-Z0-9]{4}$' or v_phone !~ '^\+\d{8,15}$' then return null; end if;
  perform public.hit_rate_limit('find-ref:' || v_ref, 10, interval '10 minutes');
  perform public.hit_rate_limit('find-phone:' || v_phone, 20, interval '10 minutes');
  return (select manage_token from public.bookings where reference = v_ref and customer_phone = v_phone);
end $function$;

-- 3 ---------------------------------------------------------------------------------------------------------
drop function public.open_easykash_attempt(text);
create function public.open_easykash_attempt(p_manage_token text)
returns text language plpgsql volatile security definer
set search_path = ''
as $$
declare b public.bookings;
begin
  b := public.booking_by_token(p_manage_token);
  if b.id is null then return null; end if;
  perform public.hit_rate_limit('ek-check:' || b.id::text, 40, interval '10 minutes');
  return (select a.customer_reference from public.easykash_attempts a
          where a.booking_id = b.id and a.status = 'started'
          order by a.attempt_no desc nulls last, a.created_at desc limit 1);
end $$;
revoke execute on function public.open_easykash_attempt(text) from public, anon, authenticated;
grant execute on function public.open_easykash_attempt(text) to service_role;

-- 4 ---------------------------------------------------------------------------------------------------------
update public.schedules set weekly = '{}'::jsonb where consultant_id = 'test-ek-q7m4x9';
