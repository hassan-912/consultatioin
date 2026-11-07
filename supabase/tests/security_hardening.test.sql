-- 0035: retired manual payments can't be faked; IP limits; the payment check is rate limited; test consultant off.
begin;
set local search_path = public, extensions;
select plan(9);

create function pg_temp.q(r text, sql text) returns text language plpgsql as $$
declare res text;
begin
  perform set_config('role', r, true);
  begin execute sql into res; res := coalesce(nullif(res, ''), 'OK');
  exception when others then res := 'ERR:' || sqlstate || ':' || sqlerrm; end;
  perform set_config('role', 'none', true);
  return res;
end $$;

insert into public.bookings(reference,qr_token,manage_token,consultant_id,branch_id,format,starts_at,ends_at,tz,price_amount,
  customer_name,customer_phone,channel,lang,status,hold_expires_at)
values ('SH-1','qsh1',lpad('1', 32, 'b'),'mohamed-gamal','nasr-city','online',now() + interval '710 days',now() + interval '710 days 30 minutes','Africa/Cairo',1000,'Sara','+201001234567','whatsapp','en','reserved',now() + interval '20 minutes');

-- Fake transactions
select is(pg_temp.q('anon', format($q$select public.submit_payment(%L, 'instapay', 'FAKE-1234')::text$q$, lpad('1', 32, 'b'))) like 'ERR:42501:%', true,
  'the public can no longer submit a made-up transaction number');
select is(pg_temp.q('authenticated', format($q$select public.submit_payment(%L, 'instapay', 'FAKE-1234')::text$q$, lpad('1', 32, 'b'))) like 'ERR:42501:%', true,
  'nor can a signed-in account');
select is(pg_temp.q('anon', format($q$select public.create_receipt_upload(%L, 'jpg')::text$q$, lpad('1', 32, 'b'))) like 'ERR:42501:%', true,
  'receipt uploads are closed too');
select is((select status::text from bookings where reference = 'SH-1'), 'reserved', 'the booking is untouched');
select is(pg_temp.q('anon', 'select public.request_ip()'), 'ERR:42501:permission denied for function request_ip', 'the IP helper is internal');

-- IP limit: simulate requests from one address
do $d$ begin perform set_config('request.headers', '{"cf-connecting-ip":"203.0.113.9"}', true); end $d$;
select is(public.request_ip(), '203.0.113.9', 'the client IP is read from the gateway header');
select throws_ok($q$select count(*) from generate_series(1, 31) g, lateral (select public.find_booking('MG-AAAA-' || lpad(g::text, 4, '0'), '+2010000' || lpad(g::text, 5, '0'))) f$q$,
  'P0001', 'RATE_LIMITED', 'one address cannot hammer booking lookups');

-- Payment-status check limit
select throws_ok(format($q$select count(*) from generate_series(1, 41) g, lateral (select public.open_easykash_attempt(%L || left(g::text, 0))) f$q$, lpad('1', 32, 'b')),
  'P0001', 'RATE_LIMITED', 'the EasyKash status check is rate limited per booking');

-- Test consultant switched off
select is((select weekly::text from schedules where consultant_id = 'test-ek-q7m4x9'), '{}', 'the 5 EGP test consultant has no bookable hours');

select * from finish();
rollback;
