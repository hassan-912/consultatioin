-- Staff roles, RLS and staff RPCs (spec §4). Test users are inserted into auth.users + staff_profiles inside this
-- rolled-back transaction. pg_temp.q(uid, sql) runs one statement as that user (set local role authenticated +
-- request.jwt.claims; uid null = anon) and returns the first column as text, or 'ERR:<sqlstate>:<message>'.
-- Assertions themselves run as the test owner, so pgTAP's own temp tables stay untouched by the API roles.
begin;
set local search_path = public, extensions;
select plan(82);

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
  begin
    execute sql into r;
  exception when others then
    r := 'ERR:' || sqlstate || ':' || sqlerrm;
  end;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  return r;
end $$;

-- users: a1 admin, a2 finance, a3 reception, a4 consultant mohamed-gamal, a5 consultant ahmed-salama,
--        a6 signed in but not staff, a7 inactive finance, a8 new user for set_staff_role
insert into auth.users (id, email, aud, role, instance_id)
select ('00000000-0000-0000-0000-0000000000a' || n)::uuid, 'rls-a' || n || '@test.local', 'authenticated', 'authenticated',
       '00000000-0000-0000-0000-000000000000'
from generate_series(1, 8) n;
insert into staff_profiles (user_id, display_name, role, consultant_id, active) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin', 'admin', null, true),
  ('00000000-0000-0000-0000-0000000000a2', 'Finance', 'finance', null, true),
  ('00000000-0000-0000-0000-0000000000a3', 'Reception', 'reception', null, true),
  ('00000000-0000-0000-0000-0000000000a4', 'Gamal', 'consultant', 'mohamed-gamal', true),
  ('00000000-0000-0000-0000-0000000000a5', 'Salama', 'consultant', 'ahmed-salama', true),
  ('00000000-0000-0000-0000-0000000000a7', 'Old finance', 'finance', null, false);
create function pg_temp.u(n int) returns uuid language sql as $$ select ('00000000-0000-0000-0000-0000000000a' || n)::uuid $$;

-- Cairo local day (today + n) at hh:mm
create function pg_temp.at(n int, hhmm text) returns timestamptz language sql as $$
  select ((now() at time zone 'Africa/Cairo')::date + n + hhmm::time) at time zone 'Africa/Cairo' $$;
create function pg_temp.mk(ref text, cid text, s timestamptz, st booking_status) returns uuid language sql as $$
  insert into bookings(reference,qr_token,manage_token,consultant_id,branch_id,format,starts_at,ends_at,tz,price_amount,
    customer_name,customer_phone,channel,lang,status,hold_expires_at)
  values (ref, md5('q'||ref), md5('m'||ref), cid, 'nasr-city', 'in-person', s, s + interval '30 minutes',
    'Africa/Cairo', 1000, 'T', '+201009999999', 'whatsapp', 'en', st, now() + interval '30 minutes')
  returning id $$;
create function pg_temp.id(ref text) returns uuid language sql as $$ select id from bookings where reference = ref $$;
create function pg_temp.st(ref text) returns text language sql as $$ select status::text from bookings where reference = ref $$;

select pg_temp.mk('RL-V', 'mohamed-gamal', pg_temp.at(200, '10:00'), 'on-hold');
select pg_temp.mk('RL-R', 'mohamed-gamal', pg_temp.at(200, '11:00'), 'on-hold');
select pg_temp.mk('RL-H', 'mohamed-gamal', pg_temp.at(200, '12:00'), 'on-hold');
select pg_temp.mk('RL-S', 'ahmed-salama', pg_temp.at(200, '10:00'), 'confirmed');
select pg_temp.mk('RL-C', 'ahmed-salama', pg_temp.at(200, '11:00'), 'reserved');
select pg_temp.mk('RL-T', 'mohamed-gamal', pg_temp.at(0, '00:00'), 'confirmed');
select pg_temp.mk('RL-U', 'ahmed-salama', pg_temp.at(0, '00:40'), 'confirmed');
select pg_temp.mk('RL-W', 'mohamed-gamal', pg_temp.at(1, '10:00'), 'confirmed');
select pg_temp.mk('RL-N', 'mohamed-gamal', pg_temp.at(202, '10:00'), 'confirmed');
select pg_temp.mk('RL-X', 'mohamed-gamal', pg_temp.at(201, '10:00'), 'expired');
select pg_temp.mk('RL-Y', 'mohamed-gamal', pg_temp.at(201, '10:00'), 'confirmed');  -- took RL-X's released slot
insert into payments (booking_id, method, txn_ref)
select pg_temp.id(r), 'instapay', 'TX-' || r from unnest(array['RL-V','RL-R','RL-H','RL-X']) r;

