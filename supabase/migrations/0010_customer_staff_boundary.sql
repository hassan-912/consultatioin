-- 0010_customer_staff_boundary: customer capabilities must not bypass staff permissions.
-- Active staff use staff RPCs; customer pages must use a dedicated anonymous client.
-- Keep this guard at entry to future customer token/receipt endpoints too.
create function public.assert_customer_access()
returns void language plpgsql stable security definer
set search_path = ''
as $$
begin
  if public.current_staff_role() is not null then raise exception 'FORBIDDEN'; end if;
end $$;
revoke execute on function public.assert_customer_access() from public, anon, authenticated, service_role;

create or replace function public.reserve_slot(p_consultant_id text, p_format text, p_starts_at timestamptz, p_details jsonb)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
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

  perform public.expire_stale_holds(p_consultant_id, public.booking_blocks_range(p_starts_at, p_starts_at + interval '30 minutes'));
  perform public.assert_slot_open(p_consultant_id, p_format, p_starts_at);

  for attempt in 1..5 loop
    begin
      insert into public.bookings (reference, qr_token, manage_token, consultant_id, branch_id, format, starts_at, ends_at, tz,
        price_amount, price_currency, customer_name, customer_phone, customer_email, channel, lang, program, note,
        status, hold_expires_at)
      values (public.gen_reference(), public.gen_token(), public.gen_token(), p_consultant_id, v_cb.branch_id,
        p_format::public.booking_format, p_starts_at, p_starts_at + interval '30 minutes', v_cb.tz,
        1000, 'EGP', v_name, v_phone, v_email, v_channel, v_lang, v_program, v_note,
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
end $$;

create or replace function public.submit_payment(p_manage_token text, p_method text, p_txn_ref text, p_receipt_path text default null)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  b public.bookings;
  v_txn text := btrim(public.normalize_digits(coalesce(p_txn_ref, '')));
begin
  perform public.assert_customer_access();
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

create or replace function public.get_booking(p_manage_token text)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
begin
  perform public.assert_customer_access();
  return (select public.customer_view(b) from public.booking_by_token(p_manage_token) b where b.id is not null);
end $$;

create or replace function public.find_booking(p_reference text, p_phone text)
returns text language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_ref text := upper(regexp_replace(public.normalize_digits(coalesce(p_reference, '')), '\s', '', 'g'));
  v_phone text := public.clean_phone(coalesce(p_phone, ''));
begin
  perform public.assert_customer_access();
  if v_ref !~ '^MG-[A-Z0-9]{4}-[A-Z0-9]{4}$' or v_phone !~ '^\+\d{8,15}$' then return null; end if;
  perform public.hit_rate_limit('find-ref:' || v_ref, 10, interval '10 minutes');
  perform public.hit_rate_limit('find-phone:' || v_phone, 20, interval '10 minutes');
  return (select manage_token from public.bookings where reference = v_ref and customer_phone = v_phone);
end $$;

create or replace function public.cancel_booking(p_manage_token text)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare b public.bookings;
begin
  perform public.assert_customer_access();
  b := public.booking_by_token(p_manage_token);
  if b.id is null then raise exception 'NOT_FOUND'; end if;
  return public.customer_view(public.apply_transition(b.id, 'cancel', 'customer'));
end $$;

create or replace function public.reschedule_booking(p_manage_token text, p_starts_at timestamptz)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  b public.bookings;
  nb public.bookings;
begin
  perform public.assert_customer_access();
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
