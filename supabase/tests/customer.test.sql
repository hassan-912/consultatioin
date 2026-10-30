-- Customer RPCs (spec §4). Dates are relative to now() so the test never rots; schedule rows are inserted here
-- (rolled back). Every weekday is open 10:00-18:00 Cairo with a 13:00-13:30 break, so weekday doesn't matter.
begin;
set local search_path = public, extensions;
select plan(52);

insert into schedules (consultant_id, weekly, breaks, formats, max_per_day)
select 'mohamed-gamal', jsonb_object_agg(d::text, '[{"start":600,"end":1080}]'::jsonb), '[{"start":780,"end":810}]', '{online,in-person}', 10
from generate_series(0, 6) d
on conflict (consultant_id) do update set weekly = excluded.weekly, breaks = excluded.breaks, formats = excluded.formats, max_per_day = excluded.max_per_day;
delete from schedule_exceptions where consultant_id = 'mohamed-gamal';
delete from rate_limits;

-- Cairo local date (today + n days) and a Cairo wall-clock time -> timestamptz
create function pg_temp.day(n int) returns date language sql as $$ select (now() at time zone 'Africa/Cairo')::date + n $$;
create function pg_temp.at(n int, hhmm text) returns timestamptz language sql as $$
  select (pg_temp.day(n) + hhmm::time) at time zone 'Africa/Cairo' $$;
create function pg_temp.det(phone text default '+201001234567') returns jsonb language sql as $$
  select jsonb_build_object('name','Sara','phone',phone,'email','s@e.com','channel','email','lang','ar','program','immigration','note','') $$;
create function pg_temp.reserve(n int, hhmm text, phone text default '+201001234567') returns jsonb language sql as $$
  select reserve_slot('mohamed-gamal', 'online', pg_temp.at(n, hhmm), pg_temp.det(phone)) $$;
-- direct insert for states the RPCs can't reach on their own
create function pg_temp.mk(ref text, s timestamptz, st booking_status, hold_min int default 30, phone text default '+201009999999')
returns uuid language sql as $$
  insert into bookings(reference,qr_token,manage_token,consultant_id,branch_id,format,starts_at,ends_at,tz,price_amount,
    customer_name,customer_phone,channel,lang,status,hold_expires_at)
  values (ref, md5('q'||ref), md5('m'||ref), 'mohamed-gamal','nasr-city','online', s, s + interval '30 minutes',
    'Africa/Cairo', 1000, 'T', phone, 'whatsapp', 'en', st, now() + make_interval(mins => hold_min))
  returning id $$;
create function pg_temp.tok(ref text) returns text language sql as $$ select manage_token from bookings where reference = ref $$;
create function pg_temp.st(ref text) returns text language sql as $$ select status::text from bookings where reference = ref $$;

-- available_slots: 10:00..17:30 every 15 min = 31 starts, minus 3 touching the 13:00-13:30 break = 28
select is(array_length(available_slots('mohamed-gamal', pg_temp.day(14), 'online'), 1), 28, 'available_slots: full day');
select ok(pg_temp.at(14, '10:00') = any(available_slots('mohamed-gamal', pg_temp.day(14), 'online')), 'available_slots: 10:00 open');
select is(available_slots('mohamed-gamal', pg_temp.day(-1), 'online'), '{}'::timestamptz[], 'available_slots: no past slots');
select is(available_slots('nobody', pg_temp.day(14), 'online'), '{}'::timestamptz[], 'available_slots: unknown consultant -> empty');
select throws_ok($$select available_slots('mohamed-gamal', pg_temp.day(14), 'phone')$$, 'P0001', 'INVALID_INPUT', 'available_slots: bad format');

-- reserve_slot happy path
create temp table r1 as select pg_temp.reserve(14, '10:00') j;
select matches((select j->>'reference' from r1), '^MG-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$', 'reserve: reference format');
select matches((select j->>'manage_token' from r1), '^[0-9a-f]{32}$', 'reserve: 128-bit manage token');
select is((select (j->>'hold_expires_at')::timestamptz from r1), now() + interval '30 minutes', 'reserve: 30-min hold');
select is((select array[status::text, tz, branch_id, price_amount::text, customer_phone] from bookings where id = (select (j->>'booking_id')::uuid from r1)),
  array['reserved','Africa/Cairo','nasr-city','1000','+201001234567'], 'reserve: row stored');
