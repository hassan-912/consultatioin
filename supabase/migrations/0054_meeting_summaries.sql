-- 0054: after an online consultation, the client gets a written summary of the call (what was discussed, what was
-- agreed, what happens next). The meeting-summary edge function drafts it from the call's transcript; the booking's
-- consultant (or an admin) checks it and publishes it; only then can the client read it through their manage link.

create function public.valid_meeting_summary(s jsonb)
returns boolean language sql immutable set search_path = ''
as $$
  select s is not null and jsonb_typeof(s) = 'object' and octet_length(s::text) <= 16000
    and jsonb_typeof(s->'overview') = 'string' and char_length(s->>'overview') <= 2000
    and s->>'lang' in ('en', 'ar')
    and coalesce((select bool_and(jsonb_typeof(s->k) = 'array' and jsonb_array_length(s->k) <= 15
      and not exists (select 1 from jsonb_array_elements(s->k) e where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') > 500))
      from unnest(array['keyPoints', 'agreements', 'nextSteps']) k), false)
$$;

create table public.meeting_summaries (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  summary jsonb not null check (public.valid_meeting_summary(summary)),
  status text not null default 'draft' check (status in ('draft', 'published')),
  generated_at timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid
);
-- Reached only through the functions below.
alter table public.meeting_summaries enable row level security;
revoke all on public.meeting_summaries from anon, authenticated;

-- The booking's own consultant or an admin (the same rule as the assessment). Raises otherwise.
create function public.assert_booking_staff(p_booking_id uuid)
returns public.bookings language plpgsql stable security definer set search_path = ''
as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = p_booking_id;
  if public.current_staff_role() is distinct from 'admin'
     and (public.current_consultant_id() is null or b.id is null or b.consultant_id is distinct from public.current_consultant_id()) then
    raise exception 'FORBIDDEN';
  end if;
  if b.id is null then raise exception 'NOT_FOUND'; end if;
  return b;
end $$;
revoke execute on function public.assert_booking_staff(uuid) from public, anon, authenticated;

-- Edge function only: store a fresh draft. A new draft replaces an earlier draft or a published summary.
create function public.meeting_summary_save_draft(p_booking_id uuid, p_summary jsonb)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare r public.meeting_summaries;
begin
  if not public.valid_meeting_summary(p_summary) then raise exception 'INVALID_INPUT'; end if;
  insert into public.meeting_summaries (booking_id, summary) values (p_booking_id, p_summary)
  on conflict (booking_id) do update set summary = excluded.summary, status = 'draft', generated_at = now(), published_at = null, published_by = null
  returning * into r;
  return jsonb_build_object('summary', r.summary, 'status', r.status, 'generated_at', r.generated_at, 'published_at', r.published_at);
end $$;
revoke execute on function public.meeting_summary_save_draft(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.meeting_summary_save_draft(uuid, jsonb) to service_role;

create function public.staff_meeting_summary(p_booking_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare r public.meeting_summaries;
begin
  perform public.assert_booking_staff(p_booking_id);
  select * into r from public.meeting_summaries where booking_id = p_booking_id;
  if not found then return null; end if;
  return jsonb_build_object('summary', r.summary, 'status', r.status, 'generated_at', r.generated_at, 'published_at', r.published_at);
end $$;
revoke execute on function public.staff_meeting_summary(uuid) from public, anon;
grant execute on function public.staff_meeting_summary(uuid) to authenticated;

-- The consultant's checked (and possibly edited) wording becomes what the client sees.
create function public.staff_publish_meeting_summary(p_booking_id uuid, p_summary jsonb)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare b public.bookings; v_admin boolean := public.current_staff_role() is not distinct from 'admin';
begin
  b := public.assert_booking_staff(p_booking_id);
  if not public.valid_meeting_summary(p_summary) then raise exception 'INVALID_INPUT'; end if;
  insert into public.meeting_summaries (booking_id, summary, status, published_at, published_by)
  values (b.id, p_summary, 'published', now(), auth.uid())
  on conflict (booking_id) do update set summary = excluded.summary, status = 'published', published_at = now(), published_by = auth.uid();
  insert into public.audit_log(actor_user, actor_kind, booking_id, action, from_value, to_value)
  values (auth.uid(), case when v_admin then 'admin' else 'consultant' end, b.id, 'summary-published', null, null);
end $$;
revoke execute on function public.staff_publish_meeting_summary(uuid, jsonb) from public, anon;
grant execute on function public.staff_publish_meeting_summary(uuid, jsonb) to authenticated;

-- The client's summary through their manage link: published ones only, so drafts never leak.
create function public.get_my_meeting_summary(p_manage_token text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare b public.bookings; r public.meeting_summaries;
begin
  perform public.assert_customer_access();
  b := public.booking_by_token(p_manage_token);
  if b.id is null then raise exception 'NOT_FOUND'; end if;
  select * into r from public.meeting_summaries where booking_id = b.id and status = 'published';
  if not found then return null; end if;
  return r.summary;
end $$;
revoke execute on function public.get_my_meeting_summary(text) from public, anon, authenticated, service_role;
grant execute on function public.get_my_meeting_summary(text) to anon, authenticated;

-- In the video room the assessment saves itself a moment after every change, from either person. One audit line
-- per ten minutes per booking is enough to see who worked on it; the answers themselves are always saved.
create or replace function public.staff_save_assessment(p_booking_id uuid, p_program text, p_answers jsonb)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare b public.bookings; bad int; v_admin boolean := public.current_staff_role() is not distinct from 'admin';
begin
  select * into b from public.bookings where id = p_booking_id;
  if not v_admin and (public.current_consultant_id() is null or b.id is null or b.consultant_id is distinct from public.current_consultant_id()) then
    raise exception 'FORBIDDEN';
  end if;
  if b.id is null then raise exception 'NOT_FOUND'; end if;
  if p_program is null or p_program not in ('tourism', 'immigration', 'job-seeking') then raise exception 'INVALID_INPUT' using detail = 'program'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or octet_length(p_answers::text) > 8000 then raise exception 'INVALID_INPUT' using detail = 'answers'; end if;
  select count(*) into bad from jsonb_each(p_answers) e
  where e.key !~ '^[a-z][a-zA-Z0-9_]{0,40}$' or jsonb_typeof(e.value) <> 'string' or char_length(e.value #>> '{}') > 200;
  if bad > 0 then raise exception 'INVALID_INPUT' using detail = 'answers'; end if;
  insert into public.booking_assessments (booking_id, program, answers) values (b.id, p_program, p_answers)
  on conflict (booking_id) do update set program = excluded.program, answers = excluded.answers, updated_at = now();
  if not exists (select 1 from public.audit_log where booking_id = b.id and action = 'assessment-saved' and at > now() - interval '10 minutes') then
    insert into public.audit_log(actor_user, actor_kind, booking_id, action, from_value, to_value)
    values (auth.uid(), case when v_admin then 'admin' else 'consultant' end, b.id, 'assessment-saved', null, p_program);
  end if;
end $$;
