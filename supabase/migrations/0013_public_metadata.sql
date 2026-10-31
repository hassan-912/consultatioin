-- Only safe aggregates and offered formats are public. No customer rows or outcome notes.
create function public.public_consultant_metadata()
returns table (consultant_id text, formats text[], total bigint, this_month bigint)
language sql stable security definer set search_path = ''
as $$
  select s.consultant_id, s.formats,
    count(b.id) filter (where b.status = 'completed'),
    count(b.id) filter (where b.status = 'completed'
      and date_trunc('month', b.starts_at at time zone cb.tz) = date_trunc('month', now() at time zone cb.tz))
  from public.schedules s
  join public.consultant_branches cb on cb.consultant_id = s.consultant_id
  left join public.bookings b on b.consultant_id = s.consultant_id
  group by s.consultant_id, s.formats, cb.tz
$$;
revoke execute on function public.public_consultant_metadata() from public, anon, authenticated, service_role;
grant execute on function public.public_consultant_metadata() to anon, authenticated;

-- The prototype status machine created a local waiting-room URL. Live confirmations
-- must wait for an actual meeting provider. Preserve historical records unchanged.
create function public.suppress_prototype_meeting_url()
returns trigger language plpgsql set search_path = ''
as $$ begin
  if new.meeting_url like '#/meet/%' then
    new.meeting_url := case when tg_op = 'UPDATE' then old.meeting_url else null end;
  end if;
  return new;
end $$;
revoke execute on function public.suppress_prototype_meeting_url() from public, anon, authenticated, service_role;
create trigger bookings_real_meeting_url before insert or update of meeting_url on public.bookings
for each row execute function public.suppress_prototype_meeting_url();

-- Only possession of the booking's manage capability may exclude that booking.
create function public.reschedule_slots(p_manage_token text, p_date date)
returns timestamptz[] language plpgsql stable security definer set search_path = ''
as $$
declare b public.bookings; cap integer;
begin
  perform public.assert_customer_access();
  b := public.booking_by_token(p_manage_token);
  if b.id is null then raise exception 'NOT_FOUND'; end if;
  if p_date is null then raise exception 'INVALID_INPUT'; end if;
  if b.status = 'expired' or (b.status = 'reserved' and b.hold_expires_at <= now()) then raise exception 'HOLD_EXPIRED'; end if;
  if b.status not in ('reserved','on-hold','confirmed','rejected','wrong-amount','duplicate','late-transfer') then raise exception 'INVALID_TRANSITION'; end if;
  select max_per_day into cap from public.schedules where consultant_id = b.consultant_id;
  if cap is not null and public.busy_count(b.consultant_id, p_date, b.id) >= cap then return '{}'; end if;
  return coalesce((select array_agg(st order by st) from public.schedule_slots(b.consultant_id, p_date, b.format::text) st
    where not public.slot_clashes(b.consultant_id, st, b.id)), '{}');
end $$;
revoke execute on function public.reschedule_slots(text,date) from public, anon, authenticated, service_role;
grant execute on function public.reschedule_slots(text,date) to anon, authenticated;

-- Realtime remains subject to staff RLS and column privileges. Never grant anon SELECT.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bookings') then
    alter publication supabase_realtime add table public.bookings;
  end if;
end $$;
