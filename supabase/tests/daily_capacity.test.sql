-- Daily capacity (schedules.max_per_day) is enforced on every operation that adds to a consultant/day.
-- Sequential single-session checks; the two-session race lives in scripts/concurrency-capacity.mjs.
begin;
set local search_path = public, extensions;
select plan(16);

insert into schedules (consultant_id, weekly, breaks, formats, max_per_day)
select 'mohamed-gamal', jsonb_object_agg(d::text, '[{"start":600,"end":1080}]'::jsonb), '[]', '{online,in-person}', 2
from generate_series(0, 6) d
on conflict (consultant_id) do update set weekly = excluded.weekly, breaks = excluded.breaks, formats = excluded.formats, max_per_day = excluded.max_per_day;
delete from schedule_exceptions where consultant_id = 'mohamed-gamal';
delete from rate_limits;

create function pg_temp.at(n int, hhmm text) returns timestamptz language sql as $$
  select ((now() at time zone 'Africa/Cairo')::date + n + hhmm::time) at time zone 'Africa/Cairo' $$;
create function pg_temp.det(phone text) returns jsonb language sql as $$
  select jsonb_build_object('name','Sara','phone',phone,'email','s@e.com','channel','email','lang','ar') $$;
create function pg_temp.reserve(n int, hhmm text, phone text default '+201001234567') returns jsonb language sql as $$
  select reserve_slot('mohamed-gamal', 'online', pg_temp.at(n, hhmm), pg_temp.det(phone)) $$;
create function pg_temp.mk(ref text, s timestamptz, st booking_status) returns uuid language sql as $$
  insert into bookings(reference,qr_token,manage_token,consultant_id,branch_id,format,starts_at,ends_at,tz,price_amount,
    customer_name,customer_phone,channel,lang,status,hold_expires_at)
  values (ref, md5('q'||ref), md5('m'||ref), 'mohamed-gamal','nasr-city','online', s, s + interval '30 minutes',
    'Africa/Cairo', 1000, 'T', '+201009999999', 'whatsapp', 'en', st, now() + interval '30 minutes')
  returning id $$;
create function pg_temp.st(ref text) returns text language sql as $$ select status::text from bookings where reference = ref $$;

-- reserve: third booking on a capacity-2 day is refused, a neighbouring day is unaffected
select lives_ok($$select pg_temp.reserve(20,'10:00')$$, 'reserve: 1st of 2');
select lives_ok($$select pg_temp.reserve(20,'12:00')$$, 'reserve: 2nd of 2');
select throws_ok($$select pg_temp.reserve(20,'15:00')$$, 'P0001', 'SLOT_TAKEN', 'reserve: 3rd refused (daily cap)');
select lives_ok($$select pg_temp.reserve(21,'15:00')$$, 'reserve: next day still open');

-- reschedule excludes the moved booking itself: same-day move on a full day is fine, moving onto a full day is not
select lives_ok($$select reschedule_booking((select manage_token from bookings where customer_phone='+201001234567' and starts_at = pg_temp.at(20,'10:00')), pg_temp.at(20,'16:00'))$$,
  'reschedule: same-day move on a full day does not count itself twice');
select throws_ok($$select reschedule_booking((select manage_token from bookings where starts_at = pg_temp.at(21,'15:00') and consultant_id='mohamed-gamal'), pg_temp.at(20,'10:00'))$$,
  'P0001', 'SLOT_TAKEN', 'reschedule: moving onto a full day refused');
select is((select count(*)::int from bookings where starts_at = pg_temp.at(21,'15:00')), 1, 'reschedule: refused move left the booking in place');

-- rejected resubmission (released -> blocking) re-checks the cap
select pg_temp.mk('CAP-A1', pg_temp.at(23,'10:00'), 'on-hold');
select pg_temp.mk('CAP-A2', pg_temp.at(23,'12:00'), 'confirmed');
select pg_temp.mk('CAP-R', pg_temp.at(23,'15:00'), 'rejected');
select throws_ok($$select submit_payment(md5('mCAP-R'), 'instapay', 'T-1')$$, 'P0001', 'SLOT_TAKEN', 'resubmit rejected: refused on a full day');
select is(pg_temp.st('CAP-R'), 'rejected', 'resubmit rejected: stays rejected');
update bookings set status = 'cancelled' where reference = 'CAP-A1';
select lives_ok($$select submit_payment(md5('mCAP-R'), 'instapay', 'T-2')$$, 'resubmit rejected: allowed once a place frees up');
select is(pg_temp.st('CAP-R'), 'on-hold', 'resubmit rejected: now on-hold');

-- late-transfer verification (released -> confirmed) re-checks the cap
select pg_temp.mk('CAP-B1', pg_temp.at(24,'10:00'), 'confirmed');
select pg_temp.mk('CAP-B2', pg_temp.at(24,'12:00'), 'on-hold');
select pg_temp.mk('CAP-L', pg_temp.at(24,'15:00'), 'late-transfer');
select throws_ok($$select apply_transition((select id from bookings where reference='CAP-L'), 'verify', 'staff')$$, 'P0001', 'SLOT_TAKEN', 'verify late-transfer: refused on a full day');
update bookings set status = 'cancelled' where reference = 'CAP-B2';
select lives_ok($$select apply_transition((select id from bookings where reference='CAP-L'), 'verify', 'staff')$$, 'verify late-transfer: allowed once a place frees up');

-- already-blocking transitions never count themselves: verify on a full day
select pg_temp.mk('CAP-C1', pg_temp.at(25,'10:00'), 'on-hold');
select pg_temp.mk('CAP-C2', pg_temp.at(25,'12:00'), 'on-hold');
select lives_ok($$select apply_transition((select id from bookings where reference='CAP-C1'), 'verify', 'staff')$$, 'verify on-hold: allowed on a full day (already counted)');

-- internal helpers stay private
select ok(not has_function_privilege('anon', 'public.lock_consultant_day(text, timestamptz)', 'EXECUTE'), 'anon cannot take day locks');
select ok(not has_function_privilege('authenticated', 'public.assert_daily_capacity(text, timestamptz, uuid)', 'EXECUTE'), 'authenticated cannot call capacity check');
select * from finish();
rollback;
