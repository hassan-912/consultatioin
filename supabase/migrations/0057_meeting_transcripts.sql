-- 0057: the summary is made in three short steps, each its own run of the meeting-summary function (each run may
-- take at most 150 s on the free plan, and a 45-minute call does not fit in one):
--   1. Daily's webhook: download the call's audio and upload it to Gemini        status 'uploaded'
--   2. transcribe it (Gemini 3.5 Transcribe, or Flash listening as a fallback)    status 'transcribed'
--   3. Flash writes the summary from the transcript text and it is published     status 'summarized'
-- The transcript is kept (staff only): the consultant can read it, and "write it again" works from it without
-- sending the audio to Gemini a second time.

create table public.meeting_transcripts (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  -- The Daily recordings it was made from (ids, oldest first), so a repeated webhook does no work twice.
  source text not null,
  status text not null check (status in ('uploaded', 'transcribed', 'summarized', 'failed')),
  -- Gemini file names to delete once transcribed (Google keeps uploads 48 hours otherwise).
  files jsonb not null default '[]'::jsonb,
  audio_seconds int,
  transcript text check (char_length(transcript) <= 300000),
  model text,
  error text,
  updated_at timestamptz not null default now()
);
alter table public.meeting_transcripts enable row level security;
revoke all on public.meeting_transcripts from anon, authenticated;

-- Edge function only.
create function public.meeting_transcript_get(p_booking_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$ select to_jsonb(t) - 'booking_id' from public.meeting_transcripts t where t.booking_id = p_booking_id $$;
revoke execute on function public.meeting_transcript_get(uuid) from public, anon, authenticated;
grant execute on function public.meeting_transcript_get(uuid) to service_role;

-- Edge function only: set the fields present in p_patch, keep the others.
create function public.meeting_transcript_put(p_booking_id uuid, p_patch jsonb)
returns void language plpgsql volatile security definer set search_path = ''
as $$
begin
  insert into public.meeting_transcripts as t (booking_id, source, status, files, audio_seconds, transcript, model, error)
  values (p_booking_id, p_patch->>'source', p_patch->>'status', coalesce(p_patch->'files', '[]'::jsonb),
    (p_patch->>'audio_seconds')::int, p_patch->>'transcript', p_patch->>'model', p_patch->>'error')
  on conflict (booking_id) do update set
    source = coalesce(p_patch->>'source', t.source),
    status = coalesce(p_patch->>'status', t.status),
    files = coalesce(p_patch->'files', t.files),
    audio_seconds = case when p_patch ? 'audio_seconds' then (p_patch->>'audio_seconds')::int else t.audio_seconds end,
    transcript = case when p_patch ? 'transcript' then p_patch->>'transcript' else t.transcript end,
    model = case when p_patch ? 'model' then p_patch->>'model' else t.model end,
    error = case when p_patch ? 'error' then p_patch->>'error' else t.error end,
    updated_at = now();
end $$;
revoke execute on function public.meeting_transcript_put(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.meeting_transcript_put(uuid, jsonb) to service_role;

-- The booking's consultant (or an admin) reads the transcript. Clients never see it.
create function public.staff_meeting_transcript(p_booking_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare r public.meeting_transcripts;
begin
  perform public.assert_booking_staff(p_booking_id);
  select * into r from public.meeting_transcripts where booking_id = p_booking_id;
  if not found then return null; end if;
  return jsonb_build_object('transcript', r.transcript, 'status', r.status, 'model', r.model, 'updated_at', r.updated_at);
end $$;
revoke execute on function public.staff_meeting_transcript(uuid) from public, anon;
grant execute on function public.staff_meeting_transcript(uuid) to authenticated;
