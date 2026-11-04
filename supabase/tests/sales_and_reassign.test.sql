-- 0021/0022: sales referral links, sales visibility, and reception's consultant swap.
begin;
set local search_path = public, extensions;
select plan(25);

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

-- f1 admin, f2 sales Mona, f3 sales Karim, f4 reception, f5 finance, f6 consultant gamal
insert into auth.users (id, email, aud, role, instance_id)
select ('00000000-0000-0000-0000-0000000000f' || n)::uuid, 'sr-f' || n || '@test.local', 'authenticated', 'authenticated',
       '00000000-0000-0000-0000-000000000000'
from generate_series(1, 6) n;
insert into staff_profiles (user_id, display_name, role, consultant_id, active) values
  ('00000000-0000-0000-0000-0000000000f1', 'Admin', 'admin', null, true),
  ('00000000-0000-0000-0000-0000000000f4', 'Reception', 'reception', null, true),
  ('00000000-0000-0000-0000-0000000000f5', 'Finance', 'finance', null, true),
  ('00000000-0000-0000-0000-0000000000f6', 'Gamal', 'consultant', 'mohamed-gamal', true);
select is(pg_temp.q('00000000-0000-0000-0000-0000000000f1',
  $q$select (public.set_staff_role('00000000-0000-0000-0000-0000000000f2', 'Mona Sales', 'sales', null, true))->>'role'$q$), 'sales', 'admin can grant the sales role');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000f1',
  $q$select (public.set_staff_role('00000000-0000-0000-0000-0000000000f3', 'Karim Sales', 'sales', null, true))->>'role'$q$), 'sales', 'second sales person');

create temp table codes as select
  pg_temp.q('00000000-0000-0000-0000-0000000000f2', 'select public.my_referral_code()') as mona,
  pg_temp.q('00000000-0000-0000-0000-0000000000f3', 'select public.my_referral_code()') as karim;
grant select on codes to anon, authenticated;
select ok((select mona from codes) ~ '^[a-z0-9]{8}$', 'sales person gets an 8-character code');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000f2', 'select public.my_referral_code()'), (select mona from codes), 'code is stable');
select ok((select mona from codes) <> (select karim from codes), 'codes differ per person');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000f5', 'select public.my_referral_code()'), 'ERR:P0001:FORBIDDEN', 'non-sales cannot get a code');

insert into public.bookings(id,reference,qr_token,manage_token,consultant_id,branch_id,format,starts_at,ends_at,tz,price_amount,
  customer_name,customer_phone,customer_email,channel,lang,status,hold_expires_at)
values
  ('a0000000-0000-0000-0000-000000000001','SR-1','qsr1',lpad('1', 32, 'b'),'mohamed-gamal','nasr-city','in-person',now() + interval '500 days',now() + interval '500 days 30 minutes','Africa/Cairo',1000,'Sara','+201001234567',null,'whatsapp','en','reserved',now() + interval '1 hour'),
  ('a0000000-0000-0000-0000-000000000002','SR-2','qsr2',lpad('2', 32, 'b'),'ahmed-salama','nasr-city','in-person',now() + interval '500 days',now() + interval '500 days 30 minutes','Africa/Cairo',1000,'Omar','+201001234568',null,'whatsapp','en','confirmed',now() + interval '1 hour'),
  ('a0000000-0000-0000-0000-000000000003','SR-3','qsr3',lpad('3', 32, 'b'),'mohamed-gamal','nasr-city','in-person',now() + interval '501 days',now() + interval '501 days 30 minutes','Africa/Cairo',1000,'Laila','+201001234569',null,'whatsapp','en','confirmed',now() + interval '1 hour');

select is(pg_temp.q(null, format('select public.set_booking_referral(%L, %L)', lpad('1', 32, 'b'), 'zzzzzzzz')), 'false', 'unknown code ignored');
select is(pg_temp.q(null, format('select public.set_booking_referral(%L, %L)', lpad('1', 32, 'b'), (select mona from codes))), 'true', 'customer link attaches the referral');
select is(pg_temp.q(null, format('select public.set_booking_referral(%L, %L)', lpad('1', 32, 'b'), (select karim from codes))), 'false', 'first referral wins');
select is(pg_temp.q(null, format('select public.set_booking_referral(%L, %L)', lpad('2', 32, 'b'), (select mona from codes))), 'false', 'confirmed bookings cannot be claimed later');
select is((select sales_name from bookings where reference = 'SR-1'), 'Mona Sales', 'sales name kept on the booking');
select is(public.get_booking(lpad('1', 32, 'b'))->>'sales_name', 'Mona Sales', 'customer ticket shows the advisor');

insert into booking_assessments (booking_id, program, answers) values
  ('a0000000-0000-0000-0000-000000000001', 'tourism', '{"age_bracket":"age_opt_2"}'),
  ('a0000000-0000-0000-0000-000000000002', 'tourism', '{"age_bracket":"age_opt_1"}');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000f2', 'select string_agg(reference, '','') from public.bookings'), 'SR-1', 'sales sees only referred bookings');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000f2', 'select count(*)::text from public.booking_assessments'), '1', 'sales sees the referred client assessment');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000f3', 'select count(*)::text from public.bookings'), '0', 'other sales person sees nothing');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000f2', 'select count(*)::text from public.payments'), '0', 'sales reads no payments');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000f4', 'select count(*)::text from public.booking_assessments'), '0', 'reception never sees assessments');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000f5', $q$select sales_name from public.bookings where reference = 'SR-1'$q$), 'Mona Sales', 'finance sees the sales name');

-- Consultant swap
select is(pg_temp.q('00000000-0000-0000-0000-0000000000f5', $q$select public.staff_reassign_consultant('a0000000-0000-0000-0000-000000000002', 'ahmed-khalil', 'Consultant isn''t free at this time')$q$), 'ERR:P0001:FORBIDDEN', 'finance cannot swap');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000f4', $q$select public.staff_reassign_consultant('a0000000-0000-0000-0000-000000000002', 'ahmed-tarek', 'Consultant isn''t free at this time')$q$), 'ERR:P0001:INVALID_INPUT', 'in-person stays in its branch');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000f4', $q$select public.staff_reassign_consultant('a0000000-0000-0000-0000-000000000002', 'mohamed-gamal', 'Consultant isn''t free at this time')$q$), 'ERR:P0001:SLOT_TAKEN', 'busy consultant refused');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000f4', $q$select public.staff_reassign_consultant('a0000000-0000-0000-0000-000000000002', 'ahmed-khalil', '  ')$q$) like 'ERR:P0001:INVALID_INPUT%', true, 'a reason is required');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000f4', $q$select public.staff_reassign_consultant('a0000000-0000-0000-0000-000000000002', 'ahmed-khalil', ' Consultant isn''t free at this time ')$q$), 'OK', 'reception swaps to a free consultant');
select is((select consultant_id || '|' || swapped_from || '|' || swap_reason from bookings where reference = 'SR-2'), 'ahmed-khalil|ahmed-salama|Consultant isn''t free at this time', 'booking moved, with who it came from and why');
select is((select count(*)::int || '|' || max(note) from audit_log where action = 'consultant-changed'), '1|Consultant isn''t free at this time', 'swap audited with the reason');

select * from finish();
rollback;
