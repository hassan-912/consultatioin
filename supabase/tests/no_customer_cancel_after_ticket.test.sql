-- 0047: the customer cannot cancel a confirmed booking; an on-hold one still can be.
begin;
set local search_path = public, extensions;
select plan(3);
insert into public.bookings(reference,qr_token,manage_token,consultant_id,branch_id,format,starts_at,ends_at,tz,price_amount,
  customer_name,customer_phone,channel,lang,status,hold_expires_at)
values
  ('NC-1','qnc1',lpad('1', 32, 'e'),'mohamed-gamal','nasr-city','online',now() + interval '720 days',now() + interval '720 days 30 minutes','Africa/Cairo',1000,'Sara','+201001234567','whatsapp','en','confirmed',now()),
  ('NC-2','qnc2',lpad('2', 32, 'e'),'mohamed-gamal','nasr-city','online',now() + interval '721 days',now() + interval '721 days 30 minutes','Africa/Cairo',1000,'Omar','+201001234568','whatsapp','en','on-hold',now() + interval '20 minutes');
select throws_ok(format('select public.cancel_booking(%L)', lpad('1', 32, 'e')), 'P0001', 'INVALID_TRANSITION', 'a confirmed booking cannot be cancelled by the customer');
select is((select status::text from bookings where reference = 'NC-1'), 'confirmed', 'and it stays confirmed');
select is((public.cancel_booking(lpad('2', 32, 'e')))->>'status', 'cancelled', 'a booking under review can still be cancelled');
select * from finish();
rollback;
