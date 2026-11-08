-- 0036_hourly_45min_and_admin_test: every consultation is a fixed 45 minutes and slots start on the hour (one
-- booking per consultant per hour: 45 minutes + the 10-minute buffer fit inside the hour). The 5 EGP payment-test
-- consultant is back on, but only an admin can book it: reserve_slot asks for the admin test key, which only an
-- active admin can read (admin_test_key()). Existing bookings keep their length; the unpaid-hold time stays 30 min.

-- Hourly 45-minute slots ------------------------------------------------------------------------------------
create or replace function public.schedule_slots(p_consultant_id text, p_date date, p_format text)
returns setof timestamp with time zone
language sql stable
set search_path to ''
as $function$
  select st
  from public.schedules s
  join public.consultant_branches cb on cb.consultant_id = s.consultant_id
  cross join lateral jsonb_array_elements(coalesce(s.weekly -> extract(dow from p_date)::int::text, '[]'::jsonb)) w
  cross join lateral generate_series((w->>'start')::int, (w->>'end')::int - 45, 60) m
  cross join lateral (select (p_date + make_interval(mins => m)) at time zone cb.tz as st) x
  where s.consultant_id = p_consultant_id
    and p_format = any(s.formats)
    and not exists (select 1 from public.schedule_exceptions e
                    where e.consultant_id = s.consultant_id and p_date between e.starts_on and e.ends_on)
    and st >= now()
    and not exists (select 1 from jsonb_array_elements(coalesce(s.breaks, '[]'::jsonb)) br
                    where st < (p_date + make_interval(mins => (br->>'end')::int)) at time zone cb.tz
                      and st + interval '45 minutes' > (p_date + make_interval(mins => (br->>'start')::int)) at time zone cb.tz)
  order by st
$function$;

create or replace function public.slot_clashes(p_consultant_id text, p_starts_at timestamp with time zone, p_exclude uuid default null::uuid)
returns boolean
language sql stable
set search_path to ''
as $function$
  select exists (select 1 from public.bookings b
    where b.consultant_id = p_consultant_id and b.id is distinct from p_exclude
      and public.is_blocking(b.status, b.hold_expires_at)
      and b.blocks_range && public.booking_blocks_range(p_starts_at, p_starts_at + interval '45 minutes'))
$function$;

-- Admin-only test consultant --------------------------------------------------------------------------------
alter table public.consultant_branches add column admin_only boolean not null default false;
update public.consultant_branches set admin_only = true where consultant_id = 'test-ek-q7m4x9';
update public.schedules set weekly = (select weekly from public.schedules where consultant_id = 'mohamed-gamal')
where consultant_id = 'test-ek-q7m4x9';
select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'admin_test_key',
  'Lets a signed-in admin book admin-only (payment test) consultants');

-- Admins only: the key the booking form sends for admin-only consultants.
create function public.admin_test_key()
returns text language plpgsql stable security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return (select decrypted_secret from vault.decrypted_secrets where name = 'admin_test_key');
end $$;
revoke execute on function public.admin_test_key() from public, anon;
grant execute on function public.admin_test_key() to authenticated;

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
  -- Admin-only consultants (the payment test) need the admin test key, which only a signed-in admin can read.
  if v_cb.admin_only and (p_details->>'testKey') is distinct from
     (select decrypted_secret from vault.decrypted_secrets where name = 'admin_test_key') then
    raise exception 'FORBIDDEN';
  end if;

  perform public.hit_rate_limit('reserve:' || v_phone, 5, interval '10 minutes');
  -- Per connection too, so rotating fake phone numbers can't hold every slot.
  if public.request_ip() is not null then
    perform public.hit_rate_limit('reserve-ip:' || public.request_ip(), 15, interval '10 minutes');
  end if;

  perform public.lock_consultant_day(p_consultant_id, p_starts_at);
  perform public.expire_stale_holds(p_consultant_id, public.booking_blocks_range(p_starts_at, p_starts_at + interval '45 minutes'));
  perform public.assert_slot_open(p_consultant_id, p_format, p_starts_at);

  for attempt in 1..5 loop
    begin
      insert into public.bookings (reference, qr_token, manage_token, consultant_id, branch_id, format, starts_at, ends_at, tz,
        price_amount, price_currency, customer_name, customer_phone, customer_email, channel, lang, program, note,
        status, hold_expires_at)
      values (public.gen_reference(), public.gen_token(), public.gen_token(), p_consultant_id, v_cb.branch_id,
        p_format::public.booking_format, p_starts_at, p_starts_at + interval '45 minutes', v_cb.tz,
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
