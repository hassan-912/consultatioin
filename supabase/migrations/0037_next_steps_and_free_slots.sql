-- 0037_next_steps_and_free_slots:
--  1. After a consultation the consultant records the next step: the client will sign a contract, wants a refund,
--     or will think about it; plus the program the consultant recommends (may differ from what the client picked).
--     Contract and refund cases are shown to finance (no consultation notes). "Thinking" stays with the
--     consultant (and admin) as a follow-up reminder.
--  2. Admins can list every consultant's free times for the coming days.

alter table public.consultation_records
  add column next_step text check (next_step in ('contract','refund','thinking')),
  add column recommended_program text check (char_length(recommended_program) <= 50),
  add column next_step_at timestamptz,
  add column followed_up_at timestamptz,
  add column finance_handled_at timestamptz,
  add column finance_handled_by uuid references auth.users(id);
create index consultation_records_next_step_idx on public.consultation_records (next_step) where next_step is not null;

-- Consultant (own clients) or admin: set the next step and recommended program. A completed or checked-in booking only.
create function public.save_next_step(p_booking_id uuid, p_next_step text, p_program text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  r public.staff_role := public.current_staff_role();
  b public.bookings;
  rec public.consultation_records;
  v_program text := nullif(btrim(coalesce(p_program, '')), '');
begin
  if r is null or r not in ('admin','consultant') then raise exception 'FORBIDDEN'; end if;
  select * into b from public.bookings where id = p_booking_id;
  if not found or (r = 'consultant' and b.consultant_id is distinct from public.current_consultant_id()) then raise exception 'FORBIDDEN'; end if;
  if b.status not in ('checked-in','completed') then raise exception 'INVALID_TRANSITION'; end if;
  if p_next_step is null or p_next_step not in ('contract','refund','thinking') then raise exception 'INVALID_INPUT' using detail = 'next_step'; end if;
  if v_program is not null and v_program not in ('immigration','job-seeking','education','investment','tourism') then
    raise exception 'INVALID_INPUT' using detail = 'program';
  end if;
  insert into public.consultation_records as c (booking_id, notes, outcome, updated_by, next_step, recommended_program, next_step_at)
  values (b.id, '', 'none', auth.uid(), p_next_step, coalesce(v_program, b.program), now())
  on conflict (booking_id) do update set
    next_step = excluded.next_step, recommended_program = excluded.recommended_program, updated_by = excluded.updated_by,
    -- A changed decision is new news for finance and restarts the follow-up.
    next_step_at = case when c.next_step is distinct from excluded.next_step then now() else c.next_step_at end,
    finance_handled_at = case when c.next_step is distinct from excluded.next_step then null else c.finance_handled_at end,
    finance_handled_by = case when c.next_step is distinct from excluded.next_step then null else c.finance_handled_by end,
    followed_up_at = case when c.next_step is distinct from excluded.next_step then null else c.followed_up_at end
  returning * into rec;
  insert into public.audit_log(actor_user, actor_kind, booking_id, action, from_value, to_value)
  values (auth.uid(), r::text, b.id, 'next-step', null, p_next_step || coalesce(':' || rec.recommended_program, ''));
  return to_jsonb(rec) - 'notes';
end $$;
revoke execute on function public.save_next_step(uuid, text, text) from public, anon;
grant execute on function public.save_next_step(uuid, text, text) to authenticated;

-- Consultant (own) or admin: the "thinking" client has been followed up.
create function public.mark_followed_up(p_booking_id uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
declare r public.staff_role := public.current_staff_role(); cid text;
begin
  if r is null or r not in ('admin','consultant') then raise exception 'FORBIDDEN'; end if;
  select consultant_id into cid from public.bookings where id = p_booking_id;
  if cid is null or (r = 'consultant' and cid is distinct from public.current_consultant_id()) then raise exception 'FORBIDDEN'; end if;
  update public.consultation_records set followed_up_at = now() where booking_id = p_booking_id and next_step = 'thinking';
  if not found then raise exception 'INVALID_TRANSITION'; end if;
  insert into public.audit_log(actor_user, actor_kind, booking_id, action) values (auth.uid(), r::text, p_booking_id, 'followed-up');
end $$;
revoke execute on function public.mark_followed_up(uuid) from public, anon;
grant execute on function public.mark_followed_up(uuid) to authenticated;

-- Finance or admin: contract and refund cases only, without the consultation notes.
create function public.finance_next_steps()
returns table (booking_id uuid, reference text, customer_name text, customer_phone text, consultant_id text,
               next_step text, recommended_program text, next_step_at timestamptz, handled_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if public.current_staff_role() is null or public.current_staff_role() not in ('finance','admin') then raise exception 'FORBIDDEN'; end if;
  return query
    select b.id, b.reference, b.customer_name, b.customer_phone, b.consultant_id, c.next_step, c.recommended_program,
           c.next_step_at, c.finance_handled_at
    from public.consultation_records c join public.bookings b on b.id = c.booking_id
    where c.next_step in ('contract','refund')
    order by c.finance_handled_at is not null, c.next_step_at desc;
end $$;
revoke execute on function public.finance_next_steps() from public, anon;
grant execute on function public.finance_next_steps() to authenticated;

-- Finance or admin: a contract/refund case has been dealt with.
create function public.finance_mark_handled(p_booking_id uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
declare r public.staff_role := public.current_staff_role();
begin
  if r is null or r not in ('finance','admin') then raise exception 'FORBIDDEN'; end if;
  update public.consultation_records set finance_handled_at = now(), finance_handled_by = auth.uid()
  where booking_id = p_booking_id and next_step in ('contract','refund') and finance_handled_at is null;
  if not found then raise exception 'INVALID_TRANSITION'; end if;
  insert into public.audit_log(actor_user, actor_kind, booking_id, action) values (auth.uid(), r::text, p_booking_id, 'finance-handled');
end $$;
revoke execute on function public.finance_mark_handled(uuid) from public, anon;
grant execute on function public.finance_mark_handled(uuid) to authenticated;

-- Admin: every consultant's free times for the next p_days days (both formats), in one call.
create function public.staff_free_slots(p_from date, p_days int default 14)
returns table (consultant_id text, format text, starts_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  if p_from is null or p_days is null or p_days not between 1 and 31 then raise exception 'INVALID_INPUT'; end if;
  return query
    select s.consultant_id, f.format, st
    from public.schedules s
    cross join lateral unnest(s.formats) f(format)
    cross join lateral generate_series(p_from, p_from + (p_days - 1), interval '1 day') d
    cross join lateral public.schedule_slots(s.consultant_id, d::date, f.format) st
    where not public.slot_clashes(s.consultant_id, st)
      and (s.max_per_day is null or public.busy_count(s.consultant_id, d::date) < s.max_per_day)
    order by s.consultant_id, st, f.format;
end $$;
revoke execute on function public.staff_free_slots(date, int) from public, anon;
grant execute on function public.staff_free_slots(date, int) to authenticated;
