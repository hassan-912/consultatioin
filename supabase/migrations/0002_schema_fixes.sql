-- 0002_schema_fixes
-- 1. Buffer: pad only each row's END by 10 min, so two bookings conflict iff the gap between them is < 10 min
--    (matches src/domain/availability.ts).
alter table public.bookings drop constraint bookings_no_double_booking;
alter table public.bookings drop column blocks_range;
create or replace function public.booking_blocks_range(s timestamptz, e timestamptz)
returns tstzrange language sql immutable parallel safe
set search_path = ''
as $$ select tstzrange(s, greatest(e, s) + interval '10 minutes', '[)') $$;
alter table public.bookings
  add column blocks_range tstzrange generated always as (public.booking_blocks_range(starts_at, ends_at)) stored;
alter table public.bookings add constraint bookings_no_double_booking exclude using gist (
  consultant_id with =, blocks_range with &&
) where (status in ('reserved','on-hold','confirmed','checked-in','completed','wrong-amount','duplicate'));

-- 2. Nothing created in public later is exposed to anon by default; RPCs get explicit grants in later tasks.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
