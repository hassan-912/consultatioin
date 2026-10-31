begin;
set local search_path = public, extensions;
select plan(12);

create function pg_temp.u(n int) returns uuid language sql as $$ select ('00000000-0000-0000-0000-0000000000c' || n)::uuid $$;
insert into auth.users (id, email, aud, role, instance_id)
select pg_temp.u(n), 'invite-c' || n || '@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
from generate_series(1,5) n;
insert into staff_profiles (user_id, display_name, role, consultant_id, active) values
  (pg_temp.u(1), 'Admin', 'admin', null, true),
  (pg_temp.u(2), 'Finance', 'finance', null, true),
  (pg_temp.u(4), 'Existing', 'reception', null, false);
insert into consultant_branches (consultant_id, branch_id, tz) values ('invite-test-consultant','nasr-city','Africa/Cairo');

create function pg_temp.call(role_name text, sql text) returns text language plpgsql as $$
declare r text;
begin
  perform set_config('role', role_name, true);
  begin execute sql into r; r := coalesce(nullif(r, ''), 'OK');
  exception when others then r := 'ERR:' || sqlstate || ':' || sqlerrm; end;
  perform set_config('role', 'none', true);
  return r;
end $$;

select alike(pg_temp.call('anon', format($$select public.invite_staff_profile(%L,%L,'N','finance',null)$$, pg_temp.u(1), pg_temp.u(3))), 'ERR:42501:%', 'anon cannot execute');
select alike(pg_temp.call('authenticated', format($$select public.invite_staff_profile(%L,%L,'N','finance',null)$$, pg_temp.u(1), pg_temp.u(3))), 'ERR:42501:%', 'authenticated cannot execute');
select is(pg_temp.call('service_role', format($$select public.invite_staff_profile(%L,%L,'Nora','finance',null)$$, pg_temp.u(1), pg_temp.u(3))), 'OK', 'service role inserts a profile');
select is((select active from staff_profiles where user_id = pg_temp.u(3)), true, 'new profile is active');
select is((select actor_kind || '|' || action || '|' || to_value || '|' || actor_user::text || '|' || from_value from audit_log where action = 'staff-invited'),
  'admin|staff-invited|finance|' || pg_temp.u(1)::text || '|' || pg_temp.u(3)::text, 'audit row records actor, action, role');
select is(pg_temp.call('service_role', format($$select public.invite_staff_profile(%L,%L,'X','admin',null)$$, pg_temp.u(1), pg_temp.u(3))), 'ERR:P0001:ALREADY_EXISTS', 'refuses an existing active profile');
select is(pg_temp.call('service_role', format($$select public.invite_staff_profile(%L,%L,'X','admin',null)$$, pg_temp.u(1), pg_temp.u(4))), 'ERR:P0001:ALREADY_EXISTS', 'refuses an existing inactive profile');
select is((select role::text || (active)::text from staff_profiles where user_id = pg_temp.u(4)), 'receptionfalse', 'existing profile is neither overwritten nor reactivated');
select is(pg_temp.call('service_role', format($$select public.invite_staff_profile(%L,%L,'X','finance',null)$$, pg_temp.u(2), gen_random_uuid())), 'ERR:P0001:FORBIDDEN', 'non-admin actor refused');
select is(pg_temp.call('service_role', format($$select public.invite_staff_profile(%L,%L,'C','consultant','invite-test-consultant')$$, pg_temp.u(1), pg_temp.u(5))), 'OK', 'consultant grant with a valid consultant');
select is((select to_value from audit_log where action = 'staff-invited' and from_value = pg_temp.u(5)::text), 'consultant:invite-test-consultant', 'audit to_value is role:consultant');
select is((select count(*)::int from audit_log where action = 'staff-invited'), 2, 'refusals write no audit rows');

select * from finish();
rollback;
