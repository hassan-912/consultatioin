-- 0023: bank transfer methods are accepted; anything else is still refused.
begin;
set local search_path = public, extensions;
select plan(4);
insert into public.bookings(reference,qr_token,manage_token,consultant_id,branch_id,format,starts_at,ends_at,tz,price_amount,
  customer_name,customer_phone,channel,lang,status,hold_expires_at)
values
  ('BT-1','qbt1',lpad('1', 32, 'e'),'mohamed-abdelaziz','dubai','online',now() + interval '600 days',now() + interval '600 days 30 minutes','Asia/Dubai',1000,'Layla','+971501234567','whatsapp','en','reserved',now() + interval '1 hour'),
  ('BT-2','qbt2',lpad('2', 32, 'e'),'mohamed-abdelaziz','dubai','online',now() + interval '601 days',now() + interval '601 days 30 minutes','Asia/Dubai',1000,'Omar','+447700900123','whatsapp','en','reserved',now() + interval '1 hour'),
  ('BT-3','qbt3',lpad('3', 32, 'e'),'mohamed-abdelaziz','dubai','online',now() + interval '602 days',now() + interval '602 days 30 minutes','Asia/Dubai',1000,'Nour','+201001234567','whatsapp','en','reserved',now() + interval '1 hour');
select is((public.submit_payment(lpad('1', 32, 'e'), 'bank-aed', 'MASHREQ-778812'))->>'status', 'on-hold', 'AED bank transfer accepted');
select is((public.submit_payment(lpad('2', 32, 'e'), 'bank-usd-eur', 'BDC-99812'))->>'status', 'on-hold', 'USD/EUR bank transfer accepted');
select is((select method from payments p join bookings b on b.id = p.booking_id where b.reference = 'BT-1'), 'bank-aed', 'method recorded for finance');
select throws_ok(format('select public.submit_payment(%L, %L, %L)', lpad('3', 32, 'e'), 'paypal', 'X-12345'), 'P0001', 'INVALID_INPUT', 'unknown method refused');
select * from finish();
rollback;
