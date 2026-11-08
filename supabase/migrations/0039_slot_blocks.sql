-- 0039_slot_blocks: the admin can block a specific hour on a specific date for a consultant (no one can book it),
-- alongside days off (schedule_exceptions) and weekly hours. Blocked hours disappear from the booking calendar,
-- the reservation check and the admin's free-time list, because they all go through schedule_slots.
create table public.slot_blocks (
  id uuid primary key default gen_random_uuid(),
  consultant_id text not null references public.consultant_branches(consultant_id) on delete cascade,
  starts_at timestamptz not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (consultant_id, starts_at)
);
alter table public.slot_blocks enable row level security;
create policy slot_blocks_staff_read on public.slot_blocks for select to authenticated
using ((select public.current_staff_role()) is not null);
revoke all on public.slot_blocks from public, anon, authenticated;
grant select on public.slot_blocks to authenticated;

-- Admin: block or unblock one start time. Blocking doesn't touch a booking already at that time.
create function public.set_slot_blocked(p_consultant_id text, p_starts_at timestamptz, p_blocked boolean)
returns void language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  if p_starts_at is null or p_blocked is null then raise exception 'INVALID_INPUT'; end if;
  if not exists (select 1 from public.consultant_branches where consultant_id = p_consultant_id) then
    raise exception 'INVALID_INPUT' using detail = 'consultant';
  end if;
  if p_blocked then
    insert into public.slot_blocks (consultant_id, starts_at, created_by) values (p_consultant_id, p_starts_at, auth.uid())
    on conflict (consultant_id, starts_at) do nothing;
  else
    delete from public.slot_blocks where consultant_id = p_consultant_id and starts_at = p_starts_at;
  end if;
  insert into public.audit_log(actor_user, actor_kind, action, from_value, to_value)
  values (auth.uid(), 'admin', case when p_blocked then 'time-blocked' else 'time-unblocked' end, p_consultant_id, p_starts_at::text);
end $$;
revoke execute on function public.set_slot_blocked(text, timestamptz, boolean) from public, anon;
grant execute on function public.set_slot_blocked(text, timestamptz, boolean) to authenticated;

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
    -- A time the admin blocked for this consultant (0039).
    and not exists (select 1 from public.slot_blocks x where x.consultant_id = s.consultant_id and x.starts_at = st)
    and not exists (select 1 from jsonb_array_elements(coalesce(s.breaks, '[]'::jsonb)) br
                    where st < (p_date + make_interval(mins => (br->>'end')::int)) at time zone cb.tz
                      and st + interval '45 minutes' > (p_date + make_interval(mins => (br->>'start')::int)) at time zone cb.tz)
  order by st
$function$;
