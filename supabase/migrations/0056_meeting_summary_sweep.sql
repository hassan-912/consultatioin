-- 0056: the meeting summary is written by the server, not by whichever browser happens to stay open. A minute job
-- pokes the meeting-summary edge function ("sweep") while an online consultation has started and has no published
-- summary. The function asks Daily whether the transcript is finished; once it is, Gemini writes the summary and it is
-- published. Gemini is called once per consultation; a failure is retried at most three times, further apart each time,
-- so the free-tier quota (20 requests a day on Flash) is not burnt by retries.

create table public.meeting_summary_runs (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  failures int not null default 0,
  next_at timestamptz not null default now(),
  last_outcome text,
  updated_at timestamptz not null default now()
);
alter table public.meeting_summary_runs enable row level security;
revoke all on public.meeting_summary_runs from anon, authenticated;

-- Started, still within three hours of its end, nothing published, not given up on, and not leased to a running sweep.
create function public.meeting_summary_is_due(b public.bookings)
returns boolean language sql stable set search_path = ''
as $$
  select b.format = 'online' and b.status in ('checked-in', 'completed')
    and b.starts_at <= now() and now() < b.ends_at + interval '3 hours'
    and not exists (select 1 from public.meeting_summaries m where m.booking_id = b.id and m.status = 'published')
    and not exists (select 1 from public.meeting_summary_runs r where r.booking_id = b.id and (r.failures >= 3 or r.next_at > now()))
$$;
revoke execute on function public.meeting_summary_is_due(public.bookings) from public, anon, authenticated;

-- Edge function only: take up to p_limit due consultations, leasing each for 5 minutes so two sweeps never work on
-- the same one. Returns them in the shape the function's other actions use.
create function public.meeting_summary_claim(p_limit int default 5)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare picked jsonb;
begin
  with due as (
    select b.* from public.bookings b
    where b.format = 'online' and b.status in ('checked-in', 'completed') and b.starts_at <= now()
      and b.ends_at > now() - interval '3 hours' and public.meeting_summary_is_due(b)
    order by b.starts_at limit greatest(1, least(p_limit, 20))
  ), leased as (
    insert into public.meeting_summary_runs (booking_id, next_at, updated_at)
    select id, now() + interval '5 minutes', now() from due
    on conflict (booking_id) do update set next_at = excluded.next_at, updated_at = now()
    returning booking_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'reference', d.reference, 'name', d.customer_name, 'status', d.status,
    'format', d.format, 'starts_at', d.starts_at, 'ends_at', d.ends_at, 'lang', d.lang)), '[]'::jsonb)
  into picked from due d join leased l on l.booking_id = d.id;
  return picked;
end $$;
revoke execute on function public.meeting_summary_claim(int) from public, anon, authenticated;
grant execute on function public.meeting_summary_claim(int) to service_role;

-- Edge function only: what happened, and so when to look again.
--   pending      transcript not finished yet (or the call has not been transcribed yet): again in a minute
--   failed       Gemini or Daily failed: again in 5, 10 minutes, then give up (the consultant can still write it)
--   unavailable  nothing to summarize (wrong-language transcript, AI off): again in 30 minutes
--   published    done
create function public.meeting_summary_report(p_booking_id uuid, p_outcome text)
returns void language plpgsql volatile security definer set search_path = ''
as $$
begin
  if p_outcome not in ('pending', 'failed', 'unavailable', 'published') then raise exception 'INVALID_INPUT'; end if;
  insert into public.meeting_summary_runs (booking_id, failures, next_at, last_outcome, updated_at)
  values (p_booking_id, case when p_outcome = 'failed' then 1 else 0 end,
    now() + case p_outcome when 'failed' then interval '5 minutes' when 'unavailable' then interval '30 minutes' else interval '1 minute' end,
    p_outcome, now())
  on conflict (booking_id) do update set
    failures = public.meeting_summary_runs.failures + case when p_outcome = 'failed' then 1 else 0 end,
    next_at = now() + case p_outcome
      when 'failed' then interval '5 minutes' * (public.meeting_summary_runs.failures + 1)
      when 'unavailable' then interval '30 minutes' else interval '1 minute' end,
    last_outcome = p_outcome, updated_at = now();
end $$;
revoke execute on function public.meeting_summary_report(uuid, text) from public, anon, authenticated;
grant execute on function public.meeting_summary_report(uuid, text) to service_role;

-- Minute job: poke the function only when a consultation is due. Same Vault entries as the e-mail and payment jobs.
create function public.dispatch_meeting_summaries()
returns int language plpgsql security definer set search_path = ''
as $$
declare base text; secret text;
begin
  if not exists (select 1 from public.bookings b
                 where b.format = 'online' and b.status in ('checked-in', 'completed') and b.starts_at <= now()
                   and b.ends_at > now() - interval '3 hours' and public.meeting_summary_is_due(b)) then return 0; end if;
  select decrypted_secret into base from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'ticket_email_webhook_secret';
  if nullif(base, '') is null or nullif(secret, '') is null then return 0; end if;
  perform net.http_post(
    url := rtrim(base, '/') || '/functions/v1/meeting-summary',
    body := '{"action":"sweep"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', secret),
    timeout_milliseconds := 10000);
  return 1;
end $$;
revoke execute on function public.dispatch_meeting_summaries() from public, anon, authenticated, service_role;

select cron.schedule('meeting-summaries', '* * * * *', 'select public.dispatch_meeting_summaries();');
