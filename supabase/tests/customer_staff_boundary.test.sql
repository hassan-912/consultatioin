-- Real API roles; all fixtures roll back. No existing records are removed or changed.
begin;
set local search_path = public, extensions;
select plan(61);

create function pg_temp.q(uid uuid, sql text) returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claims', case when uid is null then '{"role":"anon"}'
    else json_build_object('sub', uid, 'role', 'authenticated')::text end, true);
  perform set_config('role', case when uid is null then 'anon' else 'authenticated' end, true);
  begin
    execute sql into r;
  exception when others then
    r := 'ERR:' || sqlstate || ':' || sqlerrm;
  end;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  return r;
end $$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000b' || n)::uuid $$;
insert into auth.users (id, email, aud, role, instance_id)
select pg_temp.u(n), 'boundary-b' || n || '@test.local', 'authenticated', 'authenticated',
  '00000000-0000-0000-0000-000000000000' from generate_series(1,6) n;
insert into staff_profiles (user_id, display_name, role, consultant_id, active) values
  (pg_temp.u(1), 'Admin', 'admin', null, true),
  (pg_temp.u(2), 'Finance', 'finance', null, true),
  (pg_temp.u(3), 'Reception', 'reception', null, true),
  (pg_temp.u(4), 'Consultant', 'consultant', 'boundary-test', true),
  (pg_temp.u(6), 'Inactive finance', 'finance', null, false);
insert into consultant_branches (consultant_id, branch_id, tz) values ('boundary-test','nasr-city','Africa/Cairo');
insert into schedules (consultant_id, weekly, formats)
select 'boundary-test', jsonb_object_agg(d::text, '[{"start":600,"end":1080}]'::jsonb), '{online,in-person}'
from generate_series(0,6) d;
create function pg_temp.at(hhmm text) returns timestamptz language sql as $$
  select ((now() at time zone 'Africa/Cairo')::date + 30 + hhmm::time) at time zone 'Africa/Cairo' $$;
insert into bookings(reference,qr_token,manage_token,consultant_id,branch_id,format,starts_at,ends_at,tz,price_amount,
  customer_name,customer_phone,channel,lang,status,hold_expires_at)
values ('MG-BNDY-0001', md5('boundary-qr'), md5('boundary-manage'), 'boundary-test','nasr-city','online',
  pg_temp.at('10:00'), pg_temp.at('10:30'), 'Africa/Cairo',1000,'Boundary','+209990001111','whatsapp','en','reserved',now()+interval '30 minutes');
create temp table before_calls as
select (select count(*) from bookings) bookings, (select count(*) from payments) payments,
  (select count(*) from audit_log) audit, (select count(*) from rate_limits) counters;

