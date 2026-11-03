-- 0026: a request needs a username; usernames are unique, ignoring case.
begin;
set local search_path = public, extensions;
select plan(8);

create function pg_temp.q(uid uuid, sql text) returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin execute sql into r; r := coalesce(nullif(r, ''), 'OK');
  exception when others then r := 'ERR:' || sqlstate || ':' || sqlerrm; end;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  return r;
end $$;

alter table auth.users add column if not exists raw_app_meta_data jsonb;
insert into auth.users (id, email, aud, role, instance_id, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'boss@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"provider":"email"}'),
  ('00000000-0000-0000-0000-0000000000f2', 'g1@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"provider":"google"}'),
  ('00000000-0000-0000-0000-0000000000f3', 'g2@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"provider":"google"}');
insert into staff_profiles (user_id, display_name, role, consultant_id, active) values
  ('00000000-0000-0000-0000-0000000000f1', 'Boss', 'admin', null, true);

select is(pg_temp.q('00000000-0000-0000-0000-0000000000f2', $q$select public.request_staff_access('')$q$), 'needs-name', 'no name and no request: asks for a username');
select is((select count(*)::text from staff_access_requests), '0', 'asking files nothing');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000f2', $q$select public.request_staff_access(' bOSS ')$q$), 'taken', 'a staff member''s name is taken, ignoring case');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000f2', $q$select public.request_staff_access('A')$q$) like 'ERR:P0001:INVALID_INPUT%', true, 'too short');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000f2', $q$select public.request_staff_access('Aya')$q$), 'pending', 'free name files the request');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000f2', $q$select public.request_staff_access('')$q$), 'pending', 'later checks report pending');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000f3', $q$select public.request_staff_access('aya')$q$), 'taken', 'another request''s name is taken');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000f2', $q$select public.request_staff_access('AYA')$q$), 'pending', 'renaming yourself to your own name is fine');

select * from finish();
rollback;
