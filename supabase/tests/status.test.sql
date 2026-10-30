-- Mirrors src/domain/bookingStatus.test.ts (transition + checkInVerdict + store-action audit cases) one-to-one.
begin;
set local search_path = public, extensions;
select plan(32);

-- n = day offset so blocking rows never overlap; hold_min = hold deadline relative to now().
create function pg_temp.mk(n int, st booking_status, fmt booking_format default 'in-person', hold_min int default 30)
returns uuid language sql as $$
  insert into public.bookings(reference,qr_token,manage_token,consultant_id,branch_id,format,starts_at,ends_at,tz,price_amount,
    customer_name,customer_phone,channel,lang,status,hold_expires_at)
  values ('ST-'||n,'qst'||n,'mst'||n,'mohamed-gamal','nasr-city',fmt,
    date_trunc('hour', now()) + make_interval(days => 100 + n),
    date_trunc('hour', now()) + make_interval(days => 100 + n, mins => 30),
    'Africa/Cairo',1000,'Sara','+201001234567','email','ar',st, now() + make_interval(mins => hold_min))
  returning id
$$;
create function pg_temp.st(id uuid) returns text language sql as $$ select status::text from public.bookings where id = $1 $$;

-- transition: happy path
select pg_temp.mk(1, 'reserved');
select is((select status::text from apply_transition((select id from bookings where reference='ST-1'), 'submit-payment', 'customer')), 'on-hold', 'happy: submit-payment -> on-hold');
select is((select status::text from apply_transition((select id from bookings where reference='ST-1'), 'verify', 'finance')), 'confirmed', 'happy: verify -> confirmed');
select is((select status::text from apply_transition((select id from bookings where reference='ST-1'), 'check-in', 'reception')), 'checked-in', 'happy: check-in -> checked-in');
select is((select checked_in_at from bookings where reference='ST-1'), now(), 'happy: checked_in_at = now');
select is((select status::text from apply_transition((select id from bookings where reference='ST-1'), 'complete', 'consultant')), 'completed', 'happy: complete -> completed');

-- payment after the deadline is refused
select pg_temp.mk(2, 'reserved', hold_min => -1);
select throws_ok($$select apply_transition((select id from bookings where reference='ST-2'), 'submit-payment', 'customer')$$,
  'P0001', 'HOLD_EXPIRED', 'payment after the deadline is refused');

-- expire only from reserved or rejected
select pg_temp.mk(3, 'reserved');
select is((select status::text from apply_transition((select id from bookings where reference='ST-3'), 'expire', 'system')), 'expired', 'expire from reserved');
select pg_temp.mk(4, 'on-hold');
select throws_ok($$select apply_transition((select id from bookings where reference='ST-4'), 'expire', 'system')$$,
  'P0001', 'INVALID_TRANSITION', 'expire from on-hold refused');

-- verify only from review states; late only from expired
select pg_temp.mk(5, 'reserved');
select throws_ok($$select apply_transition((select id from bookings where reference='ST-5'), 'verify', 'finance')$$,
  'P0001', 'INVALID_TRANSITION', 'verify from reserved refused');
select pg_temp.mk(6, 'expired');
select is((select status::text from apply_transition((select id from bookings where reference='ST-6'), 'late', 'finance')), 'late-transfer', 'late from expired');
select throws_ok($$select apply_transition((select id from bookings where reference='ST-4'), 'late', 'finance')$$,
  'P0001', 'INVALID_TRANSITION', 'late from on-hold refused');

-- check-in only once
select pg_temp.mk(7, 'checked-in');
select throws_ok($$select apply_transition((select id from bookings where reference='ST-7'), 'check-in', 'reception')$$,
  'P0001', 'INVALID_TRANSITION', 'check-in only once');

-- reject keeps reason; online verify creates private meeting link
select is((select reject_reason from apply_transition((select id from bookings where reference='ST-4'), 'reject', 'finance', null, 'No transfer found')),
  'No transfer found', 'reject keeps reason');
select pg_temp.mk(8, 'on-hold', 'online');
select matches((select meeting_url from apply_transition((select id from bookings where reference='ST-8'), 'verify', 'finance')),
  '/meet/[0-9a-f]{32}$', 'online verify creates private meeting link');