-- ------------------------------------------------------------------ anon
select ok(bool_and(pg_temp.q(null, 'select count(*) from public.' || t) like 'ERR:42501:%'),
  'anon: permission denied on every table')
from unnest(array['bookings','payments','audit_log','consultation_records','schedules','schedule_exceptions','staff_profiles']) t;
select alike(pg_temp.q(null, $$select public.staff_transition('$$ || pg_temp.id('RL-V') || $$', 'verify')$$), 'ERR:42501:%',
  'anon: cannot execute staff_transition');
select alike(pg_temp.q(null, $$select public.check_in('x')$$), 'ERR:42501:%', 'anon: cannot execute check_in');
select alike(pg_temp.q(null, $$select public.current_staff_role()$$), 'ERR:42501:%', 'anon: cannot execute current_staff_role');

-- ------------------------------------------------------------------ current_staff_role
select is(pg_temp.q(pg_temp.u(2), 'select public.current_staff_role()'), 'finance', 'current_staff_role: finance');
select is(pg_temp.q(pg_temp.u(6), 'select public.current_staff_role()'), null, 'current_staff_role: non-staff -> null');
select is(pg_temp.q(pg_temp.u(7), 'select public.current_staff_role()'), null, 'current_staff_role: inactive -> null');

-- ------------------------------------------------------------------ non-staff / inactive
select is(pg_temp.q(pg_temp.u(6), 'select count(*) from public.bookings'), '0', 'non-staff: sees no bookings');
select is(pg_temp.q(pg_temp.u(7), 'select count(*) from public.bookings'), '0', 'inactive staff: sees no bookings');
select is(pg_temp.q(pg_temp.u(6), $$select public.staff_transition('$$ || pg_temp.id('RL-V') || $$', 'verify')$$),
  'ERR:P0001:FORBIDDEN', 'non-staff: staff_transition -> FORBIDDEN');
select is(pg_temp.q(pg_temp.u(7), $$select public.staff_transition('$$ || pg_temp.id('RL-V') || $$', 'verify')$$),
  'ERR:P0001:FORBIDDEN', 'inactive staff: staff_transition -> FORBIDDEN');

-- ------------------------------------------------------------------ finance
select is(pg_temp.q(pg_temp.u(2), 'select count(*) from public.bookings'), (select count(*)::text from bookings), 'finance: sees all bookings');
select is(pg_temp.q(pg_temp.u(2), 'select count(*) from public.payments'), (select count(*)::text from payments), 'finance: sees all payments');
select is(pg_temp.q(pg_temp.u(2), 'select count(*) from public.consultation_records'), '0', 'finance: no consultation records');
select is(pg_temp.q(pg_temp.u(2), 'select count(*) from public.staff_profiles'), '1', 'finance: sees only own staff profile');
select is(pg_temp.q(pg_temp.u(2), $$select public.upsert_schedule('mohamed-gamal', '{}'::jsonb, '[]'::jsonb, '{online}', 4)$$),
  'ERR:P0001:FORBIDDEN', 'finance: cannot upsert_schedule');
select is(pg_temp.q(pg_temp.u(2), $$select public.staff_transition('$$ || pg_temp.id('RL-V') || $$', 'verify')->>'status'$$),
  'confirmed', 'finance: verify -> confirmed');
select is((select array[decided_by::text, decision, (decided_at is not null)::text] from payments where booking_id = pg_temp.id('RL-V')),
  array[pg_temp.u(2)::text, 'verify', 'true'], 'finance: verify records payment decision');
select is((select array[actor_user::text, actor_kind, from_value, to_value] from audit_log where booking_id = pg_temp.id('RL-V')),
  array[pg_temp.u(2)::text, 'finance', 'on-hold', 'confirmed'], 'finance: verify audited with actor_user');
select is(pg_temp.q(pg_temp.u(2), 'select count(*) from public.audit_log'), (select count(*)::text from audit_log), 'finance: reads audit_log');
select is(pg_temp.q(pg_temp.u(2), $$select public.staff_transition('$$ || pg_temp.id('RL-R') || $$', 'reject', 'blurry receipt')->>'reject_reason'$$),
  'blurry receipt', 'finance: reject stores reason');
