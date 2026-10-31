-- 0008_rls_staff: staff roles, row-level security and staff RPCs (spec §4).
-- Staff read tables directly through SELECT policies; every write goes through a SECURITY DEFINER RPC that checks
-- the caller's role (staff_profiles, active only). Errors (SQLSTATE P0001, message = code): FORBIDDEN, NOT_FOUND,
-- INVALID_INPUT, INVALID_TRANSITION, SLOT_TAKEN.
-- Decisions:
--   * reception reads every booking, not just today's: the reception workspace has a full Bookings screen
--     (src/features/staff/permissions.ts); "today" is a UI filter.
--   * mark-sent passes the channel ('email' | 'whatsapp') in p_reason, the same convention as apply_transition.
--   * admins cannot demote or deactivate themselves (prevents locking every admin out).

-- ---------------------------------------------------------------- role helpers
-- Role of the signed-in user, or null when not an active staff member.
create function public.current_staff_role()
returns public.staff_role language sql stable security definer
set search_path = ''
as $$ select role from public.staff_profiles where user_id = auth.uid() and active $$;

-- consultant_id of the signed-in consultant (null for other roles / non-staff).
create function public.current_consultant_id()
returns text language sql stable security definer
set search_path = ''
as $$ select consultant_id from public.staff_profiles where user_id = auth.uid() and active and role = 'consultant' $$;

create function public.require_admin()
returns void language plpgsql stable
set search_path = ''
as $$
begin
  if public.current_staff_role() is distinct from 'admin' then raise exception 'FORBIDDEN'; end if;
end $$;

-- ---------------------------------------------------------------- table privileges + RLS
-- Read-only for signed-in users (rows filtered by the policies below); no direct writes, and no TRUNCATE,
-- which RLS does not cover.
revoke all on public.bookings, public.payments, public.audit_log, public.consultation_records,
  public.schedules, public.schedule_exceptions, public.staff_profiles from anon, authenticated;
grant select on public.bookings, public.payments, public.audit_log, public.consultation_records,
  public.schedules, public.schedule_exceptions, public.staff_profiles to authenticated;

create policy bookings_staff_read on public.bookings for select to authenticated using (
  (select public.current_staff_role()) in ('admin','finance','reception')
  or consultant_id = (select public.current_consultant_id()));

create policy payments_staff_read on public.payments for select to authenticated using (
  (select public.current_staff_role()) in ('admin','finance'));

create policy audit_log_staff_read on public.audit_log for select to authenticated using (
  (select public.current_staff_role()) in ('admin','finance'));

create policy consultation_records_staff_read on public.consultation_records for select to authenticated using (
  (select public.current_staff_role()) = 'admin'
  or exists (select 1 from public.bookings b
             where b.id = booking_id and b.consultant_id = (select public.current_consultant_id())));

create policy schedules_staff_read on public.schedules for select to authenticated using (
  (select public.current_staff_role()) is not null);

create policy schedule_exceptions_staff_read on public.schedule_exceptions for select to authenticated using (
  (select public.current_staff_role()) is not null);

create policy staff_profiles_self_or_admin_read on public.staff_profiles for select to authenticated using (
  user_id = (select auth.uid()) or (select public.current_staff_role()) = 'admin');

-- ---------------------------------------------------------------- staff_transition
-- finance: verify / reject / wrong-amount / duplicate / late / mark-sent; reception: check-in / no-show;
-- consultant: complete / no-show on own bookings; admin: every staff event (incl. cancel).
-- Payment decisions (verify / reject / wrong-amount / duplicate) are stamped on the latest payment.
create function public.staff_transition(p_booking_id uuid, p_event text, p_reason text default null)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  r public.staff_role := public.current_staff_role();
  b public.bookings;
  nb public.bookings;
  allowed boolean;
