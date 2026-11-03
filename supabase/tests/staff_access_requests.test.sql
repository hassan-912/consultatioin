-- 0025: self sign-up only creates a request; access needs an admin's approval.
begin;
set local search_path = public, extensions;
select plan(13);

create function pg_temp.q(uid uuid, sql text) returns text language plpgsql as $$
declare r text;
begin
  if uid is null then
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    perform set_config('role', 'anon', true);
  else
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
  end if;
  begin execute sql into r; r := coalesce(nullif(r, ''), 'OK');
  exception when others then r := 'ERR:' || sqlstate || ':' || sqlerrm; end;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  return r;
end $$;

-- The local harness's auth.users is a minimal shim; Supabase's has this column.
alter table auth.users add column if not exists raw_app_meta_data jsonb;
insert into auth.users (id, email, aud, role, instance_id, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'boss@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"provider":"email"}'),
  ('00000000-0000-0000-0000-0000000000e2', 'New.Person@Test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"provider":"google"}'),
  ('00000000-0000-0000-0000-0000000000e3', 'other@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"provider":"email"}');
insert into staff_profiles (user_id, display_name, role, consultant_id, active) values
  ('00000000-0000-0000-0000-0000000000e1', 'Boss', 'admin', null, true);

select is(pg_temp.q(null, $q$select public.request_staff_access('X')$q$) like 'ERR:42501:%', true, 'anon cannot request');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000e1', $q$select public.request_staff_access('Boss')$q$), 'member', 'existing staff are told they are members');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000e2', $q$select public.request_staff_access('  Aya Ashraf ')$q$), 'pending', 'new person requests access');
select is((select email || '|' || display_name || '|' || provider from staff_access_requests where user_id = '00000000-0000-0000-0000-0000000000e2'),
  'new.person@test.local|Aya Ashraf|google', 'request stores email, name and provider');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000e2', 'select public.current_staff_role()::text'), 'OK', 'a request grants no staff role');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000e2', 'select count(*)::text from staff_access_requests'), '0', 'requesters cannot list requests');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000e1', 'select count(*)::text from staff_access_requests'), '1', 'admin sees the request');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000e3', $q$select public.approve_staff_request('00000000-0000-0000-0000-0000000000e2', 'admin', null)$q$) like 'ERR:P0001:FORBIDDEN%', true, 'a non-admin cannot approve (even themselves)');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000e1', $q$select public.approve_staff_request('00000000-0000-0000-0000-0000000000e2', 'consultant', 'nobody')$q$) like 'ERR:P0001:INVALID_INPUT%', true, 'consultant needs a real consultant');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000e1', $q$select public.approve_staff_request('00000000-0000-0000-0000-0000000000e2', 'sales', null)$q$), 'OK', 'admin approves as sales');
select is((select role::text || '|' || display_name || '|' || (select count(*) from staff_access_requests)::text from staff_profiles where user_id = '00000000-0000-0000-0000-0000000000e2'),
  'sales|Aya Ashraf|0', 'approved: profile created, request removed');

select pg_temp.q('00000000-0000-0000-0000-0000000000e3', $q$select public.request_staff_access('')$q$);
select is(pg_temp.q('00000000-0000-0000-0000-0000000000e1', $q$select public.decline_staff_request('00000000-0000-0000-0000-0000000000e3')$q$), 'OK', 'admin declines');
select is((select count(*) from staff_access_requests)::text || '|' || (select count(*) from staff_profiles where user_id = '00000000-0000-0000-0000-0000000000e3')::text,
  '0|0', 'declined: request removed, no access');

select * from finish();
rollback;
