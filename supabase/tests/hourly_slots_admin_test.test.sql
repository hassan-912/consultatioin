-- 0036: hourly 45-minute consultations for every consultant; the payment-test consultant is admin-only.
begin;
set local search_path = public, extensions;
select plan(13);

create function pg_temp.q(r text, uid uuid, sql text) returns text language plpgsql as $$
declare res text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', r)::text, true);
  perform set_config('role', r, true);
  begin execute sql into res; res := coalesce(nullif(res, ''), 'OK');
  exception when others then res := 'ERR:' || sqlstate || ':' || sqlerrm; end;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  return res;
end $$;
-- The next date (from 3 days ahead) the consultant works.
create function pg_temp.workday(c text) returns date language sql as $$
  select d::date from generate_series(current_date + 3, current_date + 10, interval '1 day') d
  where jsonb_array_length(coalesce((select weekly -> extract(dow from d)::int::text from public.schedules where consultant_id = c), '[]')) > 0
  order by d limit 1
$$;

insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'boss2@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000e2', 'desk@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into staff_profiles (user_id, display_name, role, consultant_id, active) values
  ('00000000-0000-0000-0000-0000000000e1', 'Boss Two', 'admin', null, true),
  ('00000000-0000-0000-0000-0000000000e2', 'Desk', 'reception', null, true);

-- Hourly, 45 minutes, for every consultant
select ok((select bool_and(extract(minute from st at time zone 'Africa/Cairo') = 0)
           from public.schedule_slots('mohamed-gamal', pg_temp.workday('mohamed-gamal'), 'online') st), 'slots start on the hour');
select ok((select bool_and(gap >= interval '60 minutes') from (
             select st - lag(st) over (order by st) as gap from public.schedule_slots('ahmed-salama', pg_temp.workday('ahmed-salama'), 'online') st) g
           where gap is not null), 'one slot per hour, never 30 minutes apart');
select ok((select count(*) > 0 from public.schedule_slots('mohamed-abdelaziz', pg_temp.workday('mohamed-abdelaziz'), 'online')), 'Dubai has hourly slots too');
select is(((public.reserve_slot('mohamed-gamal', 'online',
             (select min(st) from public.schedule_slots('mohamed-gamal', pg_temp.workday('mohamed-gamal'), 'online') st),
             '{"name":"Sara","phone":"+201001234590","channel":"whatsapp","lang":"en"}'::jsonb))->>'booking_id')::uuid is not null, true,
  'a booking can be made');
select is((select ends_at - starts_at from bookings where customer_phone = '+201001234590'), interval '45 minutes', 'and it lasts 45 minutes');
select ok(public.slot_clashes('mohamed-gamal',
            (select min(st) from public.schedule_slots('mohamed-gamal', pg_temp.workday('mohamed-gamal'), 'online') st)),
          'the booked hour is taken');
select ok(not public.slot_clashes('mohamed-gamal',
            (select min(st) + interval '1 hour' from public.schedule_slots('mohamed-gamal', pg_temp.workday('mohamed-gamal'), 'online') st)),
          'the next hour is still free');

-- Admin-only test consultant
select is(pg_temp.q('anon', null, 'select public.admin_test_key()') like 'ERR:42501:%', true, 'the public cannot read the admin test key');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000e2', 'select public.admin_test_key()'), 'ERR:P0001:FORBIDDEN', 'nor can non-admin staff');
select ok(char_length(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000e1', 'select public.admin_test_key()')) = 48, 'an admin can');
select throws_ok(format($q$select public.reserve_slot('test-ek-q7m4x9', 'online', %L, '{"name":"X","phone":"+201001234591","channel":"whatsapp","lang":"en"}'::jsonb)$q$,
                 (select min(st) from public.schedule_slots('test-ek-q7m4x9', pg_temp.workday('test-ek-q7m4x9'), 'online') st)),
  'P0001', 'FORBIDDEN', 'without the admin key the test consultant cannot be booked');
select throws_ok(format($q$select public.reserve_slot('test-ek-q7m4x9', 'online', %L, '{"name":"X","phone":"+201001234592","channel":"whatsapp","lang":"en","testKey":"guess"}'::jsonb)$q$,
                 (select min(st) from public.schedule_slots('test-ek-q7m4x9', pg_temp.workday('test-ek-q7m4x9'), 'online') st)),
  'P0001', 'FORBIDDEN', 'nor with a guessed key');
select is((public.reserve_slot('test-ek-q7m4x9', 'online',
             (select min(st) from public.schedule_slots('test-ek-q7m4x9', pg_temp.workday('test-ek-q7m4x9'), 'online') st),
             jsonb_build_object('name', 'Admin test', 'phone', '+201001234593', 'channel', 'whatsapp', 'lang', 'en',
                                'testKey', (select decrypted_secret from vault.decrypted_secrets where name = 'admin_test_key'))) ? 'booking_id'), true,
  'with the admin key it books, at 5 EGP');

select * from finish();
rollback;
