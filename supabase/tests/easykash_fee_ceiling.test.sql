-- 0046: price plus up to 5% (or 15 EGP) confirms; anything below the price or above the ceiling is flagged.
begin;
set local search_path = public, extensions;
select plan(4);

create function pg_temp.paid(ref text, cref text, amount text) returns text language sql as $$
  select public.record_easykash_callback(jsonb_build_object('easykashRef', ref, 'customerReference', cref, 'Amount', amount, 'status', 'PAID'))::text
$$;
insert into public.bookings(reference,qr_token,manage_token,consultant_id,branch_id,format,starts_at,ends_at,tz,price_amount,
  customer_name,customer_phone,customer_email,channel,lang,status,hold_expires_at)
values
  ('FC-1','qfc1',lpad('1', 32, 'f'),'mohamed-gamal','nasr-city','online',now() + interval '710 days',now() + interval '710 days 30 minutes','Africa/Cairo',1000,'Sara','+201001234567',null,'whatsapp','en','reserved',now() + interval '20 minutes'),
  ('FC-2','qfc2',lpad('2', 32, 'f'),'mohamed-gamal','nasr-city','online',now() + interval '711 days',now() + interval '711 days 30 minutes','Africa/Cairo',1000,'Omar','+201001234568',null,'whatsapp','en','reserved',now() + interval '20 minutes'),
  ('FC-3','qfc3',lpad('3', 32, 'f'),'mohamed-gamal','nasr-city','online',now() + interval '712 days',now() + interval '712 days 30 minutes','Africa/Cairo',1000,'Nour','+201001234569',null,'whatsapp','en','reserved',now() + interval '20 minutes'),
  ('FC-4','qfc4',lpad('4', 32, 'f'),'mohamed-gamal','nasr-city','online',now() + interval '713 days',now() + interval '713 days 30 minutes','Africa/Cairo',1000,'Ali','+201001234570',null,'whatsapp','en','reserved',now() + interval '20 minutes');
do $d$ begin
  perform public.start_easykash_attempt(lpad('1', 32, 'f'), 'EGP', 1); perform public.start_easykash_attempt(lpad('2', 32, 'f'), 'EGP', 1);
  perform public.start_easykash_attempt(lpad('3', 32, 'f'), 'EGP', 1); perform public.start_easykash_attempt(lpad('4', 32, 'f'), 'EGP', 1);
  perform pg_temp.paid('FCR-1', 'FC-1-1', '1034.00'); perform pg_temp.paid('FCR-2', 'FC-2-1', '1050.00');
  perform pg_temp.paid('FCR-3', 'FC-3-1', '1051.00'); perform pg_temp.paid('FCR-4', 'FC-4-1', '999.00');
end $d$;

select is(public.apply_easykash_payment('FCR-1'), 'confirmed', 'a Meeza payment of 1,034 for 1,000 confirms');
select is(public.apply_easykash_payment('FCR-2'), 'confirmed', '1,050 (price + 5%) confirms');
select is(public.apply_easykash_payment('FCR-3'), 'wrong-amount', '1,051 is over the ceiling and goes to finance');
select is(public.apply_easykash_payment('FCR-4'), 'wrong-amount', 'less than the price goes to finance');

select * from finish();
rollback;