select is((select action from audit_log where booking_id = (select (j->>'booking_id')::uuid from r1)), 'created', 'reserve: audited');
select is((select count(*)::int from jsonb_object_keys((select j from r1))), 4, 'reserve: minimal response');
-- slots within the 10-min buffer disappear: 10:00, 10:15, 10:30 -> 3 fewer
select is(array_length(available_slots('mohamed-gamal', pg_temp.day(14), 'online'), 1), 25, 'available_slots: held slot + buffer removed');
select ok(not pg_temp.at(14, '10:30') = any(available_slots('mohamed-gamal', pg_temp.day(14), 'online')), 'available_slots: 10:30 inside buffer');
select ok(pg_temp.at(14, '10:45') = any(available_slots('mohamed-gamal', pg_temp.day(14), 'online')), 'available_slots: 10:45 open (15-min gap)');

-- reserve_slot refusals
select throws_ok($$select pg_temp.reserve(14, '10:00', '+201002222222')$$, 'P0001', 'SLOT_TAKEN', 'reserve: same slot -> SLOT_TAKEN');
select throws_ok($$select pg_temp.reserve(14, '10:30', '+201002222222')$$, 'P0001', 'SLOT_TAKEN', 'reserve: inside buffer -> SLOT_TAKEN');
select throws_ok($$select pg_temp.reserve(-1, '10:00', '+201002222222')$$, 'P0001', 'SLOT_TAKEN', 'reserve: past -> error');
select throws_ok($$select pg_temp.reserve(14, '19:00', '+201002222222')$$, 'P0001', 'SLOT_TAKEN', 'reserve: outside working hours -> error');
select throws_ok($$select pg_temp.reserve(14, '13:00', '+201002222222')$$, 'P0001', 'SLOT_TAKEN', 'reserve: during break -> error');
select throws_ok($$select pg_temp.reserve(14, '10:05', '+201002222222')$$, 'P0001', 'SLOT_TAKEN', 'reserve: off the 15-min grid -> error');
insert into schedule_exceptions (consultant_id, kind, starts_on, ends_on) values ('mohamed-gamal', 'leave', pg_temp.day(15), pg_temp.day(16));
select throws_ok($$select pg_temp.reserve(15, '10:00', '+201002222222')$$, 'P0001', 'SLOT_TAKEN', 'reserve: on leave -> error');
select is(available_slots('mohamed-gamal', pg_temp.day(16), 'online'), '{}'::timestamptz[], 'available_slots: leave day empty');
select throws_ok($$select reserve_slot('mohamed-gamal', 'online', pg_temp.at(20, '10:00'), pg_temp.det('12345'))$$, 'P0001', 'INVALID_INPUT', 'reserve: bad phone');
select throws_ok($$select reserve_slot('mohamed-gamal', 'online', pg_temp.at(20, '10:00'), pg_temp.det() || '{"channel":"sms"}')$$, 'P0001', 'INVALID_INPUT', 'reserve: bad channel');
select throws_ok($$select reserve_slot('mohamed-gamal', 'online', pg_temp.at(20, '10:00'), pg_temp.det() || jsonb_build_object('note', repeat('x', 301)))$$, 'P0001', 'INVALID_INPUT', 'reserve: note > 300');

-- a stale hold (deadline passed, cron not yet run) doesn't block
select pg_temp.mk('MG-STAL-E001', pg_temp.at(21, '10:00'), 'reserved', -1);
select lives_ok($$select pg_temp.reserve(21, '10:00', '+201003333333')$$, 'reserve: stale hold does not block');
select is(pg_temp.st('MG-STAL-E001'), 'expired', 'reserve: stale hold expired');

-- rate limit: 6th reservation from one phone (Arabic digits normalize to the same key) in 10 min
select lives_ok($$select pg_temp.reserve(22, '10:00', '+201004444444')$$, 'rate: 1');
select lives_ok($$select pg_temp.reserve(22, '11:00', '+201004444444')$$, 'rate: 2');
select lives_ok($$select pg_temp.reserve(22, '12:00', '+201004444444')$$, 'rate: 3');
select lives_ok($$select pg_temp.reserve(22, '14:00', '+201004444444')$$, 'rate: 4');
select lives_ok($$select pg_temp.reserve(22, '15:00', '+٢٠١٠٠٤٤٤٤٤٤٤')$$, 'rate: 5 (Arabic digits)');
select throws_ok($$select pg_temp.reserve(22, '16:00', '+201004444444')$$, 'P0001', 'RATE_LIMITED', 'rate: 6th in 10 min -> RATE_LIMITED');

