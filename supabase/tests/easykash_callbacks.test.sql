-- 0028: only the Edge Function (service role) records EasyKash callbacks; only admins read them.
begin;
set local search_path = public, extensions;
select plan(6);

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
  ('00000000-0000-0000-0000-0000000000d1', 'boss@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000d2', 'fin@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into staff_profiles (user_id, display_name, role, consultant_id, active) values
  ('00000000-0000-0000-0000-0000000000d1', 'Boss', 'admin', null, true),
  ('00000000-0000-0000-0000-0000000000d2', 'Fin', 'finance', null, true);

select is(pg_temp.q('anon', null, $q$select public.record_easykash_callback('{"easykashRef":"1"}')::text$q$) like 'ERR:42501:%', true, 'anon cannot record');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000d1', $q$select public.record_easykash_callback('{"easykashRef":"1"}')::text$q$) like 'ERR:42501:%', true, 'even an admin cannot record');
select is(pg_temp.q('service_role', null, $q$select public.record_easykash_callback('{"easykashRef":"2911105009","customerReference":"MG-AB12","Amount":"1000.00","status":"PAID"}')::text$q$), 'true', 'service role records');
select is(pg_temp.q('service_role', null, $q$select public.record_easykash_callback('{"easykashRef":"2911105009","status":"PAID"}')::text$q$), 'false', 'a repeat is kept once');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000d2', 'select count(*)::text from easykash_callbacks'), '0', 'finance cannot read');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000d1', $q$select customer_reference || '|' || amount from easykash_callbacks$q$), 'MG-AB12|1000.00', 'admin reads it');

select * from finish();
rollback;
