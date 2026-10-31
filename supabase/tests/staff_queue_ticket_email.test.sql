-- 0017: finance/admin can choose email delivery for a confirmed booking; the worker sends for any channel with an email.
begin;
set local search_path = public, extensions;
select plan(14);

create function pg_temp.q(uid uuid, sql text) returns text language plpgsql as $$
declare r text;
begin
  if uid is null then
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    perform set_config('role', 'anon', true);
  else
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
  end if;
  begin execute sql into r; r := coalesce(nullif(r, ''), 'OK');
  exception when others then r := 'ERR:' || sqlstate || ':' || sqlerrm; end;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  return r;
end $$;
create table pg_temp.ids(k text, v uuid);
create function pg_temp.id(k text) returns uuid language sql as $$ select v from pg_temp.ids where ids.k = $1 $$;
create function pg_temp.mk(n int, ch text, st booking_status, email text) returns uuid language sql as $$
  insert into public.bookings(reference,qr_token,manage_token,consultant_id,branch_id,format,starts_at,ends_at,tz,price_amount,
    customer_name,customer_phone,customer_email,channel,lang,status,hold_expires_at)
  values ('SQ-'||n,'qsq'||n,'msq'||n,'mohamed-gamal','nasr-city','in-person',
    now() + make_interval(days => 400+n), now() + make_interval(days => 400+n, mins => 30),
    'Africa/Cairo',1000,'Sara','+201001234567',email,ch,'en',st,now()+interval '1 day')
  returning id
$$;

-- b1 finance, b2 admin, b3 reception
insert into auth.users (id, email, aud, role, instance_id)
select ('00000000-0000-0000-0000-0000000000b' || n)::uuid, 'sq-b' || n || '@test.local', 'authenticated', 'authenticated',
       '00000000-0000-0000-0000-000000000000'
from generate_series(1, 3) n;
insert into staff_profiles (user_id, display_name, role, consultant_id, active) values
  ('00000000-0000-0000-0000-0000000000b1', 'Finance', 'finance', null, true),
  ('00000000-0000-0000-0000-0000000000b2', 'Admin', 'admin', null, true),
  ('00000000-0000-0000-0000-0000000000b3', 'Reception', 'reception', null, true);

insert into pg_temp.ids select 'wa', pg_temp.mk(1, 'whatsapp', 'confirmed', 'wa@example.com');
insert into pg_temp.ids select 'noemail', pg_temp.mk(2, 'whatsapp', 'confirmed', null);
insert into pg_temp.ids select 'hold', pg_temp.mk(3, 'whatsapp', 'on-hold', 'h@example.com');
insert into pg_temp.ids select 'mail', pg_temp.mk(4, 'email', 'confirmed', 'm@example.com');

select is((select count(*)::int from ticket_email_outbox where booking_id = pg_temp.id('wa')), 0, 'whatsapp booking is not auto-enqueued');
select is(pg_temp.q(null, format('select public.staff_queue_ticket_email(%L)', pg_temp.id('wa'))) like 'ERR:42501:%', true, 'anon cannot queue');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000b3', format('select public.staff_queue_ticket_email(%L)', pg_temp.id('wa'))), 'ERR:P0001:FORBIDDEN', 'reception cannot queue');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000b1', format('select public.staff_queue_ticket_email(%L)', gen_random_uuid())), 'ERR:P0001:NOT_FOUND', 'unknown booking -> NOT_FOUND');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000b1', format('select public.staff_queue_ticket_email(%L)', pg_temp.id('hold'))), 'ERR:P0001:INVALID_TRANSITION', 'unconfirmed booking cannot be emailed');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000b1', format('select public.staff_queue_ticket_email(%L)', pg_temp.id('noemail'))), 'ERR:P0001:INVALID_INPUT', 'booking without email address is refused');

select is(pg_temp.q('00000000-0000-0000-0000-0000000000b1', format('select public.staff_queue_ticket_email(%L)', pg_temp.id('wa'))), 'pending', 'finance queues email for a whatsapp booking');
select is((select count(*)::int from audit_log where booking_id = pg_temp.id('wa') and action = 'email-queued'), 1, 'queueing is audited');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000b2', format('select public.staff_queue_ticket_email(%L)', pg_temp.id('wa'))), 'pending', 'admin re-queue is idempotent');
select is((select count(*)::int from ticket_email_outbox where booking_id = pg_temp.id('wa')), 1, 'still one outbox row');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000b1', format('select public.staff_queue_ticket_email(%L)', pg_temp.id('mail'))), 'pending', 'auto-enqueued email booking reports its current status');

select is((select count(*)::int from public.claim_ticket_emails(10, 60) c where c.reference = 'SQ-1'), 1, 'worker claims the whatsapp-channel booking');
update ticket_email_outbox set status = 'failed', locked_until = null where booking_id = pg_temp.id('wa');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000b1', format('select public.staff_queue_ticket_email(%L)', pg_temp.id('wa'))), 'pending', 'a failed row is retried on request');
select is((select status || '/' || attempt_count from ticket_email_outbox where booking_id = pg_temp.id('wa')), 'pending/0', 'retry resets attempts');

select * from finish();
rollback;
