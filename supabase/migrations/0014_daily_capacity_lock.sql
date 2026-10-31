-- 0014_daily_capacity_lock: serialize schedules.max_per_day per consultant and local calendar day.
-- Race fixed: two transactions each saw busy_count < cap (READ COMMITTED), inserted non-overlapping bookings
-- (the exclusion constraint only guards overlap) and both committed, exceeding the cap.
--
-- Design: a transaction-scoped advisory lock keyed on (consultant, consultant-local date) is taken before any
-- operation that ADDS to that day's blocking count, and the cap is re-read after the lock is held.
-- Lock order everywhere: (1) the booking row FOR UPDATE, if the operation has one;
--                        (2) the consultant-day advisory lock;
--                        (3) other rows (stale holds are only touched with SKIP LOCKED, so (3) never waits).
-- Cron expire_due_holds takes only row locks and no day lock (expiry removes from the count), so it cannot close a cycle.
-- Operations that add to a day: reserve_slot, reschedule_booking, and apply_transition released -> blocking
-- (rejected resubmission = submit-payment; late-transfer verification). Transitions that are already blocking
-- (on-hold -> confirmed, reserved -> on-hold, ...) never re-check, so they never count themselves twice.
-- Additive: replaces function bodies only; no data is touched; ACLs are preserved by create or replace.

create function public.lock_consultant_day(p_consultant_id text, p_starts_at timestamptz)
returns void language plpgsql
set search_path = ''
as $$
declare v_tz text;
begin
  select tz into v_tz from public.consultant_branches where consultant_id = p_consultant_id;
  if v_tz is null then return; end if;  -- unknown consultants are rejected by the callers' own validation
  perform pg_advisory_xact_lock(hashtextextended('consultant-day:' || p_consultant_id || ':' || ((p_starts_at at time zone v_tz)::date)::text, 0));
end $$;

-- Caller must already hold the day lock. Raises SLOT_TAKEN (detail 'daily limit') when the day is full.
create function public.assert_daily_capacity(p_consultant_id text, p_starts_at timestamptz, p_exclude uuid default null)
returns void language plpgsql
set search_path = ''
as $$
declare
  v_tz text;
  v_cap int;
begin
  select cb.tz, s.max_per_day into v_tz, v_cap
  from public.consultant_branches cb join public.schedules s on s.consultant_id = cb.consultant_id
  where cb.consultant_id = p_consultant_id;
  if v_cap is not null and public.busy_count(p_consultant_id, (p_starts_at at time zone v_tz)::date, p_exclude) >= v_cap then
    raise exception 'SLOT_TAKEN' using detail = 'daily limit';
  end if;
end $$;

revoke execute on function public.lock_consultant_day(text, timestamptz), public.assert_daily_capacity(text, timestamptz, uuid)
  from public, anon, authenticated, service_role;

-- Same as 0005 except: stale holds locked by another transaction are skipped instead of waited on
-- (waiting would invert the lock order against a transaction that holds that row and wants the day lock).
create or replace function public.expire_stale_holds(p_consultant_id text, p_range tstzrange, p_exclude uuid default null)
returns int language plpgsql
set search_path = ''
as $$
declare n int;
begin
  with locked as (
    select b.id from public.bookings b
    where b.consultant_id = p_consultant_id and b.status = 'reserved' and b.hold_expires_at <= now()
      and b.blocks_range && p_range and b.id is distinct from p_exclude
    order by b.id
    for update skip locked),
  due as (
    update public.bookings b set status = 'expired'
    from locked where b.id = locked.id
    returning b.id)
  insert into public.audit_log(actor_kind, booking_id, action, from_value, to_value)
  select 'system', id, 'transition', 'reserved', 'expired' from due;
  get diagnostics n = row_count;
  return n;
end $$;

-- Same as 0006 except the day lock is taken before the cap is read.
create or replace function public.assert_slot_open(p_consultant_id text, p_format text, p_starts_at timestamptz, p_exclude uuid default null)
returns void language plpgsql
set search_path = ''
as $$
declare
  tz text;
  d date;
begin
  select cb.tz into tz
  from public.consultant_branches cb join public.schedules s on s.consultant_id = cb.consultant_id
  where cb.consultant_id = p_consultant_id;
  if tz is null then raise exception 'INVALID_INPUT' using detail = 'unknown consultant'; end if;
  if p_starts_at < now() then raise exception 'SLOT_TAKEN' using detail = 'past'; end if;
  d := (p_starts_at at time zone tz)::date;
  perform public.lock_consultant_day(p_consultant_id, p_starts_at);  -- re-entrant within one transaction
  if not exists (select 1 from public.schedule_slots(p_consultant_id, d, p_format) st where st = p_starts_at) then
    raise exception 'SLOT_TAKEN' using detail = 'outside schedule';
  end if;
  perform public.assert_daily_capacity(p_consultant_id, p_starts_at, p_exclude);
  if public.slot_clashes(p_consultant_id, p_starts_at, p_exclude) then
    raise exception 'SLOT_TAKEN';
  end if;
