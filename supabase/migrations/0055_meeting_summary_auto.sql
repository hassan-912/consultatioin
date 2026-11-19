-- 0055: the meeting summary no longer waits for the consultant. When the client leaves the room, the meeting-summary
-- edge function writes it from the transcript and publishes it at once. The consultant can still edit and republish.

-- Edge function only: the stored summary for a booking (draft or published), or null.
create function public.meeting_summary_get(p_booking_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare r public.meeting_summaries;
begin
  select * into r from public.meeting_summaries where booking_id = p_booking_id;
  if not found then return null; end if;
  return jsonb_build_object('summary', r.summary, 'status', r.status, 'generated_at', r.generated_at, 'published_at', r.published_at);
end $$;
revoke execute on function public.meeting_summary_get(uuid) from public, anon, authenticated;
grant execute on function public.meeting_summary_get(uuid) to service_role;

-- Edge function only: publish without a person. Never overwrites a summary that is already published (the
-- consultant's edited wording, or a second automatic run that lost the race); returns what is stored.
create function public.meeting_summary_publish_auto(p_booking_id uuid, p_summary jsonb)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare r public.meeting_summaries;
begin
  if not public.valid_meeting_summary(p_summary) then raise exception 'INVALID_INPUT'; end if;
  insert into public.meeting_summaries (booking_id, summary, status, published_at)
  values (p_booking_id, p_summary, 'published', now())
  on conflict (booking_id) do update set summary = excluded.summary, status = 'published', published_at = now(), published_by = null
    where public.meeting_summaries.status <> 'published';
  if found then
    insert into public.audit_log(actor_kind, booking_id, action, from_value, to_value)
    values ('system', p_booking_id, 'summary-published', null, 'auto');
  end if;
  select * into r from public.meeting_summaries where booking_id = p_booking_id;
  return jsonb_build_object('summary', r.summary, 'status', r.status, 'generated_at', r.generated_at, 'published_at', r.published_at);
end $$;
revoke execute on function public.meeting_summary_publish_auto(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.meeting_summary_publish_auto(uuid, jsonb) to service_role;
