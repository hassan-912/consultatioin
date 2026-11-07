-- 0033_consultant_price: each consultant carries their own price (1,000 EGP for everyone, as before), and a
-- hidden test consultant at 5 EGP for a cheap end-to-end EasyKash payment. The test consultant isn't in the
-- site's directory; it is reached only by its link. Remove it after testing:
--   delete from public.schedules where consultant_id = 'test-ek-q7m4x9';
--   delete from public.consultant_branches where consultant_id = 'test-ek-q7m4x9';
alter table public.consultant_branches add column price_amount int not null default 1000 check (price_amount > 0);

insert into public.consultant_branches (consultant_id, branch_id, tz, price_amount)
values ('test-ek-q7m4x9', 'nasr-city', 'Africa/Cairo', 5);
insert into public.schedules (consultant_id, weekly, breaks, formats, max_per_day, buffer_min)
select 'test-ek-q7m4x9', weekly, breaks, array['online'], max_per_day, buffer_min
from public.schedules where consultant_id = 'mohamed-gamal';

-- As 0014's reserve_slot, except the price comes from the consultant instead of a fixed 1000.
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