-- Every active role is refused with valid customer credentials and malformed inputs.
select is(pg_temp.q(pg_temp.u(1), $q$select find_booking('MG-BNDY-0001', '+209990001111')$q$), 'ERR:P0001:FORBIDDEN', 'admin: find_booking valid input refused');
select is(pg_temp.q(pg_temp.u(1), $q$select get_booking(md5('boundary-manage'))$q$), 'ERR:P0001:FORBIDDEN', 'admin: get_booking valid input refused');
select is(pg_temp.q(pg_temp.u(1), $q$select submit_payment(md5('boundary-manage'),'instapay','BNDY-TX')$q$), 'ERR:P0001:FORBIDDEN', 'admin: submit_payment valid input refused');
select is(pg_temp.q(pg_temp.u(1), $q$select cancel_booking(md5('boundary-manage'))$q$), 'ERR:P0001:FORBIDDEN', 'admin: cancel_booking valid input refused');
select is(pg_temp.q(pg_temp.u(1), format($q$select reschedule_booking(md5('boundary-manage'), %s::timestamptz)$q$, quote_literal(pg_temp.at('12:00')))), 'ERR:P0001:FORBIDDEN', 'admin: reschedule_booking valid input refused');
select is(pg_temp.q(pg_temp.u(1), format($q$select reserve_slot('boundary-test','online', %s::timestamptz, '{"name":"Boundary","phone":"+209990001112"}'::jsonb)$q$, quote_literal(pg_temp.at('12:00')))), 'ERR:P0001:FORBIDDEN', 'admin: reserve_slot valid input refused');
select is(pg_temp.q(pg_temp.u(1), $q$select find_booking(null,null)$q$), 'ERR:P0001:FORBIDDEN', 'admin: find_booking invalid input refused');
select is(pg_temp.q(pg_temp.u(1), $q$select get_booking(null)$q$), 'ERR:P0001:FORBIDDEN', 'admin: get_booking invalid input refused');
select is(pg_temp.q(pg_temp.u(1), $q$select submit_payment(null,null,null)$q$), 'ERR:P0001:FORBIDDEN', 'admin: submit_payment invalid input refused');
select is(pg_temp.q(pg_temp.u(1), $q$select cancel_booking(null)$q$), 'ERR:P0001:FORBIDDEN', 'admin: cancel_booking invalid input refused');
select is(pg_temp.q(pg_temp.u(1), $q$select reschedule_booking(null,null)$q$), 'ERR:P0001:FORBIDDEN', 'admin: reschedule_booking invalid input refused');
select is(pg_temp.q(pg_temp.u(1), $q$select reserve_slot(null,null,null,null)$q$), 'ERR:P0001:FORBIDDEN', 'admin: reserve_slot invalid input refused');
select is(pg_temp.q(pg_temp.u(2), $q$select find_booking('MG-BNDY-0001', '+209990001111')$q$), 'ERR:P0001:FORBIDDEN', 'finance: find_booking valid input refused');
select is(pg_temp.q(pg_temp.u(2), $q$select get_booking(md5('boundary-manage'))$q$), 'ERR:P0001:FORBIDDEN', 'finance: get_booking valid input refused');
select is(pg_temp.q(pg_temp.u(2), $q$select submit_payment(md5('boundary-manage'),'instapay','BNDY-TX')$q$), 'ERR:P0001:FORBIDDEN', 'finance: submit_payment valid input refused');
select is(pg_temp.q(pg_temp.u(2), $q$select cancel_booking(md5('boundary-manage'))$q$), 'ERR:P0001:FORBIDDEN', 'finance: cancel_booking valid input refused');
select is(pg_temp.q(pg_temp.u(2), format($q$select reschedule_booking(md5('boundary-manage'), %s::timestamptz)$q$, quote_literal(pg_temp.at('12:00')))), 'ERR:P0001:FORBIDDEN', 'finance: reschedule_booking valid input refused');
select is(pg_temp.q(pg_temp.u(2), format($q$select reserve_slot('boundary-test','online', %s::timestamptz, '{"name":"Boundary","phone":"+209990001112"}'::jsonb)$q$, quote_literal(pg_temp.at('12:00')))), 'ERR:P0001:FORBIDDEN', 'finance: reserve_slot valid input refused');
select is(pg_temp.q(pg_temp.u(2), $q$select find_booking(null,null)$q$), 'ERR:P0001:FORBIDDEN', 'finance: find_booking invalid input refused');
select is(pg_temp.q(pg_temp.u(2), $q$select get_booking(null)$q$), 'ERR:P0001:FORBIDDEN', 'finance: get_booking invalid input refused');
select is(pg_temp.q(pg_temp.u(2), $q$select submit_payment(null,null,null)$q$), 'ERR:P0001:FORBIDDEN', 'finance: submit_payment invalid input refused');
select is(pg_temp.q(pg_temp.u(2), $q$select cancel_booking(null)$q$), 'ERR:P0001:FORBIDDEN', 'finance: cancel_booking invalid input refused');
select is(pg_temp.q(pg_temp.u(2), $q$select reschedule_booking(null,null)$q$), 'ERR:P0001:FORBIDDEN', 'finance: reschedule_booking invalid input refused');
select is(pg_temp.q(pg_temp.u(2), $q$select reserve_slot(null,null,null,null)$q$), 'ERR:P0001:FORBIDDEN', 'finance: reserve_slot invalid input refused');
select is(pg_temp.q(pg_temp.u(3), $q$select find_booking('MG-BNDY-0001', '+209990001111')$q$), 'ERR:P0001:FORBIDDEN', 'reception: find_booking valid input refused');
select is(pg_temp.q(pg_temp.u(3), $q$select get_booking(md5('boundary-manage'))$q$), 'ERR:P0001:FORBIDDEN', 'reception: get_booking valid input refused');
select is(pg_temp.q(pg_temp.u(3), $q$select submit_payment(md5('boundary-manage'),'instapay','BNDY-TX')$q$), 'ERR:P0001:FORBIDDEN', 'reception: submit_payment valid input refused');
select is(pg_temp.q(pg_temp.u(3), $q$select cancel_booking(md5('boundary-manage'))$q$), 'ERR:P0001:FORBIDDEN', 'reception: cancel_booking valid input refused');
select is(pg_temp.q(pg_temp.u(3), format($q$select reschedule_booking(md5('boundary-manage'), %s::timestamptz)$q$, quote_literal(pg_temp.at('12:00')))), 'ERR:P0001:FORBIDDEN', 'reception: reschedule_booking valid input refused');
select is(pg_temp.q(pg_temp.u(3), format($q$select reserve_slot('boundary-test','online', %s::timestamptz, '{"name":"Boundary","phone":"+209990001112"}'::jsonb)$q$, quote_literal(pg_temp.at('12:00')))), 'ERR:P0001:FORBIDDEN', 'reception: reserve_slot valid input refused');
select is(pg_temp.q(pg_temp.u(3), $q$select find_booking(null,null)$q$), 'ERR:P0001:FORBIDDEN', 'reception: find_booking invalid input refused');
select is(pg_temp.q(pg_temp.u(3), $q$select get_booking(null)$q$), 'ERR:P0001:FORBIDDEN', 'reception: get_booking invalid input refused');
select is(pg_temp.q(pg_temp.u(3), $q$select submit_payment(null,null,null)$q$), 'ERR:P0001:FORBIDDEN', 'reception: submit_payment invalid input refused');
select is(pg_temp.q(pg_temp.u(3), $q$select cancel_booking(null)$q$), 'ERR:P0001:FORBIDDEN', 'reception: cancel_booking invalid input refused');
select is(pg_temp.q(pg_temp.u(3), $q$select reschedule_booking(null,null)$q$), 'ERR:P0001:FORBIDDEN', 'reception: reschedule_booking invalid input refused');
select is(pg_temp.q(pg_temp.u(3), $q$select reserve_slot(null,null,null,null)$q$), 'ERR:P0001:FORBIDDEN', 'reception: reserve_slot invalid input refused');
select is(pg_temp.q(pg_temp.u(4), $q$select find_booking('MG-BNDY-0001', '+209990001111')$q$), 'ERR:P0001:FORBIDDEN', 'consultant: find_booking valid input refused');
select is(pg_temp.q(pg_temp.u(4), $q$select get_booking(md5('boundary-manage'))$q$), 'ERR:P0001:FORBIDDEN', 'consultant: get_booking valid input refused');
select is(pg_temp.q(pg_temp.u(4), $q$select submit_payment(md5('boundary-manage'),'instapay','BNDY-TX')$q$), 'ERR:P0001:FORBIDDEN', 'consultant: submit_payment valid input refused');
select is(pg_temp.q(pg_temp.u(4), $q$select cancel_booking(md5('boundary-manage'))$q$), 'ERR:P0001:FORBIDDEN', 'consultant: cancel_booking valid input refused');
select is(pg_temp.q(pg_temp.u(4), format($q$select reschedule_booking(md5('boundary-manage'), %s::timestamptz)$q$, quote_literal(pg_temp.at('12:00')))), 'ERR:P0001:FORBIDDEN', 'consultant: reschedule_booking valid input refused');
select is(pg_temp.q(pg_temp.u(4), format($q$select reserve_slot('boundary-test','online', %s::timestamptz, '{"name":"Boundary","phone":"+209990001112"}'::jsonb)$q$, quote_literal(pg_temp.at('12:00')))), 'ERR:P0001:FORBIDDEN', 'consultant: reserve_slot valid input refused');
select is(pg_temp.q(pg_temp.u(4), $q$select find_booking(null,null)$q$), 'ERR:P0001:FORBIDDEN', 'consultant: find_booking invalid input refused');
select is(pg_temp.q(pg_temp.u(4), $q$select get_booking(null)$q$), 'ERR:P0001:FORBIDDEN', 'consultant: get_booking invalid input refused');
select is(pg_temp.q(pg_temp.u(4), $q$select submit_payment(null,null,null)$q$), 'ERR:P0001:FORBIDDEN', 'consultant: submit_payment invalid input refused');
select is(pg_temp.q(pg_temp.u(4), $q$select cancel_booking(null)$q$), 'ERR:P0001:FORBIDDEN', 'consultant: cancel_booking invalid input refused');
select is(pg_temp.q(pg_temp.u(4), $q$select reschedule_booking(null,null)$q$), 'ERR:P0001:FORBIDDEN', 'consultant: reschedule_booking invalid input refused');
select is(pg_temp.q(pg_temp.u(4), $q$select reserve_slot(null,null,null,null)$q$), 'ERR:P0001:FORBIDDEN', 'consultant: reserve_slot invalid input refused');

