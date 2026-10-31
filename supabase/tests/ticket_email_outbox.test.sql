begin;
set local search_path = public, extensions;
select plan(31);

create table pg_temp.ids(k text, v uuid);
create function pg_temp.id(k text) returns uuid language sql as $$ select v from pg_temp.ids where ids.k = $1 $$;
create function pg_temp.mk(n int, ch text, st booking_status, email text) returns uuid language sql as $$
  insert into public.bookings(reference,qr_token,manage_token,consultant_id,branch_id,format,starts_at,ends_at,tz,price_amount,
    customer_name,customer_phone,customer_email,channel,lang,status,hold_expires_at)
  values ('OB-'||n,'qob'||n,'mob'||n,'outbox-consultant-'||n,'nasr-city','in-person',
    now() + make_interval(days => 300+n), now() + make_interval(days => 300+n, mins => 30),
    'Africa/Cairo',1000,'Sara <b>','+201001234567',email,ch,'ar',st,now()+interval '1 day')
  returning id
$$;
create function pg_temp.call(role_name text, sql text) returns text language plpgsql as $$
declare r text;
begin
  perform set_config('role', role_name, true);
  begin execute sql into r; r := coalesce(nullif(r, ''), 'OK');
  exception when others then r := 'ERR:' || sqlstate || ':' || sqlerrm; end;
  perform set_config('role', 'none', true);
  return r;
end $$;

insert into pg_temp.ids select 'email_id', pg_temp.mk(1,'email','on-hold','a@example.com');
insert into pg_temp.ids select 'wa_id', pg_temp.mk(2,'whatsapp','on-hold',null);
insert into pg_temp.ids select 'reserved_id', pg_temp.mk(3,'email','reserved','c@example.com');
insert into pg_temp.ids select 'blank_id', pg_temp.mk(4,'email','on-hold','  ');

select is((select count(*)::int from ticket_email_outbox), 0, 'nothing is enqueued before confirmation');
select public.apply_transition(pg_temp.id('email_id'), 'verify', 'finance');
select public.apply_transition(pg_temp.id('wa_id'), 'verify', 'finance');
select public.apply_transition(pg_temp.id('blank_id'), 'verify', 'finance');
select is((select count(*)::int from ticket_email_outbox where booking_id = pg_temp.id('email_id')), 1, 'confirmed + email enqueues once');
select is((select count(*)::int from ticket_email_outbox where booking_id = pg_temp.id('wa_id')), 0, 'confirmed whatsapp does not enqueue');
select is((select count(*)::int from ticket_email_outbox where booking_id = pg_temp.id('reserved_id')), 0, 'unconfirmed email booking does not enqueue');
select is((select count(*)::int from ticket_email_outbox where booking_id = pg_temp.id('blank_id')), 0, 'blank email address does not enqueue');
select is((select status || '/' || attempt_count from ticket_email_outbox where booking_id = pg_temp.id('email_id')), 'pending/0', 'new row is pending with no attempts');

update bookings set status = 'confirmed' where id = pg_temp.id('email_id');
select is((select count(*)::int from ticket_email_outbox where booking_id = pg_temp.id('email_id')), 1, 'repeated status writes do not enqueue again');
select throws_ok(format($$insert into ticket_email_outbox(booking_id) values (%L)$$, pg_temp.id('email_id')), '23505', null, 'one outbox row per booking');
select throws_ok(format($$update ticket_email_outbox set status='sent' where booking_id=%L$$, pg_temp.id('email_id')), '23514', null, 'sent requires a timestamp');

-- API roles cannot touch the outbox or the worker RPCs.
select alike(pg_temp.call('anon', 'select count(*) from ticket_email_outbox'), 'ERR:42501:%', 'anon cannot read the outbox');
select alike(pg_temp.call('authenticated', 'select count(*) from ticket_email_outbox'), 'ERR:42501:%', 'authenticated cannot read the outbox');
select alike(pg_temp.call('anon', format($$insert into ticket_email_outbox(booking_id) values (%L)$$, pg_temp.id('reserved_id'))), 'ERR:42501:%', 'anon cannot insert');
select alike(pg_temp.call('authenticated', format($$insert into ticket_email_outbox(booking_id) values (%L)$$, pg_temp.id('reserved_id'))), 'ERR:42501:%', 'authenticated cannot insert');
select alike(pg_temp.call('authenticated', 'update ticket_email_outbox set status = ''sent'''), 'ERR:42501:%', 'authenticated cannot update');
select alike(pg_temp.call('authenticated', 'delete from ticket_email_outbox'), 'ERR:42501:%', 'authenticated cannot delete');
select alike(pg_temp.call('anon', 'select * from public.claim_ticket_emails(5, 60)'), 'ERR:42501:%', 'anon cannot claim');
select alike(pg_temp.call('authenticated', 'select * from public.claim_ticket_emails(5, 60)'), 'ERR:42501:%', 'authenticated cannot claim');
select alike(pg_temp.call('authenticated', format($$select public.complete_ticket_email(%L,'x')$$, gen_random_uuid())), 'ERR:42501:%', 'authenticated cannot complete');

