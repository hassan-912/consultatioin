-- 0053_payment_test_every_5_min: the 5 EGP payment-test consultant only. It offers a start time every 5 minutes
-- (everyone else stays hourly), and its bookings may overlap, so several payment tests can run at once.
-- Remove with the test consultant when testing is done.

-- Start-time spacing per consultant (minutes). Everyone keeps the hourly default.
alter table public.schedules add column if not exists slot_step_min int not null default 60
  check (slot_step_min between 5 and 60);
update public.schedules set slot_step_min = 5 where consultant_id = 'test-ek-q7m4x9';

-- Consultants whose bookings may overlap: only the payment test. Immutable so the exclusion rule can use it.
create or replace function public.overlap_allowed(p_consultant_id text) returns boolean
  language sql immutable set search_path to '' as $$ select p_consultant_id = 'test-ek-q7m4x9' $$;

create or replace function public.schedule_slots(p_consultant_id text, p_date date, p_format text)
 returns setof timestamp with time zone
 language sql stable set search_path to ''
as $function$
  select st
  from public.schedules s
  join public.consultant_branches cb on cb.consultant_id = s.consultant_id
  cross join lateral jsonb_array_elements(coalesce(s.weekly -> extract(dow from p_date)::int::text, '[]'::jsonb)) w
  cross join lateral generate_series((w->>'start')::int, (w->>'end')::int - 45, s.slot_step_min) m
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

create or replace function public.slot_clashes(p_consultant_id text, p_starts_at timestamp with time zone, p_exclude uuid default null::uuid)
 returns boolean
 language sql stable set search_path to ''
as $function$
  select not public.overlap_allowed(p_consultant_id) and exists (select 1 from public.bookings b
    where b.consultant_id = p_consultant_id and b.id is distinct from p_exclude
      and public.is_blocking(b.status, b.hold_expires_at)
      and b.blocks_range && public.booking_blocks_range(p_starts_at, p_starts_at + interval '45 minutes'))
$function$;

-- The table-level double-booking rule skips the payment test too (it is unchanged for everyone else).
alter table public.bookings drop constraint bookings_no_double_booking;
alter table public.bookings add constraint bookings_no_double_booking
  exclude using gist (consultant_id with =, blocks_range with &&)
  where (status = any (array['reserved','on-hold','confirmed','checked-in','completed','wrong-amount','duplicate']::public.booking_status[])
         and not public.overlap_allowed(consultant_id));
