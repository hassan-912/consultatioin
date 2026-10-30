begin;
set local search_path = public, extensions;
select plan(24);

select has_table('public', t, t || ' exists') from unnest(array[
  'staff_profiles','schedules','schedule_exceptions','bookings','payments','audit_log','consultation_records']) t;

select ok((select bool_and(relrowsecurity) from pg_class where relnamespace = 'public'::regnamespace and relname in
  ('staff_profiles','schedules','schedule_exceptions','bookings','payments','audit_log','consultation_records')),
  'RLS enabled on all tables');
select is((select count(*)::int from unnest(enum_range(null::booking_status))), 12, 'booking_status has 12 values');

create function pg_temp.mk(cid text, s text, e text, st booking_status, ref text, nt text default null, ch text default 'email', lg text default 'en')
returns void language sql as $$
  insert into public.bookings(reference,qr_token,manage_token,consultant_id,branch_id,format,starts_at,ends_at,tz,price_amount,
    customer_name,customer_phone,channel,lang,note,status)
  values (ref,'q'||ref,'m'||ref,cid,'nasr-city','online',s::timestamptz,e::timestamptz,'Africa/Cairo',1000,'T','+201000000000',ch,lg,nt,st)
$$;

select lives_ok($$select pg_temp.mk('c1','2030-01-01 10:00+00','2030-01-01 10:30+00','confirmed','R1')$$, 'insert first booking');
select throws_ok($$select pg_temp.mk('c1','2030-01-01 10:15+00','2030-01-01 10:45+00','reserved','R2')$$, '23P01', null, 'overlap rejected');
select throws_ok($$select pg_temp.mk('c1','2030-01-01 10:35+00','2030-01-01 11:05+00','reserved','R3')$$, '23P01', null, 'inside 10-min buffer rejected');
select lives_ok($$select pg_temp.mk('c1','2030-01-01 10:40+00','2030-01-01 11:10+00','reserved','R4')$$, 'starts exactly 10 min after previous ends: allowed');
select lives_ok($$select pg_temp.mk('c2','2030-01-01 10:00+00','2030-01-01 10:30+00','confirmed','R5')$$, 'other consultant allowed');
select lives_ok($$select pg_temp.mk('c1','2030-01-01 10:00+00','2030-01-01 10:30+00','expired','R6')$$, 'overlap allowed when new row expired');
select lives_ok($$select pg_temp.mk('c1','2030-01-01 10:00+00','2030-01-01 10:30+00','cancelled','R7')$$, 'overlap allowed when new row cancelled');
select lives_ok($$update public.bookings set status = 'cancelled' where reference = 'R1'$$, 'cancel first');
select lives_ok($$select pg_temp.mk('c1','2030-01-01 10:00+00','2030-01-01 10:30+00','on-hold','R8')$$, 'slot reusable after cancel');

select throws_ok($$select pg_temp.mk('c3','2030-02-01 10:30+00','2030-02-01 10:00+00','reserved','R9')$$, '23514', null, 'ends_at > starts_at');
select throws_ok($$select pg_temp.mk('c3','2030-02-01 10:00+00','2030-02-01 10:30+00','reserved','R10', repeat('x',301))$$, '23514', null, 'note <= 300');
select throws_ok($$select pg_temp.mk('c3','2030-02-01 10:00+00','2030-02-01 10:30+00','reserved','R11', null, 'sms')$$, '23514', null, 'channel enum');
select throws_ok($$select pg_temp.mk('c3','2030-02-01 10:00+00','2030-02-01 10:30+00','reserved','R12', null, 'email', 'fr')$$, '23514', null, 'lang enum');

create table public.zz_probe(id int);
create function public.zz_probe_fn() returns int language sql as $$ select 1 $$;
select ok(not has_table_privilege('anon', 'public.zz_probe', 'select'), 'anon has no default privilege on new tables');
select ok(not has_function_privilege('anon', 'public.zz_probe_fn()', 'execute'), 'anon has no default EXECUTE on new functions');

select * from finish();
rollback;