-- Worker lifecycle (service role).
select is((select count(*)::int from public.claim_ticket_emails(10, 60)), 1, 'claim returns the due row (as owner)');
select is((select status || '/' || attempt_count from ticket_email_outbox where booking_id = pg_temp.id('email_id')), 'sending/1', 'claimed row is leased');
select is((select count(*)::int from public.claim_ticket_emails(10, 60)), 0, 'a leased row cannot be claimed twice');
select public.fail_ticket_email((select id from ticket_email_outbox where booking_id = pg_temp.id('email_id')), 'PROVIDER_5XX');
select is((select status || '/' || last_error_code from ticket_email_outbox where booking_id = pg_temp.id('email_id')), 'pending/PROVIDER_5XX', 'failure keeps the row pending with a safe code');
select is((select sent_at is null and (select ticket_sent_at from bookings where id = pg_temp.id('email_id')) is null from ticket_email_outbox where booking_id = pg_temp.id('email_id')), true, 'failure records no success timestamp');
update ticket_email_outbox set next_attempt_at = now() where booking_id = pg_temp.id('email_id');
select is((select count(*)::int from public.claim_ticket_emails(10, 60) where idempotency_key = 'ticket-email/' || (select id::text from ticket_email_outbox where booking_id = pg_temp.id('email_id'))), 1, 'retry reuses the same stable idempotency key');
select public.complete_ticket_email((select id from ticket_email_outbox where booking_id = pg_temp.id('email_id')), 'prov-1');
select is((select status from ticket_email_outbox where booking_id = pg_temp.id('email_id')) || '/' || (select ticket_sent_via from bookings where id = pg_temp.id('email_id')), 'sent/email', 'completion marks outbox sent and booking ticket sent via email');
select public.complete_ticket_email((select id from ticket_email_outbox where booking_id = pg_temp.id('email_id')), 'prov-2');
select public.fail_ticket_email((select id from ticket_email_outbox where booking_id = pg_temp.id('email_id')), 'LATE');
select is((select provider_message_id || '/' || status from ticket_email_outbox where booking_id = pg_temp.id('email_id')) || '/' || (select count(*)::int from audit_log where booking_id = pg_temp.id('email_id') and action = 'sent'), 'prov-1/sent/1', 'late completion or failure never changes a sent row; one audit row');

-- A booking cancelled before sending is parked, never emailed.
insert into pg_temp.ids select 'cancel_id', pg_temp.mk(6,'email','on-hold','f@example.com');
select public.apply_transition(pg_temp.id('cancel_id'), 'verify', 'finance');
select public.apply_transition(pg_temp.id('cancel_id'), 'cancel', 'finance');
select is((select count(*)::int from public.claim_ticket_emails(10, 60) where reference = 'OB-6'), 0, 'cancelled booking is not claimed');
select is((select status || '/' || last_error_code from ticket_email_outbox where booking_id = pg_temp.id('cancel_id')), 'failed/NOT_SENDABLE', 'cancelled booking row is parked as failed, kept');

-- Dispatcher: no-op without Vault config; posts with secret header when configured and work is due.
insert into pg_temp.ids select 'due_id', pg_temp.mk(5,'email','on-hold','e@example.com');
select public.apply_transition(pg_temp.id('due_id'), 'verify', 'finance');
select is(public.dispatch_ticket_emails(), 0, 'dispatcher does nothing without Vault configuration; rows stay pending');
select vault.create_secret('https://proj.example.co/', 'project_url');
select vault.create_secret('s3cret-test-only', 'ticket_email_webhook_secret');
select is(public.dispatch_ticket_emails(), 1, 'dispatcher posts when configured and work is due');
select is((select url || '|' || (headers->>'x-webhook-secret') from net.http_request_queue order by id desc limit 1), 'https://proj.example.co/functions/v1/send-ticket-email|s3cret-test-only', 'dispatch targets the function with the webhook secret header');

select * from finish();
rollback;