-- checkInVerdict (today = booking local date for the "ok" case)
select is(check_in_verdict(null, null, null, current_date), 'not-found', 'verdict: not-found');
select is(check_in_verdict('confirmed', '2026-11-02T10:00:00Z', 'Africa/Cairo', '2026-11-02'), 'ok', 'verdict: ok');
select is(check_in_verdict('on-hold', '2026-11-02T10:00:00Z', 'Africa/Cairo', '2026-11-02'), 'on-hold', 'verdict: on-hold');
select is(check_in_verdict('reserved', '2026-11-02T10:00:00Z', 'Africa/Cairo', '2026-11-02'), 'unpaid', 'verdict: unpaid');
select is(check_in_verdict('checked-in', '2026-11-02T10:00:00Z', 'Africa/Cairo', '2026-11-02'), 'already-used', 'verdict: already-used');
select is(check_in_verdict('cancelled', '2026-11-02T10:00:00Z', 'Africa/Cairo', '2026-11-02'), 'cancelled', 'verdict: cancelled');
select is(check_in_verdict('expired', '2026-11-02T10:00:00Z', 'Africa/Cairo', '2026-11-02'), 'expired', 'verdict: expired');
select is(check_in_verdict('confirmed', '2026-11-05T10:00:00Z', 'Africa/Cairo', '2026-11-02'), 'wrong-date', 'verdict: wrong-date');

-- store actions: applyEvent records actor in audit
select pg_temp.mk(9, 'on-hold');
select apply_transition((select id from bookings where reference='ST-9'), 'verify', 'finance');
select is((select row(actor_kind, action, from_value, to_value)::text from audit_log where booking_id = (select id from bookings where reference='ST-9')),
  row('finance','transition','on-hold','confirmed')::text, 'applyEvent records actor in audit');

-- extra SQL-side guarantees
select throws_ok($$select apply_transition(gen_random_uuid(), 'verify', 'finance')$$, 'P0001', 'NOT_FOUND', 'unknown booking');
select throws_ok($$select apply_transition((select id from bookings where reference='ST-9'), 'teleport', 'finance')$$, 'P0001', 'INVALID_INPUT', 'unknown event');
select apply_transition((select id from bookings where reference='ST-9'), 'mark-sent', 'finance', null, 'whatsapp');
select is((select ticket_sent_via from bookings where reference='ST-9'), 'whatsapp', 'mark-sent records channel, status unchanged');
-- late-transfer verify re-checks the released slot
select pg_temp.mk(10, 'late-transfer');
insert into bookings(reference,qr_token,manage_token,consultant_id,branch_id,format,starts_at,ends_at,tz,price_amount,customer_name,customer_phone,channel,lang,status)
select 'ST-10b','qst10b','mst10b',consultant_id,branch_id,format,starts_at + interval '15 minutes',ends_at + interval '15 minutes',tz,1000,'X','+201000000000','email','en','confirmed'
from bookings where reference='ST-10';
select throws_ok($$select apply_transition((select id from bookings where reference='ST-10'), 'verify', 'finance')$$,
  'P0001', 'SLOT_TAKEN', 'verify from late-transfer refused when slot re-booked');
-- a stale (deadline passed) hold does not block re-taking a released slot
select pg_temp.mk(11, 'late-transfer');
insert into bookings(reference,qr_token,manage_token,consultant_id,branch_id,format,starts_at,ends_at,tz,price_amount,customer_name,customer_phone,channel,lang,status,hold_expires_at)
select 'ST-11b','qst11b','mst11b',consultant_id,branch_id,format,starts_at,ends_at,tz,1000,'X','+201000000000','email','en','reserved', now() - interval '1 minute'
from bookings where reference='ST-11';
select is((select status::text from apply_transition((select id from bookings where reference='ST-11'), 'verify', 'finance')), 'confirmed', 'stale hold expired, late-transfer verified');
select is(pg_temp.st((select id from bookings where reference='ST-11b')), 'expired', 'stale hold flipped to expired');

select is(normalize_digits('٠١٢٣٤٥٦٧٨٩ ۰۱۲۳۴۵۶۷۸۹'), '0123456789 0123456789', 'normalize_digits');
select is(clean_phone('+٢٠ (100) 123-45.67'), '+201001234567', 'clean_phone');
select ok(not has_function_privilege('anon', 'public.apply_transition(uuid,text,text,uuid,text)', 'execute')
      and not has_function_privilege('authenticated', 'public.apply_transition(uuid,text,text,uuid,text)', 'execute'),
  'apply_transition not executable by anon/authenticated');

select * from finish();
rollback;