end $$;

-- Same as 0005 plus the day lock + cap re-check when a released booking returns to the timeline.
create or replace function public.apply_transition(
  p_booking_id uuid, p_event text, p_actor_kind text, p_actor_user uuid default null, p_reason text default null)
returns public.bookings language plpgsql
set search_path = ''
as $$
declare
  b public.bookings;
  nb public.bookings;
  allowed public.booking_status[];
  tgt public.booking_status;
  act text;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  allowed := case p_event
    when 'submit-payment' then array['reserved','rejected']
    when 'verify'         then array['on-hold','wrong-amount','duplicate','late-transfer']
    when 'reject'         then array['on-hold']
    when 'wrong-amount'   then array['on-hold']
    when 'duplicate'      then array['on-hold']
    when 'late'           then array['expired']
    when 'expire'         then array['reserved','rejected']
    when 'check-in'       then array['confirmed']
    when 'complete'       then array['confirmed','checked-in']
    when 'no-show'        then array['confirmed']
    when 'cancel'         then array['reserved','on-hold','confirmed','rejected','wrong-amount','duplicate','late-transfer']
    when 'mark-sent'      then array['confirmed']
  end::public.booking_status[];
  if allowed is null then raise exception 'INVALID_INPUT' using detail = 'unknown event ' || coalesce(p_event, 'null'); end if;
  if not (b.status = any(allowed)) then
    raise exception 'INVALID_TRANSITION' using detail = format('cannot %s from %s', p_event, b.status);
  end if;

  if p_event = 'mark-sent' then
    if p_reason is null or p_reason not in ('email','whatsapp') then
      raise exception 'INVALID_INPUT' using detail = 'mark-sent needs channel email|whatsapp';
    end if;
    update public.bookings set ticket_sent_via = p_reason, ticket_sent_at = now() where id = b.id returning * into nb;
    insert into public.audit_log(actor_user, actor_kind, booking_id, action, from_value, to_value)
    values (p_actor_user, p_actor_kind, b.id, 'sent', b.status::text, p_reason);
    return nb;
  end if;

  -- An unpaid hold expires; a rejected payment may be resubmitted (slot re-checked below).
  if p_event = 'submit-payment' and b.status = 'reserved' and now() > b.hold_expires_at then
    raise exception 'HOLD_EXPIRED';
  end if;

  tgt := case p_event
    when 'submit-payment' then 'on-hold' when 'verify' then 'confirmed' when 'reject' then 'rejected'
    when 'wrong-amount' then 'wrong-amount' when 'duplicate' then 'duplicate' when 'late' then 'late-transfer'
    when 'expire' then 'expired' when 'check-in' then 'checked-in' when 'complete' then 'completed'
    when 'no-show' then 'no-show' when 'cancel' then 'cancelled'
  end::public.booking_status;

  -- Moving a released slot (rejected / late-transfer) back onto the timeline: stale holds don't count.
  -- Adding to the consultant's day: row lock (above) -> day lock, then re-check the cap against committed data.
  if public.is_blocking(tgt, b.hold_expires_at) and not public.is_blocking(b.status, b.hold_expires_at) then
    perform public.lock_consultant_day(b.consultant_id, b.starts_at);
    perform public.expire_stale_holds(b.consultant_id, b.blocks_range, b.id);
    perform public.assert_daily_capacity(b.consultant_id, b.starts_at, b.id);
  end if;

  begin
    update public.bookings set
      status = tgt,
      reject_reason = case when p_event = 'reject' then p_reason when p_event = 'submit-payment' then null else reject_reason end,
      meeting_url = case when p_event = 'verify' and format = 'online'
                         then '#/meet/' || encode(extensions.gen_random_bytes(16), 'hex') else meeting_url end,
      checked_in_at = case when p_event = 'check-in' then now() else checked_in_at end
    where id = b.id
    returning * into nb;
  exception when exclusion_violation then
    raise exception 'SLOT_TAKEN';
  end;

  act := case p_event when 'submit-payment' then 'submitted' when 'check-in' then 'checkin' else 'transition' end;
  insert into public.audit_log(actor_user, actor_kind, booking_id, action, from_value, to_value)
  values (p_actor_user, p_actor_kind, b.id, act, b.status::text, tgt::text);
  return nb;
end $$;

-- Same as 0010 plus the day lock before stale holds are expired.
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

  perform public.lock_consultant_day(b.consultant_id, p_starts_at);
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