select is((select row(b.bookings,b.payments,b.audit,b.counters)::text from before_calls b),
  row((select count(*) from bookings),(select count(*) from payments),(select count(*) from audit_log),(select count(*) from rate_limits))::text,
  'staff refusals create no bookings, payments, audit rows or rate counters');
select is((select status::text || ':' || (starts_at = pg_temp.at('10:00'))::text from bookings where reference = 'MG-BNDY-0001'),
  'reserved:true', 'staff refusals leave booking status and time unchanged');
-- Authenticated customers and inactive profiles retain customer capability access.
select is(pg_temp.q(pg_temp.u(5), $q$select find_booking('MG-BNDY-0001','+209990001111')$q$), md5('boundary-manage'), 'nonstaff: recovery works');
select is(pg_temp.q(pg_temp.u(6), $q$select get_booking(md5('boundary-manage'))->>'reference'$q$), 'MG-BNDY-0001', 'inactive staff: customer access works');
select ok(coalesce(not has_function_privilege('anon',to_regprocedure('public.assert_customer_access()'),'execute')
  and not has_function_privilege('authenticated',to_regprocedure('public.assert_customer_access()'),'execute')
  and not has_function_privilege('service_role',to_regprocedure('public.assert_customer_access()'),'execute'), false), 'guard stays private');
