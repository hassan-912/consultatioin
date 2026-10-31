-- 0016_ticket_email_outbox: durable outbox for the customer ticket email (confirmed + channel=email only).
-- Rows are never deleted. A row is created exactly once per booking when it becomes confirmed; the
-- send-ticket-email Edge Function claims due rows, sends through the provider with a stable idempotency
-- key, and only then records sent_at. The outbox holds no customer data: the worker reads the booking.
create extension if not exists pg_net;
create extension if not exists supabase_vault;

create table public.ticket_email_outbox (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  attempt_count int not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error_code text check (last_error_code is null or last_error_code ~ '^[A-Z0-9_]{1,40}$'),
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ticket_outbox_sent_consistent check ((status = 'sent') = (sent_at is not null))
);
create index ticket_email_outbox_due_idx on public.ticket_email_outbox (next_attempt_at) where status in ('pending','sending');
alter table public.ticket_email_outbox enable row level security;
-- No policies: RLS denies everything to API roles; also remove table privileges Supabase grants by default.
revoke all on table public.ticket_email_outbox from public, anon, authenticated;

-- Enqueue on the transition to confirmed. ON CONFLICT makes re-delivery of the same transition a no-op.
create function public.enqueue_ticket_email()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  if new.status = 'confirmed' and new.channel = 'email' and nullif(btrim(coalesce(new.customer_email, '')), '') is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
    insert into public.ticket_email_outbox (booking_id) values (new.id) on conflict (booking_id) do nothing;
  end if;
  return null;
end $$;
revoke execute on function public.enqueue_ticket_email() from public, anon, authenticated, service_role;

create trigger bookings_enqueue_ticket_email
after insert or update of status on public.bookings
for each row execute function public.enqueue_ticket_email();

-- Worker RPCs: service_role only (called by the Edge Function after it verified its webhook secret).
-- Claim due rows under a lease so concurrent workers never take the same row; returns the data needed to
-- render one email. The Idempotency-Key is derived from the outbox id and is therefore stable across retries.
create function public.claim_ticket_emails(p_limit int default 10, p_lease_seconds int default 120)
returns table (
  outbox_id uuid, idempotency_key text, attempt_count int, reference text, manage_token text,
  customer_name text, customer_email text, lang text, starts_at timestamptz, tz text, format text)
language plpgsql security definer
set search_path = ''
as $$
begin
  -- A booking that is no longer confirmed (cancelled, ...) must not get a ticket: park the row as failed, keep history.
  update public.ticket_email_outbox o
  set status = 'failed', last_error_code = 'NOT_SENDABLE', locked_until = null, updated_at = now()
  from public.bookings b
  where b.id = o.booking_id and o.status in ('pending','sending') and not (b.status = 'confirmed' and b.channel = 'email');
  return query
  with due as (
    select o.id from public.ticket_email_outbox o
    where o.status in ('pending','sending') and o.next_attempt_at <= now()
      and (o.locked_until is null or o.locked_until <= now())
    order by o.next_attempt_at, o.id
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update skip locked
  ), claimed as (
    update public.ticket_email_outbox o
    set status = 'sending', attempt_count = o.attempt_count + 1,
        locked_until = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 900))),
        updated_at = now()
    from due where o.id = due.id
    returning o.*
  )
  select c.id, 'ticket-email/' || c.id::text, c.attempt_count, b.reference, b.manage_token,
         b.customer_name, b.customer_email, b.lang, b.starts_at, b.tz, b.format::text
  from claimed c join public.bookings b on b.id = c.booking_id
  where b.status = 'confirmed' and b.channel = 'email';
end $$;

-- Provider accepted the message: record it and mark the booking's ticket as sent by email (audited).
create function public.complete_ticket_email(p_outbox_id uuid, p_provider_message_id text default null)
returns void language plpgsql security definer
set search_path = ''
as $$
declare o public.ticket_email_outbox;
begin
  update public.ticket_email_outbox
  set status = 'sent', sent_at = now(), locked_until = null, last_error_code = null,
      provider_message_id = left(p_provider_message_id, 200), updated_at = now()
  where id = p_outbox_id and status <> 'sent'
  returning * into o;
  if not found then return; end if;
  update public.bookings set ticket_sent_at = now(), ticket_sent_via = 'email'
  where id = o.booking_id and ticket_sent_at is null;
  if found then
    insert into public.audit_log(actor_kind, booking_id, action, from_value, to_value)
    values ('system', o.booking_id, 'sent', 'confirmed', 'email');
  end if;
end $$;

-- Provider/network failure: keep the row, record a safe code, back off exponentially (1m,2m,4m... capped 6h).
-- Permanent failures (or too many attempts) move to 'failed' for staff follow-up; nothing is deleted.
create function public.fail_ticket_email(p_outbox_id uuid, p_error_code text, p_permanent boolean default false)
returns void language plpgsql security definer
set search_path = ''
as $$
begin
  update public.ticket_email_outbox o
  set status = case when p_permanent or o.attempt_count >= 8 then 'failed' else 'pending' end,
      last_error_code = case when p_error_code ~ '^[A-Z0-9_]{1,40}$' then p_error_code else 'UNKNOWN' end,
      next_attempt_at = now() + make_interval(secs => least(21600, 60 * power(2, greatest(o.attempt_count - 1, 0))::int)),
      locked_until = null, updated_at = now()
  where o.id = p_outbox_id and o.status <> 'sent';
end $$;

revoke execute on function public.claim_ticket_emails(int, int), public.complete_ticket_email(uuid, text),
  public.fail_ticket_email(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_ticket_emails(int, int), public.complete_ticket_email(uuid, text),
  public.fail_ticket_email(uuid, text, boolean) to service_role;

-- Poke the worker. Reads the project URL and webhook secret from Vault entries installed separately
-- ('project_url', 'ticket_email_webhook_secret'); with either missing it does nothing and rows stay pending.
create function public.dispatch_ticket_emails()
returns int language plpgsql security definer
set search_path = ''
as $$
declare base text; secret text;
begin
  if not exists (select 1 from public.ticket_email_outbox
                 where status in ('pending','sending') and next_attempt_at <= now()
                   and (locked_until is null or locked_until <= now())) then
    return 0;
  end if;
  select decrypted_secret into base from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'ticket_email_webhook_secret';
  if nullif(base, '') is null or nullif(secret, '') is null then return 0; end if;
  perform net.http_post(
    url := rtrim(base, '/') || '/functions/v1/send-ticket-email',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', secret),
    timeout_milliseconds := 5000);
  return 1;
end $$;
revoke execute on function public.dispatch_ticket_emails() from public, anon, authenticated, service_role;

select cron.schedule('dispatch-ticket-emails', '* * * * *', 'select public.dispatch_ticket_emails();');
