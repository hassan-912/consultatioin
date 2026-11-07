-- 0031_easykash_background_check: EasyKash's callback URL stays on the main website (mg-visa.com), so this
-- system confirms payments itself. Every minute the database pokes easykash-pay, which asks EasyKash's Inquiry
-- API about attempts still waiting and settles any PAID one exactly as a callback would (apply_easykash_payment).
-- Covers customers who close the tab before returning. Reuses the ticket-email worker's Vault entries.
alter table public.easykash_attempts add column checked_at timestamptz;

-- Attempts worth asking about: started in the last 6 hours, not settled, at least 1 minute old (most customers
-- are still on EasyKash's page), checked at most every minute for the first hour and every 10 minutes after.
create function public.easykash_attempt_due(a public.easykash_attempts)
returns boolean language sql stable
set search_path = ''
as $$
  select a.status = 'started'
     and a.created_at > now() - interval '6 hours'
     and a.created_at <= now() - interval '1 minute'
     and (a.checked_at is null or a.checked_at <= now() - case when a.created_at > now() - interval '1 hour'
                                                              then interval '50 seconds' else interval '10 minutes' end)
$$;
revoke execute on function public.easykash_attempt_due(public.easykash_attempts) from public, anon, authenticated;

-- Service role only (easykash-pay background check): claims due attempts so overlapping runs don't repeat them.
create function public.claim_easykash_checks(p_limit int default 20)
returns text[] language plpgsql volatile security definer
set search_path = ''
as $$
declare refs text[];
begin
  with due as (
    select a.id from public.easykash_attempts a
    where public.easykash_attempt_due(a)
    order by a.created_at
    limit greatest(1, least(coalesce(p_limit, 20), 50))
    for update skip locked),
  marked as (
    update public.easykash_attempts a set checked_at = now() from due where a.id = due.id
    returning a.customer_reference)
  select coalesce(array_agg(customer_reference), '{}') into refs from marked;
  return refs;
end $$;
revoke execute on function public.claim_easykash_checks(int) from public, anon, authenticated;
grant execute on function public.claim_easykash_checks(int) to service_role;

-- Minute job: poke the function only when something is due.
create function public.dispatch_easykash_checks()
returns int language plpgsql security definer
set search_path = ''
as $$
declare base text; secret text;
begin
  if not exists (select 1 from public.easykash_attempts a where public.easykash_attempt_due(a)) then return 0; end if;
  select decrypted_secret into base from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'ticket_email_webhook_secret';
  if nullif(base, '') is null or nullif(secret, '') is null then return 0; end if;
  perform net.http_post(
    url := rtrim(base, '/') || '/functions/v1/easykash-pay',
    body := '{"action":"sweep"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', secret),
    timeout_milliseconds := 30000);
  return 1;
end $$;
revoke execute on function public.dispatch_easykash_checks() from public, anon, authenticated, service_role;

select cron.schedule('easykash-payment-checks', '* * * * *', 'select public.dispatch_easykash_checks();');
