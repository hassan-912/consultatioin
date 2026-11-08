-- 0043: clients who aren't ready file a request instead of paying; only the sales manager and the admin see them.
begin;
set local search_path = public, extensions;
select plan(14);

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
  ('00000000-0000-0000-0000-0000000000c7', 'boss8@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000c8', 'mgr8@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000c9', 'sales8@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into staff_profiles (user_id, display_name, role, consultant_id, active) values
  ('00000000-0000-0000-0000-0000000000c7', 'Boss Eight', 'admin', null, true),
  ('00000000-0000-0000-0000-0000000000c8', 'Manager Eight', 'sales', null, true),
  ('00000000-0000-0000-0000-0000000000c9', 'Sales Eight', 'sales', null, true);

create temp table req as select $j${"name":"Karim","phone":"+201005550199","email":"","lang":"ar","program":"tourism","consultantId":"mohamed-gamal",
  "format":"online","wantedAt":"2030-01-05T10:00:00Z","score":42,"scoreMax":100,
  "reasons":[{"en":"File strength 42/100, below 60","ar":"قوة الملف 42/100"}],"answers":{"bank":"bank_opt_5"}}$j$::jsonb as p;
grant select on req to anon;

select is(pg_temp.q('anon', null, 'select public.public_readiness_rules()::text'), '{}', 'everyone reads the rules (none saved yet)');
select is(pg_temp.q('anon', null, 'select public.submit_readiness_request((select p from req))::text'), 'OK', 'a client who is not ready files a request');
select is(pg_temp.q('anon', null, $q$select public.submit_readiness_request((select p - 'reasons' from req))::text$q$), 'ERR:P0001:INVALID_INPUT', 'a request needs the reasons');
select is(pg_temp.q('anon', null, 'select count(*)::text from readiness_requests') like 'ERR:42501:%', true, 'the public cannot read the requests');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000c9', 'select count(*)::text from public.readiness_request_list()'), 'ERR:P0001:FORBIDDEN', 'an ordinary sales account cannot see them');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000c9',
  $q$select public.admin_set_sales_manager('00000000-0000-0000-0000-0000000000c9', true)::text$q$), 'ERR:P0001:FORBIDDEN', 'nor make itself a sales manager');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000c7',
  $q$select public.admin_set_sales_manager('00000000-0000-0000-0000-0000000000c8', true)::text$q$), 'OK', 'the admin makes an account sales manager');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000c8', 'select public.is_sales_manager()::text'), 'true', 'which then knows it');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000c8',
  $q$select customer_name || ' ' || customer_phone || ' ' || program || ' ' || score::int || '/' || score_max::int || ' ' || status from public.readiness_request_list() where customer_phone = '+201005550199'$q$),
  'Karim +201005550199 tourism 42/100 open', 'the sales manager sees the request with the score');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000c8',
  $q$select public.set_readiness_status((select id from public.readiness_request_list() where customer_phone = '+201005550199'), 'contacted')::text$q$), 'OK', 'and marks it contacted');
select is((select status from readiness_requests where customer_phone = '+201005550199'), 'contacted', 'stored');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000c7',
  $q$select public.admin_save_readiness_rules('{"tourismMinScore":55,"tourismLowBank":false}')::text$q$), 'OK', 'the admin saves the rules');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000c7',
  $q$select public.admin_save_readiness_rules('{"tourismMinScore":"high"}')::text$q$), 'ERR:P0001:INVALID_INPUT', 'only known rules with the right type');
select is(pg_temp.q('anon', null, $q$select (public.public_readiness_rules()->>'tourismMinScore')$q$), '55', 'the booking form gets the new rules');

select * from finish();
rollback;
