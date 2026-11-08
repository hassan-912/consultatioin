-- 0041: only the admin shows or hides a consultant on the home page; the public metadata says who is listed.
begin;
set local search_path = public, extensions;
select plan(7);

create function pg_temp.q(r text, uid uuid, sql text) returns text language plpgsql as $f$
declare res text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', r)::text, true);
  perform set_config('role', r, true);
  begin execute sql into res; res := coalesce(nullif(res, ''), 'OK');
  exception when others then res := 'ERR:' || sqlstate || ':' || sqlerrm; end;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  return res;
end $f$;

insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-0000-0000-0000000000d1', 'boss6@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000d2', 'gamal6@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into staff_profiles (user_id, display_name, role, consultant_id, active) values
  ('00000000-0000-0000-0000-0000000000d1', 'Boss Six', 'admin', null, true),
  ('00000000-0000-0000-0000-0000000000d2', 'Gamal Six', 'consultant', 'mohamed-gamal', true);

select is(pg_temp.q('anon', null, $q$select count(*)::text from public.public_consultant_metadata() where listed$q$),
  (select count(*)::text from consultant_branches where listed), 'the public sees who is listed');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000d1',
  $q$select public.admin_set_consultant_listed('ahmed-salama', false)::text$q$), 'OK', 'the admin hides a consultant');
select is(pg_temp.q('anon', null, $q$select listed::text from public.public_consultant_metadata() where consultant_id = 'ahmed-salama'$q$),
  'false', 'the public sees they are hidden');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000d2',
  $q$select public.admin_set_consultant_listed('ahmed-salama', true)::text$q$), 'ERR:P0001:FORBIDDEN', 'a consultant cannot change it');
select is(pg_temp.q('anon', null,
  $q$select public.admin_set_consultant_listed('ahmed-salama', true)::text$q$) like 'ERR:42501:%', true, 'the public cannot change it');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000d1',
  $q$select public.admin_set_consultant_listed('nobody', true)::text$q$), 'ERR:P0001:INVALID_INPUT', 'unknown consultant');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000d1',
  $q$select public.admin_set_consultant_listed('ahmed-salama', true)::text$q$), 'OK', 'and shows them again');

select * from finish();
rollback;