-- An actual anon role completes the customer lifecycle with the same token.
select is(pg_temp.q(null, $q$select find_booking('MG-BNDY-0001','+209990001111')$q$), md5('boundary-manage'), 'anon: recovery returns token');
select is(pg_temp.q(null, $q$select get_booking(md5('boundary-manage'))->>'manage_token'$q$), md5('boundary-manage'), 'anon: get returns customer token');
select is(pg_temp.q(null, $q$select submit_payment(md5('boundary-manage'),'instapay','BNDY-TX')->>'status'$q$), 'on-hold', 'anon: submit succeeds');
select is(pg_temp.q(null, format($q$select (reschedule_booking(md5('boundary-manage'),%s::timestamptz)->>'starts_at')::timestamptz = %s::timestamptz$q$,
  quote_literal(pg_temp.at('11:00')),quote_literal(pg_temp.at('11:00')))), 'true', 'anon: reschedule succeeds');
select is(pg_temp.q(null, $q$select cancel_booking(md5('boundary-manage'))->>'status'$q$), 'cancelled', 'anon: cancel succeeds');
select matches(pg_temp.q(null, format($q$select reserve_slot('boundary-test','online',%s::timestamptz,
  '{"name":"Anon","phone":"+209990001113"}'::jsonb)->>'manage_token'$q$,quote_literal(pg_temp.at('14:00')))),
  '^[0-9a-f]{32}$', 'anon: reserve returns token');
select is((select count(*)::int from payments where txn_ref = 'BNDY-TX'), 1, 'anon: payment stored once');
select is((select count(*)::int from audit_log a join bookings b on b.id = a.booking_id
  where b.reference = 'MG-BNDY-0001' and a.actor_kind = 'customer' and a.actor_user is null), 3, 'anon: lifecycle writes customer audit');
select * from finish();
rollback;