begin
  if r is null then raise exception 'FORBIDDEN'; end if;
  if p_event is null or p_event not in
      ('verify','reject','wrong-amount','duplicate','late','mark-sent','check-in','complete','no-show','cancel') then
    raise exception 'INVALID_INPUT' using detail = 'not a staff event: ' || coalesce(p_event, 'null');
  end if;
  if char_length(p_reason) > 300 then raise exception 'INVALID_INPUT' using detail = 'reason'; end if;

  select * into b from public.bookings where id = p_booking_id;
  if not found then
    if r = 'consultant' then raise exception 'FORBIDDEN'; end if;  -- don't reveal other consultants' ids
    raise exception 'NOT_FOUND';
  end if;

  allowed := case r
      when 'admin' then true
      when 'finance' then p_event in ('verify','reject','wrong-amount','duplicate','late','mark-sent')
      when 'reception' then p_event in ('check-in','no-show')
      when 'consultant' then p_event in ('complete','no-show') and b.consultant_id = public.current_consultant_id()
    end;
  if not coalesce(allowed, false) then raise exception 'FORBIDDEN'; end if;

  nb := public.apply_transition(b.id, p_event, r::text, auth.uid(), p_reason);

  if p_event in ('verify','reject','wrong-amount','duplicate') then
    update public.payments set decided_by = auth.uid(), decided_at = now(), decision = p_event
    where id = (select p.id from public.payments p where p.booking_id = b.id
                order by p.submitted_at desc, p.created_at desc limit 1);
  end if;
  return to_jsonb(nb);
end $$;

-- ---------------------------------------------------------------- check_in
-- Code = qr_token (32 hex) or reference (case/space-insensitive, Arabic digits ok). Verdict as checkInVerdict with
-- "today" in the booking's time zone; on 'ok' the check-in is recorded in the same transaction. The row lock makes
-- a concurrent second scan wait and then answer 'already-used'.
create function public.check_in(p_code text)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  r public.staff_role := public.current_staff_role();
  v text := btrim(public.normalize_digits(coalesce(p_code, '')));
  b public.bookings;
  verdict text;
begin
  if r is null or r not in ('reception','admin') then raise exception 'FORBIDDEN'; end if;
  if char_length(v) > 100 then raise exception 'INVALID_INPUT' using detail = 'code'; end if;

  if v ~ '^[0-9a-fA-F]{32}$' then
    select * into b from public.bookings where qr_token = lower(v) for update;
  else
    select * into b from public.bookings where reference = upper(regexp_replace(v, '\s', '', 'g')) for update;
  end if;
  if not found then return jsonb_build_object('verdict', 'not-found', 'booking', null); end if;

  verdict := public.check_in_verdict(b.status, b.starts_at, b.tz, (now() at time zone b.tz)::date);
  if verdict = 'ok' then
    b := public.apply_transition(b.id, 'check-in', r::text, auth.uid());
  end if;
  return jsonb_build_object('verdict', verdict, 'booking', jsonb_build_object(
    'id', b.id, 'reference', b.reference, 'customer_name', b.customer_name, 'consultant_id', b.consultant_id,
    'branch_id', b.branch_id, 'format', b.format, 'starts_at', b.starts_at, 'ends_at', b.ends_at, 'tz', b.tz,
    'status', b.status, 'checked_in_at', b.checked_in_at));
end $$;

-- ---------------------------------------------------------------- save_record
create function public.save_record(p_booking_id uuid, p_notes text, p_outcome text)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  r public.staff_role := public.current_staff_role();
  cid text;
  rec public.consultation_records;
begin
  if r is null or r not in ('admin','consultant') then raise exception 'FORBIDDEN'; end if;
  select consultant_id into cid from public.bookings where id = p_booking_id;
  if r = 'consultant' and cid is distinct from public.current_consultant_id() then raise exception 'FORBIDDEN'; end if;
  if cid is null then raise exception 'NOT_FOUND'; end if;
  if char_length(p_notes) > 10000 then raise exception 'INVALID_INPUT' using detail = 'notes'; end if;
  if char_length(p_outcome) > 200 then raise exception 'INVALID_INPUT' using detail = 'outcome'; end if;

  insert into public.consultation_records as c (booking_id, notes, outcome, updated_by)
  values (p_booking_id, p_notes, p_outcome, auth.uid())
  on conflict (booking_id) do update set notes = excluded.notes, outcome = excluded.outcome, updated_by = excluded.updated_by
  returning * into rec;
  insert into public.audit_log(actor_user, actor_kind, booking_id, action, from_value, to_value)
  values (auth.uid(), r::text, p_booking_id, 'record', null, p_outcome);
  return to_jsonb(rec);
