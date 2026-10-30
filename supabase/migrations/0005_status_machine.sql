-- 0005_status_machine: digit normalization + booking status machine (mirrors src/domain/bookingStatus.ts).
-- Errors are raised with SQLSTATE P0001 and the error code as the message:
--   NOT_FOUND, INVALID_TRANSITION, HOLD_EXPIRED, SLOT_TAKEN, INVALID_INPUT.

-- Arabic-Indic (٠-٩) and Persian (۰-۹) digits -> Western digits (src/domain/phone.ts normalizeDigits).
create function public.normalize_digits(s text)
returns text language sql immutable parallel safe
set search_path = ''
as $$ select translate(s, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789') $$;

-- src/domain/phone.ts cleanPhone: normalize digits, strip spaces, dashes, dots and parentheses.
create function public.clean_phone(s text)
returns text language sql immutable parallel safe
set search_path = ''
as $$ select regexp_replace(public.normalize_digits(s), '[\s\-().]', '', 'g') $$;

-- Statuses that occupy the consultant's timeline (src/domain/availability.ts isBlocking).
-- An unpaid hold blocks only until its deadline.
create function public.is_blocking(st public.booking_status, hold_expires_at timestamptz)
returns boolean language sql stable parallel safe
set search_path = ''
as $$ select st in ('on-hold','confirmed','checked-in','completed','wrong-amount','duplicate')
          or (st = 'reserved' and hold_expires_at > now()) $$;

-- The exclusion constraint counts every 'reserved' row, but a hold past its deadline no longer blocks
-- (cron flips them every minute). Before claiming a range, expire stale holds overlapping it.
create function public.expire_stale_holds(p_consultant_id text, p_range tstzrange, p_exclude uuid default null)
returns int language plpgsql
set search_path = ''
as $$
declare n int;
begin
  with due as (
    update public.bookings b set status = 'expired'
    where b.consultant_id = p_consultant_id and b.status = 'reserved' and b.hold_expires_at <= now()
      and b.blocks_range && p_range and b.id is distinct from p_exclude
    returning b.id)
  insert into public.audit_log(actor_kind, booking_id, action, from_value, to_value)
  select 'system', id, 'transition', 'reserved', 'expired' from due;
  get diagnostics n = row_count;
  return n;
end $$;

-- Single entry point for every status change. Internal: not executable by anon/authenticated;
-- customer RPCs (0006) and the staff wrapper (Task 4) call it. Writes audit_log in the same transaction.
-- p_reason carries the reject reason, or the channel ('email'|'whatsapp') for mark-sent.
create function public.apply_transition(
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
  if public.is_blocking(tgt, b.hold_expires_at) and not public.is_blocking(b.status, b.hold_expires_at) then
    perform public.expire_stale_holds(b.consultant_id, b.blocks_range, b.id);
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

-- src/domain/bookingStatus.ts checkInVerdict. Pass a null status for "no booking found".
create function public.check_in_verdict(p_status public.booking_status, p_starts_at timestamptz, p_tz text, p_today date)
returns text language sql stable
set search_path = ''
as $$
  select case
    when p_status is null then 'not-found'
    when p_status in ('reserved','rejected') then 'unpaid'
    when p_status in ('on-hold','wrong-amount','duplicate','late-transfer') then 'on-hold'
    when p_status in ('checked-in','completed') then 'already-used'
    when p_status = 'cancelled' then 'cancelled'
    when p_status in ('expired','no-show') then 'expired'
    when (p_starts_at at time zone p_tz)::date = p_today then 'ok'
    else 'wrong-date'
  end
$$;

-- Internal helpers: no direct access for API roles (defaults already revoke; be explicit).
revoke execute on function public.apply_transition(uuid, text, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.expire_stale_holds(text, tstzrange, uuid) from public, anon, authenticated;
revoke execute on function public.check_in_verdict(public.booking_status, timestamptz, text, date) from public, anon, authenticated;
revoke execute on function public.is_blocking(public.booking_status, timestamptz) from public, anon, authenticated;
-- Pure text helpers are harmless to expose.
grant execute on function public.normalize_digits(text) to anon, authenticated, service_role;
grant execute on function public.clean_phone(text) to anon, authenticated, service_role;
