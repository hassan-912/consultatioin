-- 0020: customers write their assessment answers but never read them; admins and the booking's consultant read.
begin;
set local search_path = public, extensions;
select plan(15);

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

insert into auth.users (id, email, aud, role, instance_id)
select ('00000000-0000-0000-0000-0000000000e' || n)::uuid, 'ba-e' || n || '@test.local', 'authenticated', 'authenticated',
       '00000000-0000-0000-0000-000000000000'
from generate_series(1, 4) n;
insert into staff_profiles (user_id, display_name, role, consultant_id, active) values
  ('00000000-0000-0000-0000-0000000000e1', 'Admin', 'admin', null, true),
  ('00000000-0000-0000-0000-0000000000e2', 'Gamal', 'consultant', 'mohamed-gamal', true),
  ('00000000-0000-0000-0000-0000000000e3', 'Salah', 'consultant', 'mohamed-salah', true),
  ('00000000-0000-0000-0000-0000000000e4', 'Finance', 'finance', null, true);

insert into public.bookings(reference,qr_token,manage_token,consultant_id,branch_id,format,starts_at,ends_at,tz,price_amount,
  customer_name,customer_phone,channel,lang,status,hold_expires_at)
values
  ('BA-1','qba1',lpad('1', 32, 'f'),'mohamed-gamal','nasr-city','in-person',now() + interval '300 days',now() + interval '300 days 30 minutes','Africa/Cairo',1000,'Sara','+201001234567','whatsapp','en','reserved',now() + interval '1 hour'),
  ('BA-2','qba2',lpad('2', 32, 'f'),'mohamed-gamal','nasr-city','in-person',now() + interval '301 days',now() + interval '301 days 30 minutes','Africa/Cairo',1000,'Omar','+201001234568','whatsapp','en','confirmed',now() + interval '1 hour');

select ok(has_function_privilege('anon', 'public.save_assessment(text,text,jsonb)', 'execute'), 'anon may save answers');
select ok(not has_table_privilege('anon', 'public.booking_assessments', 'select'), 'anon cannot read answers');
select is(pg_temp.q(null, format('select public.save_assessment(%L, %L, %L::jsonb)', lpad('1', 32, 'f'), 'tourism', '{"age_bracket":"age_opt_2","travel":"trav_opt_1,trav_opt_2"}')), 'OK', 'customer saves answers on a held booking');
select is(pg_temp.q(null, format('select public.save_assessment(%L, %L, %L::jsonb)', lpad('1', 32, 'f'), 'tourism', '{"age_bracket":"age_opt_1"}')), 'OK', 'customer can correct answers while held');
select is((select answers->>'age_bracket' from booking_assessments b join bookings k on k.id = b.booking_id where k.reference = 'BA-1'), 'age_opt_1', 'latest answers kept');
select is(pg_temp.q(null, format('select public.save_assessment(%L, %L, %L::jsonb)', lpad('2', 32, 'f'), 'tourism', '{}')), 'ERR:P0001:INVALID_TRANSITION', 'confirmed booking is locked');
select is(pg_temp.q(null, format('select public.save_assessment(%L, %L, %L::jsonb)', lpad('1', 32, 'f'), 'education', '{}')), 'ERR:P0001:INVALID_INPUT', 'unassessed program refused');
select is(pg_temp.q(null, format('select public.save_assessment(%L, %L, %L::jsonb)', lpad('1', 32, 'f'), 'tourism', '{"a":{"nested":1}}')), 'ERR:P0001:INVALID_INPUT', 'nested values refused');
select is(pg_temp.q(null, format('select public.save_assessment(%L, %L, %L::jsonb)', lpad('1', 32, 'f'), 'tourism', jsonb_build_object('x', repeat('y', 201)))), 'ERR:P0001:INVALID_INPUT', 'long values refused');
select is(pg_temp.q(null, format('select public.save_assessment(%L, %L, %L::jsonb)', 'bad', 'tourism', '{}')), 'ERR:P0001:NOT_FOUND', 'unknown token');

select is(pg_temp.q('00000000-0000-0000-0000-0000000000e1', 'select count(*)::text from public.booking_assessments'), '1', 'admin reads');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000e2', 'select count(*)::text from public.booking_assessments'), '1', 'booking consultant reads');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000e3', 'select count(*)::text from public.booking_assessments'), '0', 'other consultant does not');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000e4', 'select count(*)::text from public.booking_assessments'), '0', 'finance does not');
select ok(not exists (select 1 from jsonb_object_keys(public.get_booking(lpad('1', 32, 'f'))) k where k like '%assess%' or k = 'answers'), 'customer booking view has no answers');

select * from finish();
rollback;
