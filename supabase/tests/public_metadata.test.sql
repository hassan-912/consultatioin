begin;
select plan(14);
select has_function('public', 'public_consultant_metadata', array[]::text[]);
select is((select count(*) from public.public_consultant_metadata()), 7::bigint, 'metadata covers configured consultants');
select ok(not has_table_privilege('anon','public.bookings','select'), 'metadata grants no anonymous booking-table access');
select ok(has_function_privilege('anon','public.public_consultant_metadata()','execute'), 'anonymous metadata RPC allowed');

-- Append-only fixture in this rolled-back test transaction; never mutate an existing record.
insert into public.bookings(id, reference, qr_token, manage_token, consultant_id, branch_id, format, starts_at, ends_at, tz,
  price_amount, customer_name, customer_phone, channel, lang, status, hold_expires_at, meeting_url)
values ('f8000000-0000-0000-0000-000000000013','MG-META-TEST','meta-qr','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa13',
  'mohamed-gamal','nasr-city','online',date_trunc('month',now()) + interval '1 day 12 hours',
  date_trunc('month',now()) + interval '1 day 12 hours 30 minutes','Africa/Cairo',1000,'Metadata test','+201000000013',
  'whatsapp','en','completed',now() + interval '30 minutes','#/meet/prototype');
select is((select meeting_url from public.bookings where id='f8000000-0000-0000-0000-000000000013'), null::text, 'new fake meeting URL suppressed');
select is((select total from public.public_consultant_metadata() where consultant_id='mohamed-gamal'), 1::bigint, 'completed total comes only from database');
select is((select this_month from public.public_consultant_metadata() where consultant_id='mohamed-gamal'), 1::bigint, 'month uses consultant timezone');

update public.bookings set meeting_url='https://meet.example.com/real' where id='f8000000-0000-0000-0000-000000000013';
update public.bookings set meeting_url='#/meet/generated', status='confirmed' where id='f8000000-0000-0000-0000-000000000013';
select is((select meeting_url from public.bookings where id='f8000000-0000-0000-0000-000000000013'), 'https://meet.example.com/real', 'generated fake link preserves existing provider URL');
select is((select total from public.public_consultant_metadata() where consultant_id='mohamed-gamal'), 0::bigint, 'uncompleted booking not counted');
select throws_ok($$select public.reschedule_slots('invalid',current_date)$$, 'P0001','NOT_FOUND','reschedule exclusion requires valid capability');
select ok(has_function_privilege('anon','public.reschedule_slots(text,date)','execute'), 'reschedule availability callable through guarded RPC');
create temp table reschedule_day as
  select d::date as day, (public.available_slots('mohamed-gamal',d::date,'online'))[1] as starts_at
  from generate_series(current_date + interval '1 day', current_date + interval '14 days', interval '1 day') d
  where cardinality(public.available_slots('mohamed-gamal',d::date,'online')) > 0
    -- skip the day of the fixture booking above, which already uses that day's capacity
    and d::date <> (date_trunc('month',now()) + interval '1 day')::date limit 1;
update public.schedules set max_per_day=1 where consultant_id='mohamed-gamal';
create temp table reschedule_hold as select public.reserve_slot('mohamed-gamal','online',starts_at,
  '{"name":"Reschedule test","phone":"+201000000014","channel":"whatsapp","lang":"en"}'::jsonb) as booking from reschedule_day;
select is(cardinality(public.available_slots('mohamed-gamal',(select day from reschedule_day),'online')),0,'ordinary availability respects daily capacity');
select ok(cardinality(public.reschedule_slots((select booking->>'manage_token' from reschedule_hold),(select day from reschedule_day)))>1,'customer can reschedule their own booking on a full day');
select is((select (booking->>'booking_id')::uuid from reschedule_hold),
  (select id from public.bookings where manage_token=(select booking->>'manage_token' from reschedule_hold)), 'capability resolves exactly its own booking');
select * from finish();
rollback;
