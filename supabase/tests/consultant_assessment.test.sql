-- 0045: the booking's consultant (or admin) saves the assessment; the client reads it; the first send is stamped once.
begin;
set local search_path = public, extensions;
select plan(11);

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
  ('00000000-0000-0000-0000-0000000000f1', 'boss8@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000f2', 'gamal8@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000f3', 'salama8@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000f4', 'fin8@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into staff_profiles (user_id, display_name, role, consultant_id, active) values
  ('00000000-0000-0000-0000-0000000000f1', 'Boss Eight', 'admin', null, true),
  ('00000000-0000-0000-0000-0000000000f2', 'Gamal Eight', 'consultant', 'mohamed-gamal', true),
  ('00000000-0000-0000-0000-0000000000f3', 'Salama Eight', 'consultant', 'ahmed-salama', true),
  ('00000000-0000-0000-0000-0000000000f4', 'Fin Eight', 'finance', null, true);
insert into bookings(reference,qr_token,manage_token,consultant_id,branch_id,format,starts_at,ends_at,tz,price_amount,
  customer_name,customer_phone,channel,lang,status,hold_expires_at)
values ('CA-1','qca1',repeat('c', 32),'mohamed-gamal','nasr-city','in-person', now() - interval '301 days', now() - interval '301 days' + interval '30 minutes',
  'Africa/Cairo',1000,'Sara Ali','+201001234567','whatsapp','ar','completed', now());
create temp table bk as select id from bookings where reference = 'CA-1';
grant select on bk to authenticated, anon;
create function pg_temp.save(uid uuid, prog text) returns text language sql as $$
  select pg_temp.q('authenticated', uid, format('select public.staff_save_assessment(%L, %L, %L::jsonb)::text', (select id from bk), prog, '{"age":"30"}')) $$;
create function pg_temp.sent(uid uuid) returns text language sql as $$
  select pg_temp.q('authenticated', uid, format('select public.staff_mark_assessment_sent(%L)::text', (select id from bk))) $$;

select is(pg_temp.save('00000000-0000-0000-0000-0000000000f2', 'tourism'), 'OK', 'its consultant saves the assessment');
select is((select program from booking_assessments where booking_id = (select id from bk)), 'tourism', 'the assessment is stored');
select is(pg_temp.save('00000000-0000-0000-0000-0000000000f3', 'tourism'), 'ERR:P0001:FORBIDDEN', 'another consultant is refused');
select is(pg_temp.save('00000000-0000-0000-0000-0000000000f4', 'tourism'), 'ERR:P0001:FORBIDDEN', 'finance is refused');
select is(pg_temp.save('00000000-0000-0000-0000-0000000000f1', 'immigration'), 'OK', 'admin may save it');
select is(pg_temp.save('00000000-0000-0000-0000-0000000000f2', 'nonsense'), 'ERR:P0001:INVALID_INPUT', 'unknown program is refused');
select ok(pg_temp.q('anon', null, $q$select public.get_my_assessment(repeat('c', 32))::text$q$) like '%immigration%', 'the client reads their own assessment');
select is(pg_temp.sent('00000000-0000-0000-0000-0000000000f3'), 'ERR:P0001:FORBIDDEN', 'another consultant cannot mark it sent');
create temp table first_send as select pg_temp.sent('00000000-0000-0000-0000-0000000000f2') as at;
select is(pg_temp.sent('00000000-0000-0000-0000-0000000000f2'), (select at from first_send), 'a second send keeps the first time');
select is((select count(*)::int from audit_log where action = 'assessment-sent' and booking_id = (select id from bk)), 1, 'the send is audited once');
select is(pg_temp.q('anon', null, $q$select public.submit_readiness_request('{}'::jsonb)::text$q$) like 'ERR:42501:%', true, 'nobody can file a readiness request');

select * from finish();
rollback;
