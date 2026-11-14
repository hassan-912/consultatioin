-- 0045_consultant_assessment: the consultant (not the customer) fills in the client's assessment; the client reads
-- their own through their manage link; the consultant sends that link on WhatsApp once (first send is stamped).
-- The readiness flow (0043) leaves the app: its public submit RPC is closed. No data is deleted.

-- The booking's own consultant, or an admin, saves (or updates) the assessment. Same validation as 0020 save_assessment.
create function public.staff_save_assessment(p_booking_id uuid, p_program text, p_answers jsonb)
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
  insert into public.audit_log(actor_user, actor_kind, booking_id, action, from_value, to_value)
  values (auth.uid(), case when v_admin then 'admin' else 'consultant' end, b.id, 'assessment-saved', null, p_program);
end $$;
revoke execute on function public.staff_save_assessment(uuid, text, jsonb) from public, anon;
grant execute on function public.staff_save_assessment(uuid, text, jsonb) to authenticated, service_role;

-- The client's own assessment, through their manage link, or null.
create function public.get_my_assessment(p_manage_token text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare b public.bookings; a public.booking_assessments;
begin
  perform public.assert_customer_access();
  b := public.booking_by_token(p_manage_token);
  if b.id is null then raise exception 'NOT_FOUND'; end if;
  select * into a from public.booking_assessments where booking_id = b.id;
  if not found then return null; end if;
  return jsonb_build_object('program', a.program, 'answers', a.answers);
end $$;
revoke execute on function public.get_my_assessment(text) from public, anon, authenticated, service_role;
grant execute on function public.get_my_assessment(text) to anon, authenticated;

-- First WhatsApp send of the assessment link: stamped once, audited once.
alter table public.bookings add column assessment_sent_at timestamptz;

create function public.staff_mark_assessment_sent(p_booking_id uuid)
returns timestamptz language plpgsql volatile security definer set search_path = ''
as $$
declare b public.bookings; v_admin boolean := public.current_staff_role() is not distinct from 'admin';
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not v_admin and (public.current_consultant_id() is null or b.id is null or b.consultant_id is distinct from public.current_consultant_id()) then
    raise exception 'FORBIDDEN';
  end if;
  if b.id is null then raise exception 'NOT_FOUND'; end if;
  if b.assessment_sent_at is not null then return b.assessment_sent_at; end if;
  update public.bookings set assessment_sent_at = now() where id = b.id;
  insert into public.audit_log(actor_user, actor_kind, booking_id, action, from_value, to_value)
  values (auth.uid(), case when v_admin then 'admin' else 'consultant' end, b.id, 'assessment-sent', null, 'whatsapp');
  return now();
end $$;
revoke execute on function public.staff_mark_assessment_sent(uuid) from public, anon;
grant execute on function public.staff_mark_assessment_sent(uuid) to authenticated, service_role;

-- The readiness flow is gone from the app; nobody may file new requests. Existing rows stay.
revoke execute on function public.submit_readiness_request(jsonb) from public, anon, authenticated;
