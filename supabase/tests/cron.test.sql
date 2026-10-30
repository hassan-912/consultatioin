-- Expiration behavior runs on real PostgreSQL. cron.job checks registration only;
-- the local harness has no background pg_cron worker.
begin;
set local search_path = public, extensions;
select plan(19);
insert into rate_limits(key,window_start,count) values ('cron-retained',now()-interval '1 year',3);

create function pg_temp.hold(n int, st booking_status, deadline timestamptz)
returns uuid language sql as $$
  insert into public.bookings(reference,qr_token,manage_token,consultant_id,branch_id,format,starts_at,ends_at,tz,price_amount,
    customer_name,customer_phone,channel,lang,status,hold_expires_at)
  values ('CR-'||n,'qcr'||n,'mcr'||n,'cron-consultant','nasr-city','in-person',
    now() + make_interval(days => 200+n), now() + make_interval(days => 200+n, mins => 30),
    'Africa/Cairo',1000,'Sara','+201001234567','email','ar',st,deadline)
  returning id
$$;
select pg_temp.hold(1,'reserved',now()-interval '1 minute');
select pg_temp.hold(2,'reserved',now());
select pg_temp.hold(3,'reserved',now()+interval '1 minute');
select pg_temp.hold(4,'reserved',null);
select pg_temp.hold(10+ordinality::int,st,now()-interval '1 minute')
from unnest(enum_range(null::booking_status)) with ordinality as s(st,ordinality) where st <> 'reserved';

select has_function('public','expire_due_holds',array[]::text[],'expiry function exists');
select is(public.expire_due_holds(),2,'only two due reserved holds expire, including exact deadline');
select is((select count(*)::int from bookings where reference in ('CR-1','CR-2') and status='expired'),2,'due holds become expired');
select is((select count(*)::int from bookings where reference in ('CR-3','CR-4') and status='reserved'),2,'future and null deadlines stay reserved');
select is((select count(*)::int from bookings b where reference like 'CR-%' and reference not in ('CR-1','CR-2','CR-3','CR-4')
  and status = (select st from unnest(enum_range(null::booking_status)) with ordinality s(st,n) where reference='CR-'||(10+n))),11,'all non-reserved statuses stay unchanged');
select is((select count(*)::int from audit_log a join bookings b on b.id=a.booking_id where b.reference in ('CR-1','CR-2')
  and actor_kind='system' and actor_user is null and action='transition' and from_value='reserved' and to_value='expired'),2,'status machine writes system transition audit');
select is(public.expire_due_holds(),0,'repeat invocation is idempotent');
select is((select count from rate_limits where key='cron-retained'),3,'old rate limit records are retained');
select is((select count(*)::int from audit_log a join bookings b on b.id=a.booking_id where b.reference like 'CR-%'),2,'only expired holds receive one audit each');
select lives_ok($$insert into bookings(reference,qr_token,manage_token,consultant_id,branch_id,format,starts_at,ends_at,tz,price_amount,
  customer_name,customer_phone,channel,lang,status,hold_expires_at)
  select 'CR-reused','qcr-reused','mcr-reused',consultant_id,branch_id,format,starts_at,ends_at,tz,price_amount,
    customer_name,customer_phone,channel,lang,'reserved',now()+interval '30 minutes' from bookings where reference='CR-1'$$,
  'expired slot can be reserved again through exclusion constraint');
select ok(not has_function_privilege('anon','public.expire_due_holds()','EXECUTE'),'anon cannot execute expiry');
select ok(not has_function_privilege('authenticated','public.expire_due_holds()','EXECUTE'),'authenticated cannot execute expiry');
select ok(not has_function_privilege('service_role','public.expire_due_holds()','EXECUTE'),'API service role cannot execute internal expiry');
select ok(not (select prosecdef from pg_proc where oid='public.expire_due_holds()'::regprocedure),'expiry uses scheduler owner privileges, no definer escalation');
select is((select count(*)::int from cron.job where jobname='expire-holds'),1,'one stable named job is registered');
select is((select schedule from cron.job where jobname='expire-holds'),'* * * * *','registered to run every minute');
select is((select command from cron.job where jobname='expire-holds'),'select public.expire_due_holds();','registered command invokes qualified expiry function');
select ok((select active from cron.job where jobname='expire-holds'),'registered job is active (registration check only)');
select is(cron.schedule('expire-holds','* * * * *','select public.expire_due_holds();'),
  (select jobid from cron.job where jobname='expire-holds'),'repeated named registration updates the same job');
select * from finish();
rollback;
