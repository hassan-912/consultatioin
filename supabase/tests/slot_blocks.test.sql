-- 0039: the admin blocks one hour for a consultant; nobody can book it; unblocking opens it again.
begin;
set local search_path = public, extensions;
select plan(11);

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

insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'boss5@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000c2', 'gamal5@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into staff_profiles (user_id, display_name, role, consultant_id, active) values
  ('00000000-0000-0000-0000-0000000000c1', 'Boss Five', 'admin', null, true),
  ('00000000-0000-0000-0000-0000000000c2', 'Gamal Five', 'consultant', 'mohamed-gamal', true);

-- The first online hour Mohamed Gamal has in the next two weeks.
create temp table t as
  select (current_date + g) as day, st from generate_series(1, 14) g
  cross join lateral public.schedule_slots('mohamed-gamal', current_date + g, 'online') st
  order by st limit 1;

select is((select count(*)::int from t), 1, 'there is an open hour to block');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000c1',
  format($q$select public.set_slot_blocked('mohamed-gamal', %L, true)::text$q$, (select st from t))), 'OK', 'the admin blocks it');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000c1',
  format($q$select public.set_slot_blocked('mohamed-gamal', %L, true)::text$q$, (select st from t))), 'OK', 'blocking twice is fine');
select is((select count(*)::int from slot_blocks where consultant_id = 'mohamed-gamal' and starts_at = (select st from t)), 1, 'stored once');
select is((select count(*)::int from public.schedule_slots('mohamed-gamal', (select day from t), 'online') s where s = (select st from t)), 0,
  'the blocked hour is no longer bookable');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000c2',
  format($q$select public.set_slot_blocked('mohamed-gamal', %L, false)::text$q$, (select st from t))), 'ERR:P0001:FORBIDDEN', 'a consultant cannot unblock it');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000c2',
  $q$select count(*)::text from slot_blocks where consultant_id = 'mohamed-gamal'$q$) <> '0', true, 'staff can see blocked hours');
select is(pg_temp.q('anon', null, $q$select count(*)::text from slot_blocks$q$) like 'ERR:42501:%', true, 'the public cannot read them');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000c1',
  $q$select public.set_slot_blocked('nobody', now() + interval '1 day', true)::text$q$), 'ERR:P0001:INVALID_INPUT', 'unknown consultant');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000c1',
  format($q$select public.set_slot_blocked('mohamed-gamal', %L, false)::text$q$, (select st from t))), 'OK', 'the admin unblocks it');
select is((select count(*)::int from public.schedule_slots('mohamed-gamal', (select day from t), 'online') s where s = (select st from t)), 1,
  'so it is bookable again');

select * from finish();
rollback;
