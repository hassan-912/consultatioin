-- 0017_staff_queue_ticket_email: finance/admin may choose email delivery for any confirmed booking that has an email
-- address, whatever channel the customer preferred. Confirmed email-channel bookings are still enqueued automatically
-- (0016); this only adds a manual path and lets the worker send for WhatsApp-channel bookings too.
create function public.staff_queue_ticket_email(p_booking_id uuid)
returns text language plpgsql volatile security definer
set search_path = ''
as $$
declare b public.bookings; o public.ticket_email_outbox;
begin
  if public.current_staff_role() is null or public.current_staff_role() not in ('finance','admin') then
    raise exception 'FORBIDDEN';
  end if;
  select * into b from public.bookings where id = p_booking_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if b.status <> 'confirmed' then raise exception 'INVALID_TRANSITION'; end if;
  if nullif(btrim(coalesce(b.customer_email, '')), '') is null then raise exception 'INVALID_INPUT' using detail = 'email'; end if;

  insert into public.ticket_email_outbox (booking_id) values (b.id) on conflict (booking_id) do nothing returning * into o;
  if found then
    insert into public.audit_log(actor_user, actor_kind, booking_id, action, from_value, to_value)
    values (auth.uid(), public.current_staff_role()::text, b.id, 'email-queued', b.channel, 'email');
    return 'pending';
  end if;
  select * into o from public.ticket_email_outbox where booking_id = b.id for update;
  -- A parked row (provider rejected it, or it was not sendable earlier) is retried from scratch on request.
  if o.status = 'failed' then
    update public.ticket_email_outbox
    set status = 'pending', attempt_count = 0, next_attempt_at = now(), locked_until = null, last_error_code = null, updated_at = now()
    where id = o.id;
    insert into public.audit_log(actor_user, actor_kind, booking_id, action, from_value, to_value)
    values (auth.uid(), public.current_staff_role()::text, b.id, 'email-queued', 'failed', 'email');
    return 'pending';
  end if;
  return o.status;
end $$;
revoke execute on function public.staff_queue_ticket_email(uuid) from public, anon;
grant execute on function public.staff_queue_ticket_email(uuid) to authenticated, service_role;

-- Worker: any confirmed booking with an email address is sendable (no longer only channel = 'email').
create or replace function public.claim_ticket_emails(p_limit int default 10, p_lease_seconds int default 120)
returns table (
  outbox_id uuid, idempotency_key text, attempt_count int, reference text, manage_token text,
  customer_name text, customer_email text, lang text, starts_at timestamptz, tz text, format text)
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.ticket_email_outbox o
  set status = 'failed', last_error_code = 'NOT_SENDABLE', locked_until = null, updated_at = now()
  from public.bookings b
  where b.id = o.booking_id and o.status in ('pending','sending')
    and not (b.status = 'confirmed' and nullif(btrim(coalesce(b.customer_email, '')), '') is not null);
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
  where b.status = 'confirmed' and nullif(btrim(coalesce(b.customer_email, '')), '') is not null;
end $$;
revoke execute on function public.claim_ticket_emails(int, int) from public, anon, authenticated;
grant execute on function public.claim_ticket_emails(int, int) to service_role;