end $$;

-- ---------------------------------------------------------------- admin RPCs
-- weekly: {"0".."6": [{"start": min, "end": min}, ...]} (0 = Sunday, minutes from local midnight);
-- breaks: [{"start", "end"}]; formats ⊆ {online, in-person}, non-empty; max_per_day null or 1..100.
create function public.valid_windows(w jsonb)
returns boolean language sql immutable
set search_path = ''
as $$
  select case when jsonb_typeof(w) = 'array' then not exists (
    select 1 from jsonb_array_elements(w) x
    where case when jsonb_typeof(x) = 'object' and jsonb_typeof(x->'start') = 'number' and jsonb_typeof(x->'end') = 'number'
               then not ((x->>'start')::numeric between 0 and 1440 and (x->>'end')::numeric between 0 and 1440
                         and (x->>'start')::numeric < (x->>'end')::numeric
                         and (x->>'start')::numeric % 1 = 0 and (x->>'end')::numeric % 1 = 0)
               else true end)
  else false end
$$;

create function public.upsert_schedule(p_consultant_id text, p_weekly jsonb, p_breaks jsonb, p_formats text[], p_max_per_day int)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare s public.schedules;
begin
  perform public.require_admin();
  if not exists (select 1 from public.consultant_branches where consultant_id = p_consultant_id) then
    raise exception 'INVALID_INPUT' using detail = 'consultant';
  end if;
  if p_weekly is null or jsonb_typeof(p_weekly) <> 'object'
     or exists (select 1 from jsonb_each(p_weekly) d where d.key !~ '^[0-6]$' or not public.valid_windows(d.value)) then
    raise exception 'INVALID_INPUT' using detail = 'weekly';
  end if;
  if not public.valid_windows(coalesce(p_breaks, '[]'::jsonb)) then raise exception 'INVALID_INPUT' using detail = 'breaks'; end if;
  if p_formats is null or cardinality(p_formats) = 0 or not (p_formats <@ array['online','in-person']) then
    raise exception 'INVALID_INPUT' using detail = 'formats';
  end if;
  if p_max_per_day is not null and p_max_per_day not between 1 and 100 then
    raise exception 'INVALID_INPUT' using detail = 'max_per_day';
  end if;

  insert into public.schedules as t (consultant_id, weekly, breaks, formats, max_per_day)
  values (p_consultant_id, p_weekly, coalesce(p_breaks, '[]'::jsonb), p_formats, p_max_per_day)
  on conflict (consultant_id) do update set
    weekly = excluded.weekly, breaks = excluded.breaks, formats = excluded.formats, max_per_day = excluded.max_per_day
  returning * into s;
  insert into public.audit_log(actor_user, actor_kind, action, from_value, to_value)
  values (auth.uid(), 'admin', 'schedule', null, p_consultant_id);
  return to_jsonb(s);
end $$;

create function public.add_exception(p_consultant_id text, p_kind text, p_starts_on date, p_ends_on date)
returns uuid language plpgsql volatile security definer
set search_path = ''
as $$
declare new_id uuid;
begin
  perform public.require_admin();
  if p_kind is null or p_kind not in ('holiday','leave','unavailable') then raise exception 'INVALID_INPUT' using detail = 'kind'; end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on then
    raise exception 'INVALID_INPUT' using detail = 'dates';
  end if;
  begin
    insert into public.schedule_exceptions (consultant_id, kind, starts_on, ends_on)
    values (p_consultant_id, p_kind::public.exception_kind, p_starts_on, p_ends_on)
    returning id into new_id;
  exception when foreign_key_violation then
    raise exception 'INVALID_INPUT' using detail = 'consultant has no schedule';
  end;
  insert into public.audit_log(actor_user, actor_kind, action, from_value, to_value)
  values (auth.uid(), 'admin', 'exception-added', p_consultant_id, format('%s %s..%s', p_kind, p_starts_on, p_ends_on));
  return new_id;