-- submit_payment
create temp table s1 as select submit_payment((select j->>'manage_token' from r1), 'instapay', ' TX٣٤٥ ') j;
select is((select j->>'status' from s1), 'on-hold', 'submit: reserved -> on-hold');
select is((select txn_ref from payments where booking_id = (select (j->>'booking_id')::uuid from r1)), 'TX345', 'submit: txn ref normalized');
select lives_ok($$select submit_payment((select j->>'manage_token' from r1), 'instapay', 'TX345')$$, 'submit twice: no error');
select is((select array[(select count(*) from payments p where p.booking_id = b.id), (select count(*) from audit_log a where a.booking_id = b.id and a.action = 'submitted')]
           from bookings b where b.id = (select (j->>'booking_id')::uuid from r1)), array[1::bigint, 1::bigint], 'submit twice: one payment, one audit entry');
select pg_temp.mk('MG-EXPD-HOLD', pg_temp.at(23, '10:00'), 'reserved', -1);
select throws_ok($$select submit_payment(pg_temp.tok('MG-EXPD-HOLD'), 'instapay', 'TX1')$$, 'P0001', 'HOLD_EXPIRED', 'submit: expired hold -> HOLD_EXPIRED');
select pg_temp.mk('MG-REJE-CTED', pg_temp.at(24, '10:00'), 'rejected');
select pg_temp.mk('MG-TAKE-NOW1', pg_temp.at(24, '10:15'), 'confirmed');
select throws_ok($$select submit_payment(pg_temp.tok('MG-REJE-CTED'), 'vodafone-cash', 'TX2')$$, 'P0001', 'SLOT_TAKEN', 'submit: rejected + slot taken -> SLOT_TAKEN');
select pg_temp.mk('MG-REJE-CTD2', pg_temp.at(24, '15:00'), 'rejected');
select is((submit_payment(pg_temp.tok('MG-REJE-CTD2'), 'vodafone-cash', 'TX3'))->>'status', 'on-hold', 'submit: rejected + slot free -> on-hold');
select throws_ok($$select submit_payment(pg_temp.tok('MG-STAL-E001'), 'instapay', 'TX4', 'receipts/' || gen_random_uuid() || '/x.jpg')$$,
  'P0001', 'INVALID_INPUT', 'submit: receipt path of another booking refused');

-- find_booking
select pg_temp.mk('MG-ABCD-EFGH', pg_temp.at(25, '10:00'), 'confirmed', 30, '+201001234567');
select is(find_booking('mg-abcd-efgh', '+٢٠١٠٠١٢٣٤٥٦٧'), pg_temp.tok('MG-ABCD-EFGH'), 'find: lowercase ref + Arabic-digit phone matches');
select is(find_booking('MG-ABCD-EFGH', '+201000000000'), null, 'find: wrong phone -> null');

-- get_booking: own row only
select is((get_booking(pg_temp.tok('MG-ABCD-EFGH')))->>'qr_token', md5('qMG-ABCD-EFGH'), 'get_booking: returns its own qr_token');
select ok(position(md5('qMG-REJE-CTD2') in (get_booking(pg_temp.tok('MG-ABCD-EFGH')))::text) = 0
      and not ((get_booking(pg_temp.tok('MG-ABCD-EFGH'))) ? 'decided_by'), 'get_booking: no other qr_token, no staff fields');
select is(get_booking('0123456789abcdef0123456789abcdef'), null, 'get_booking: wrong token -> null');

-- cancel / reschedule
select is((cancel_booking(pg_temp.tok('MG-REJE-CTD2')))->>'status', 'cancelled', 'cancel: on-hold -> cancelled');
select throws_ok($$select cancel_booking(pg_temp.tok('MG-REJE-CTD2'))$$, 'P0001', 'INVALID_TRANSITION', 'cancel twice -> INVALID_TRANSITION');
select is(((reschedule_booking((select j->>'manage_token' from r1), pg_temp.at(14, '16:00')))->>'starts_at')::timestamptz, pg_temp.at(14, '16:00'), 'reschedule: moved to open slot');
select throws_ok($$select reschedule_booking((select j->>'manage_token' from r1), pg_temp.at(22, '10:15'))$$, 'P0001', 'SLOT_TAKEN', 'reschedule: taken slot -> SLOT_TAKEN');

-- privileges
select ok(bool_and(has_function_privilege('anon', f, 'execute')), 'anon can execute the 7 customer RPCs') from unnest(array[
  'public.available_slots(text,date,text)', 'public.reserve_slot(text,text,timestamptz,jsonb)', 'public.submit_payment(text,text,text,text)',
  'public.get_booking(text)', 'public.find_booking(text,text)', 'public.cancel_booking(text)', 'public.reschedule_booking(text,timestamptz)']) f;
select ok(not has_function_privilege('anon', 'public.assert_slot_open(text,text,timestamptz,uuid)', 'execute')
      and not has_table_privilege('anon', 'public.rate_limits', 'select')
      and not has_table_privilege('anon', 'public.consultant_branches', 'select'), 'helpers and tables private to anon');

select * from finish();
rollback;
