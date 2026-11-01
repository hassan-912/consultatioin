-- 0020_booking_assessments: the customer's answers to the booking form's situation questions (MG Visa File
-- Strength Calculator). Customers can write them once per hold through save_assessment; they can never read
-- them back. Only admins and the booking's consultant can read them; the score is computed in the staff app.
create table public.booking_assessments (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  program text not null check (program in ('tourism', 'immigration', 'job-seeking')),
  answers jsonb not null check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 8000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.booking_assessments enable row level security;
revoke all on public.booking_assessments from anon, authenticated;
grant select on public.booking_assessments to authenticated;
create policy booking_assessments_staff_read on public.booking_assessments for select to authenticated using (
  (select public.current_staff_role()) = 'admin'
  or exists (select 1 from public.bookings b
             where b.id = booking_id and b.consultant_id = (select public.current_consultant_id())));

-- Manage-token capability only. Allowed while the booking is held or awaiting payment review, so the answers
-- arrive with the reservation; afterwards they are fixed.
create function public.save_assessment(p_manage_token text, p_program text, p_answers jsonb)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
declare b public.bookings; bad int;
begin
  perform public.assert_customer_access();
  b := public.booking_by_token(p_manage_token);
  if b.id is null then raise exception 'NOT_FOUND'; end if;
  perform public.hit_rate_limit('assessment:' || b.id::text, 20, interval '1 hour');
  if b.status not in ('reserved', 'on-hold') then raise exception 'INVALID_TRANSITION'; end if;
  if p_program is null or p_program not in ('tourism', 'immigration', 'job-seeking') then raise exception 'INVALID_INPUT' using detail = 'program'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or octet_length(p_answers::text) > 8000 then raise exception 'INVALID_INPUT' using detail = 'answers'; end if;
  -- Flat map of short strings with simple keys: nothing nested, nothing that could carry a payload.
  select count(*) into bad from jsonb_each(p_answers) e
  where e.key !~ '^[a-z][a-zA-Z0-9_]{0,40}$' or jsonb_typeof(e.value) <> 'string' or char_length(e.value #>> '{}') > 200;
  if bad > 0 then raise exception 'INVALID_INPUT' using detail = 'answers'; end if;
  insert into public.booking_assessments (booking_id, program, answers) values (b.id, p_program, p_answers)
  on conflict (booking_id) do update set program = excluded.program, answers = excluded.answers, updated_at = now();
end $$;
revoke execute on function public.save_assessment(text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_assessment(text, text, jsonb) to anon, authenticated;