end $$;

create function public.remove_exception(p_id uuid)
returns boolean language plpgsql volatile security definer
set search_path = ''
as $$
declare e public.schedule_exceptions;
begin
  perform public.require_admin();
  delete from public.schedule_exceptions where id = p_id returning * into e;
  if not found then raise exception 'NOT_FOUND'; end if;
  insert into public.audit_log(actor_user, actor_kind, action, from_value, to_value)
  values (auth.uid(), 'admin', 'exception-removed', e.consultant_id, format('%s %s..%s', e.kind, e.starts_on, e.ends_on));
  return true;
end $$;

-- Creates or updates a staff profile for an existing auth user (accounts are created by invite, outside SQL).
create function public.set_staff_role(p_user_id uuid, p_display_name text, p_role text, p_consultant_id text, p_active boolean)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_display_name, ''));
  old_role public.staff_role;
  sp public.staff_profiles;
begin
  perform public.require_admin();
  if p_role is null or p_role not in ('admin','finance','reception','consultant') then
    raise exception 'INVALID_INPUT' using detail = 'role';
  end if;
  if v_name = '' or char_length(v_name) > 100 then raise exception 'INVALID_INPUT' using detail = 'display_name'; end if;
  if p_role = 'consultant' and not exists (select 1 from public.consultant_branches where consultant_id = p_consultant_id) then
    raise exception 'INVALID_INPUT' using detail = 'consultant_id';
  end if;
  if p_user_id = auth.uid() and (p_role <> 'admin' or not coalesce(p_active, true)) then
    raise exception 'INVALID_INPUT' using detail = 'cannot demote or deactivate yourself';
  end if;

  select role into old_role from public.staff_profiles where user_id = p_user_id;
  begin
    insert into public.staff_profiles as t (user_id, display_name, role, consultant_id, active)
    values (p_user_id, v_name, p_role::public.staff_role,
            case when p_role = 'consultant' then p_consultant_id end, coalesce(p_active, true))
    on conflict (user_id) do update set
      display_name = excluded.display_name, role = excluded.role,
      consultant_id = excluded.consultant_id, active = excluded.active
    returning * into sp;
  exception when foreign_key_violation then
    raise exception 'NOT_FOUND' using detail = 'no such user';
  end;
  insert into public.audit_log(actor_user, actor_kind, action, from_value, to_value)
  values (auth.uid(), 'admin', 'staff-role', old_role::text,
          format('%s %s%s', p_user_id, p_role, case when sp.active then '' else ' (inactive)' end));
  return to_jsonb(sp);
end $$;

-- ---------------------------------------------------------------- privileges
revoke execute on function public.require_admin(), public.valid_windows(jsonb) from public, anon, authenticated;
revoke execute on function
  public.current_staff_role(), public.current_consultant_id(),
  public.staff_transition(uuid, text, text), public.check_in(text), public.save_record(uuid, text, text),
  public.upsert_schedule(text, jsonb, jsonb, text[], int), public.add_exception(text, text, date, date),
  public.remove_exception(uuid), public.set_staff_role(uuid, text, text, text, boolean)
  from public, anon;
-- current_staff_role / current_consultant_id are evaluated inside the SELECT policies, so the caller needs EXECUTE.
grant execute on function
  public.current_staff_role(), public.current_consultant_id(),
  public.staff_transition(uuid, text, text), public.check_in(text), public.save_record(uuid, text, text),
  public.upsert_schedule(text, jsonb, jsonb, text[], int), public.add_exception(text, text, date, date),
  public.remove_exception(uuid), public.set_staff_role(uuid, text, text, text, boolean)
  to authenticated, service_role;