select is((select decision from payments where booking_id = pg_temp.id('RL-R')), 'reject', 'finance: reject records payment decision');
select is(pg_temp.q(pg_temp.u(2), $$select public.staff_transition('$$ || pg_temp.id('RL-S') || $$', 'mark-sent', 'whatsapp')->>'ticket_sent_via'$$),
  'whatsapp', 'finance: mark-sent takes the channel in reason');
select is(pg_temp.q(pg_temp.u(2), $$select public.staff_transition('$$ || pg_temp.id('RL-T') || $$', 'check-in')$$),
  'ERR:P0001:FORBIDDEN', 'finance: cannot check-in');
select is(pg_temp.q(pg_temp.u(2), $$select public.staff_transition('$$ || pg_temp.id('RL-C') || $$', 'cancel')$$),
  'ERR:P0001:FORBIDDEN', 'finance: cannot cancel');
select is(pg_temp.q(pg_temp.u(2), $$select public.check_in('$$ || md5('qRL-T') || $$')$$),
  'ERR:P0001:FORBIDDEN', 'finance: cannot check_in');
-- a late transfer whose released slot was re-booked cannot be verified
select is(pg_temp.q(pg_temp.u(2), $$select public.staff_transition('$$ || pg_temp.id('RL-X') || $$', 'late')->>'status'$$),
  'late-transfer', 'finance: late -> late-transfer');
select is(pg_temp.q(pg_temp.u(2), $$select public.staff_transition('$$ || pg_temp.id('RL-X') || $$', 'verify')$$),
  'ERR:P0001:SLOT_TAKEN', 'finance: verify into a re-booked slot -> SLOT_TAKEN');
select is(pg_temp.q(pg_temp.u(2), $$select public.staff_transition('$$ || pg_temp.id('RL-H') || $$', 'submit-payment')$$),
  'ERR:P0001:INVALID_INPUT', 'staff_transition: customer/system events refused');
-- no direct writes
select alike(pg_temp.q(pg_temp.u(2), $$update public.bookings set status = 'confirmed' where reference = 'RL-H' returning 1$$),
  'ERR:42501:%', 'finance: direct UPDATE bookings denied');
select alike(pg_temp.q(pg_temp.u(2), $$insert into public.audit_log(actor_kind, action) values ('finance', 'x') returning 1$$),
  'ERR:42501:%', 'finance: direct INSERT audit_log denied');
select alike(pg_temp.q(pg_temp.u(1), $$delete from public.payments returning 1$$), 'ERR:42501:%', 'admin: direct DELETE payments denied');

-- ------------------------------------------------------------------ reception
select is(pg_temp.q(pg_temp.u(3), 'select count(*) from public.bookings'), (select count(*)::text from bookings), 'reception: sees all bookings');
select is(pg_temp.q(pg_temp.u(3), 'select count(*) from public.payments'), '0', 'reception: no payments');
select is(pg_temp.q(pg_temp.u(3), 'select count(*) from public.audit_log'), '0', 'reception: no audit_log');
select is(pg_temp.q(pg_temp.u(3), $$select public.staff_transition('$$ || pg_temp.id('RL-H') || $$', 'verify')$$),
  'ERR:P0001:FORBIDDEN', 'reception: cannot verify');
select is(pg_temp.st('RL-H'), 'on-hold', 'reception: refused verify leaves status');
select is(pg_temp.q(pg_temp.u(3), $$select public.check_in('$$ || md5('qRL-T') || $$')->>'verdict'$$), 'ok', 'check_in: qr_token today -> ok');
select is((select array[status::text, (checked_in_at is not null)::text] from bookings where reference = 'RL-T'), array['checked-in','true'],
  'check_in: records the check-in');
select is((select array[actor_user::text, actor_kind, action] from audit_log where booking_id = pg_temp.id('RL-T')),
  array[pg_temp.u(3)::text, 'reception', 'checkin'], 'check_in: audited with actor_user');
