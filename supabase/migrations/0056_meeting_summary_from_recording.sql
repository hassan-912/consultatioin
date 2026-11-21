-- 0056: the meeting summary is written from the call's audio recording. When Daily has the file ready it calls the
-- meeting-summary function once (webhook); Gemini listens to the call and writes transcript and summary together.
-- The summary remembers which recordings it came from, so a repeated webhook does not run the AI again, and a
-- second part of the call (the client left and came back) replaces an earlier automatic summary.
-- A summary a person published (the consultant's own wording) is never replaced automatically.

alter table public.meeting_summaries add column if not exists source text;

-- Edge function only: the booking behind a room, for the webhook (which has no signed-in user).
create function public.meeting_summary_booking(p_booking_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = p_booking_id;
  if b.id is null then return null; end if;
  return jsonb_build_object('id', b.id, 'reference', b.reference, 'name', b.customer_name, 'status', b.status,
    'format', b.format, 'starts_at', b.starts_at, 'ends_at', b.ends_at, 'lang', b.lang);
end $$;
revoke execute on function public.meeting_summary_booking(uuid) from public, anon, authenticated;
grant execute on function public.meeting_summary_booking(uuid) to service_role;

create or replace function public.meeting_summary_get(p_booking_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare r public.meeting_summaries;
begin
  select * into r from public.meeting_summaries where booking_id = p_booking_id;
  if not found then return null; end if;
  return jsonb_build_object('summary', r.summary, 'status', r.status, 'generated_at', r.generated_at, 'published_at', r.published_at,
    'source', r.source, 'by_consultant', r.published_by is not null);
end $$;

drop function public.meeting_summary_save_draft(uuid, jsonb);
create function public.meeting_summary_save_draft(p_booking_id uuid, p_summary jsonb, p_source text default null)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare r public.meeting_summaries;
begin
  if not public.valid_meeting_summary(p_summary) then raise exception 'INVALID_INPUT'; end if;
  insert into public.meeting_summaries (booking_id, summary, source) values (p_booking_id, p_summary, p_source)
  on conflict (booking_id) do update set summary = excluded.summary, source = excluded.source, status = 'draft',
    generated_at = now(), published_at = null, published_by = null
  returning * into r;
  return jsonb_build_object('summary', r.summary, 'status', r.status, 'generated_at', r.generated_at, 'published_at', r.published_at);
end $$;
revoke execute on function public.meeting_summary_save_draft(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.meeting_summary_save_draft(uuid, jsonb, text) to service_role;

drop function public.meeting_summary_publish_auto(uuid, jsonb);
create function public.meeting_summary_publish_auto(p_booking_id uuid, p_summary jsonb, p_source text default null)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare r public.meeting_summaries;
begin
  if not public.valid_meeting_summary(p_summary) then raise exception 'INVALID_INPUT'; end if;
  insert into public.meeting_summaries (booking_id, summary, source, status, published_at)
  values (p_booking_id, p_summary, p_source, 'published', now())
  on conflict (booking_id) do update set summary = excluded.summary, source = excluded.source, status = 'published',
    published_at = now(), published_by = null
    -- Not over a person's published wording.
    where public.meeting_summaries.published_by is null;
  if found then
    insert into public.audit_log(actor_kind, booking_id, action, from_value, to_value)
    values ('system', p_booking_id, 'summary-published', null, 'auto');
  end if;
  select * into r from public.meeting_summaries where booking_id = p_booking_id;
  return jsonb_build_object('summary', r.summary, 'status', r.status, 'generated_at', r.generated_at, 'published_at', r.published_at,
    'source', r.source, 'by_consultant', r.published_by is not null);
end $$;
revoke execute on function public.meeting_summary_publish_auto(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.meeting_summary_publish_auto(uuid, jsonb, text) to service_role;
