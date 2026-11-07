-- 0029/0030: EasyKash attempts open only for live holds; a signed PAID callback confirms its booking once.
begin;
set local search_path = public, extensions;
select plan(20);

create function pg_temp.q(r text, sql text) returns text language plpgsql as $$
declare res text;
begin
  perform set_config('role', r, true);
  begin execute sql into res; res := coalesce(nullif(res, ''), 'OK');
  exception when others then res := 'ERR:' || sqlstate || ':' || sqlerrm; end;
  perform set_config('role', 'none', true);
  return res;
end $$;
-- A verified callback as the webhook would record it.
create function pg_temp.paid(ref text, cref text, amount text) returns text language sql as $$
  select public.record_easykash_callback(jsonb_build_object('easykashRef', ref, 'customerReference', cref, 'Amount', amount, 'status', 'PAID'))::text
$$;

insert into public.bookings(reference,qr_token,manage_token,consultant_id,branch_id,format,starts_at,ends_at,tz,price_amount,
  customer_name,customer_phone,customer_email,channel,lang,status,hold_expires_at)
values
  ('EK-1','qek1',lpad('1', 32, 'a'),'mohamed-gamal','nasr-city','online',now() + interval '700 days',now() + interval '700 days 30 minutes','Africa/Cairo',1000,'Sara','+201001234567','s@e.com','whatsapp','en','reserved',now() + interval '20 minutes'),
  ('EK-2','qek2',lpad('2', 32, 'a'),'mohamed-gamal','nasr-city','online',now() + interval '701 days',now() + interval '701 days 30 minutes','Africa/Cairo',1000,'Omar','+447700900123',null,'whatsapp','en','reserved',now() + interval '20 minutes'),
  ('EK-3','qek3',lpad('3', 32, 'a'),'mohamed-gamal','nasr-city','online',now() + interval '702 days',now() + interval '702 days 30 minutes','Africa/Cairo',1000,'Nour','+201001234568',null,'whatsapp','en','reserved',now() - interval '1 minute'),
  ('EK-4','qek4',lpad('4', 32, 'a'),'mohamed-gamal','nasr-city','online',now() + interval '703 days',now() + interval '703 days 30 minutes','Africa/Cairo',1000,'Ali','+201001234569',null,'whatsapp','en','reserved',now() + interval '20 minutes');

-- Access
select is(pg_temp.q('anon', format('select public.start_easykash_attempt(%L, %L, 1)::text', lpad('1', 32, 'a'), 'EGP')) like 'ERR:42501:%', true, 'anon cannot open an attempt');
select is(pg_temp.q('anon', $q$select public.apply_easykash_payment('x')$q$) like 'ERR:42501:%', true, 'anon cannot settle a payment');
select is(pg_temp.q('anon', 'select count(*)::text from easykash_attempts') like 'ERR:42501:%', true, 'anon cannot read attempts');
select is(pg_temp.q('anon', format('select public.open_easykash_attempt(%L)', lpad('1', 32, 'a'))) like 'ERR:42501:%', true, 'anon cannot look up attempts');

-- Opening attempts
select is((public.start_easykash_attempt(lpad('1', 32, 'a'), 'EGP', 1))->>'amount', '1000', 'EGP amount is the booking price');
select ok((select hold_expires_at > now() + interval '30 minutes' from bookings where reference = 'EK-1'), 'first attempt adds 15 minutes to the hold');
select is((public.start_easykash_attempt(lpad('2', 32, 'a'), 'USD', 0.0201))->>'amount', '21', 'USD amount converted and rounded up');
select is((public.start_easykash_attempt(lpad('2', 32, 'a'), 'USD', 0.0201))->>'customer_reference', 'EK-2-2', 'each attempt gets its own reference');
select throws_ok(format('select public.start_easykash_attempt(%L, %L, 1)', lpad('3', 32, 'a'), 'EGP'), 'P0001', 'HOLD_EXPIRED', 'an elapsed hold cannot start a payment');
select throws_ok(format('select public.start_easykash_attempt(%L, %L, 5)', lpad('4', 32, 'a'), 'EUR'), 'P0001', 'INVALID_INPUT', 'an absurd rate is refused');
select throws_ok(format('select public.start_easykash_attempt(%L, %L, 1)', lpad('4', 32, 'a'), 'GBP'), 'P0001', 'INVALID_INPUT', 'only EGP/USD/EUR/AED');
select is(public.open_easykash_attempt(lpad('2', 32, 'a')), 'EK-2-2', 'the newest open attempt is the one checked');

-- Settling
do $d$ begin perform pg_temp.paid('EKR-1', 'EK-1-1', '1000.00'); end $d$;
select is(public.apply_easykash_payment('EKR-1'), 'confirmed', 'matching PAID callback confirms');
select is((select status::text from bookings where reference = 'EK-1'), 'confirmed', 'booking confirmed');
select is((select method || '|' || txn_ref from payments p join bookings b on b.id = p.booking_id where b.reference = 'EK-1'), 'easykash|EKR-1', 'payment recorded for finance');
select is(public.apply_easykash_payment('EKR-1'), 'duplicate', 'a repeated callback changes nothing');

-- EasyKash reporting the converted EGP amount for a USD attempt is accepted within 5%.
do $d$ begin perform pg_temp.paid('EKR-2', 'EK-2-2', '1032.50'); end $d$;
select is(public.apply_easykash_payment('EKR-2'), 'confirmed', 'USD attempt paid in EGP equivalent confirms');

-- Wrong amount goes to finance.
do $d$ begin perform public.start_easykash_attempt(lpad('4', 32, 'a'), 'EGP', 1); end $d$;
do $d$ begin perform pg_temp.paid('EKR-4', 'EK-4-1', '10.00'); end $d$;
select is(public.apply_easykash_payment('EKR-4'), 'wrong-amount', 'a short payment is flagged');
select is((select status::text from bookings where reference = 'EK-4'), 'wrong-amount', 'and lands in the finance queue');

-- A payment we never asked for is kept but touches no booking.
do $d$ begin perform pg_temp.paid('EKR-9', 'NOPE-1', '1000.00'); end $d$;
select is(public.apply_easykash_payment('EKR-9'), 'unmatched', 'unknown reference is not applied');

select * from finish();
rollback;