select is(pg_temp.q(pg_temp.u(3), $$select public.check_in('$$ || md5('qRL-T') || $$')->>'verdict'$$), 'already-used', 'check_in: second scan -> already-used');
select is(pg_temp.q(pg_temp.u(3), $$select public.check_in(' rl-u ') #>> '{booking,reference}'$$), 'RL-U',
  'check_in: reference is trimmed and case-insensitive');
select is(pg_temp.st('RL-U'), 'checked-in', 'check_in: by reference checks in');
select is(pg_temp.q(pg_temp.u(3), $$select public.check_in('RL-W')->>'verdict'$$), 'wrong-date', 'check_in: tomorrow -> wrong-date');
select is(pg_temp.q(pg_temp.u(3), $$select public.check_in('RL-H')->>'verdict'$$), 'on-hold', 'check_in: unpaid review -> on-hold');
select is(pg_temp.q(pg_temp.u(3), $$select public.check_in('MG-NONE-XXXX') = '{"verdict": "not-found", "booking": null}'::jsonb$$),
  'true', 'check_in: unknown code -> not-found');

-- ------------------------------------------------------------------ consultant
select is(pg_temp.q(pg_temp.u(4), 'select count(*) from public.bookings'),
  (select count(*)::text from bookings where consultant_id = 'mohamed-gamal'), 'consultant: sees only own consultant_id');
select is(pg_temp.q(pg_temp.u(4), $$select count(*) from public.bookings where reference = 'RL-S'$$), '0', 'consultant: other consultant''s booking hidden');
select is(pg_temp.q(pg_temp.u(4), 'select count(*) from public.payments'), '0', 'consultant: no payments');
select is(pg_temp.q(pg_temp.u(4), $$select public.staff_transition('$$ || pg_temp.id('RL-H') || $$', 'verify')$$),
  'ERR:P0001:FORBIDDEN', 'consultant: cannot verify');
select is(pg_temp.q(pg_temp.u(4), $$select public.staff_transition('$$ || pg_temp.id('RL-T') || $$', 'complete')->>'status'$$),
  'completed', 'consultant: completes own booking');
select is(pg_temp.q(pg_temp.u(4), $$select public.staff_transition('$$ || pg_temp.id('RL-U') || $$', 'complete')$$),
  'ERR:P0001:FORBIDDEN', 'consultant: cannot complete another consultant''s booking');
select is(pg_temp.q(pg_temp.u(4), $$select public.staff_transition('$$ || pg_temp.id('RL-N') || $$', 'no-show')->>'status'$$),
  'no-show', 'consultant: marks own no-show');
select is(pg_temp.q(pg_temp.u(4), $$select public.save_record('$$ || pg_temp.id('RL-T') || $$', 'discussed visa', 'follow-up')->>'outcome'$$),
  'follow-up', 'consultant: save_record on own booking');
select is(pg_temp.q(pg_temp.u(4), $$select notes from public.consultation_records$$), 'discussed visa', 'consultant: reads own record');
select is(pg_temp.q(pg_temp.u(5), $$select count(*) from public.consultation_records$$), '0', 'consultant: other''s records hidden');
select is(pg_temp.q(pg_temp.u(5), $$select public.save_record('$$ || pg_temp.id('RL-T') || $$', 'x', 'y')$$),
  'ERR:P0001:FORBIDDEN', 'consultant: save_record on another''s booking -> FORBIDDEN');

-- ------------------------------------------------------------------ admin
select is(pg_temp.q(pg_temp.u(1), $$select public.staff_transition('$$ || pg_temp.id('RL-C') || $$', 'cancel')->>'status'$$),
  'cancelled', 'admin: cancel');
select is(pg_temp.q(pg_temp.u(1), 'select count(*) from public.staff_profiles'), (select count(*)::text from staff_profiles), 'admin: sees all staff profiles');
select is(pg_temp.q(pg_temp.u(1), $$select public.upsert_schedule('mohamed-gamal', '{"0":[{"start":600,"end":900}]}'::jsonb, '[]'::jsonb, '{online}', 4)->>'max_per_day'$$),
  '4', 'admin: upsert_schedule');
select is(pg_temp.q(pg_temp.u(3), $$select max_per_day from public.schedules where consultant_id = 'mohamed-gamal'$$), '4', 'staff: schedules readable');
select ok(pg_temp.q(pg_temp.u(1), $$select public.add_exception('mohamed-gamal', 'leave', current_date + 300, current_date + 301)$$) ~ '^[0-9a-f-]{36}$',
  'admin: add_exception returns id');
select is(pg_temp.q(pg_temp.u(1), $$select public.remove_exception((select id from public.schedule_exceptions where starts_on = current_date + 300 and consultant_id = 'mohamed-gamal'))::text$$),
  'true', 'admin: remove_exception');
select is(pg_temp.q(pg_temp.u(1), $$select public.set_staff_role('$$ || pg_temp.u(8) || $$', 'New', 'consultant', 'ahmed-khalil', true)->>'role'$$),
  'consultant', 'admin: set_staff_role');
select is(pg_temp.q(pg_temp.u(8), 'select public.current_staff_role()'), 'consultant', 'set_staff_role: new role effective');
select is(pg_temp.q(pg_temp.u(1), $$select public.set_staff_role('$$ || pg_temp.u(1) || $$', 'Admin', 'finance', null, true)$$),
  'ERR:P0001:INVALID_INPUT', 'admin: cannot demote self');
select is(pg_temp.q(pg_temp.u(4), $$select public.add_exception('mohamed-gamal', 'leave', current_date, current_date)$$),
  'ERR:P0001:FORBIDDEN', 'consultant: cannot add_exception');

-- booking tokens are hidden from every signed-in role (0009); finance/admin get the manage link via staff_manage_token
select alike(pg_temp.q(pg_temp.u(3), $$select manage_token from public.bookings limit 1$$), 'ERR:42501:%', 'reception: manage_token denied');
select alike(pg_temp.q(pg_temp.u(3), $$select qr_token from public.bookings limit 1$$), 'ERR:42501:%', 'reception: qr_token denied');
select alike(pg_temp.q(pg_temp.u(4), $$select manage_token from public.bookings limit 1$$), 'ERR:42501:%', 'consultant: manage_token denied');
select alike(pg_temp.q(pg_temp.u(4), $$select qr_token from public.bookings limit 1$$), 'ERR:42501:%', 'consultant: qr_token denied');
select alike(pg_temp.q(pg_temp.u(2), $$select manage_token from public.bookings limit 1$$), 'ERR:42501:%', 'finance: manage_token not selectable directly');
select is(pg_temp.q(pg_temp.u(3), $$select status::text from public.bookings where id = '$$ || pg_temp.id('RL-H') || $$'$$), 'on-hold', 'reception: other columns still readable');
select is(pg_temp.q(pg_temp.u(4), $$select id::text from public.bookings where reference = 'RL-H'$$), pg_temp.id('RL-H')::text, 'consultant: other columns still readable');
select is(pg_temp.q(pg_temp.u(3), $$select (public.staff_transition('$$ || pg_temp.id('RL-W') || $$', 'no-show') ?| array['manage_token','qr_token'])::text$$),
  'false', 'staff_transition: result omits booking tokens');
select is(pg_temp.q(pg_temp.u(2), $$select public.staff_manage_token('$$ || pg_temp.id('RL-H') || $$')$$), md5('mRL-H'), 'finance: staff_manage_token');
select is(pg_temp.q(pg_temp.u(1), $$select public.staff_manage_token('$$ || pg_temp.id('RL-S') || $$')$$), md5('mRL-S'), 'admin: staff_manage_token');
select is(pg_temp.q(pg_temp.u(3), $$select public.staff_manage_token('$$ || pg_temp.id('RL-H') || $$')$$), 'ERR:P0001:FORBIDDEN', 'reception: staff_manage_token -> FORBIDDEN');
select is(pg_temp.q(pg_temp.u(4), $$select public.staff_manage_token('$$ || pg_temp.id('RL-H') || $$')$$), 'ERR:P0001:FORBIDDEN', 'consultant: staff_manage_token -> FORBIDDEN');
select is(pg_temp.q(pg_temp.u(2), $$select public.staff_manage_token(gen_random_uuid())$$), 'ERR:P0001:NOT_FOUND', 'finance: staff_manage_token unknown id -> NOT_FOUND');
select alike(pg_temp.q(null, $$select public.staff_manage_token(gen_random_uuid())$$), 'ERR:42501:%', 'anon: cannot execute staff_manage_token');

-- every staff transition carries actor_user
select is((select array[count(*) filter (where actor_user is null), count(*) filter (where actor_user is not null)]::int[]
           from audit_log where booking_id in (select id from bookings where reference like 'RL-%')), array[0, 11],
  'audit: every staff transition has actor_user (11 staff audit rows)');

select * from finish();
rollback;
