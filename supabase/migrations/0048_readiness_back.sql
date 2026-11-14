-- 0048: the readiness flow is back for clients who book on their own (0045 had closed it).
-- Clients sent by a salesperson skip it in the booking form; that choice lives in the browser, as the check does.

-- A client who isn't ready files a request for the sales manager again.
grant execute on function public.submit_readiness_request(jsonb) to anon, authenticated;

-- Customers write their answers once per booking. Consultants now fill in the assessment through
-- staff_save_assessment, so a customer may never overwrite it: a second save is refused.
create or replace function public.save_assessment(p_manage_token text, p_program text, p_answers jsonb)
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
  select count(*) into bad from jsonb_each(p_answers) e
  where e.key !~ '^[a-z][a-zA-Z0-9_]{0,40}$' or jsonb_typeof(e.value) <> 'string' or char_length(e.value #>> '{}') > 200;
  if bad > 0 then raise exception 'INVALID_INPUT' using detail = 'answers'; end if;
  insert into public.booking_assessments (booking_id, program, answers) values (b.id, p_program, p_answers)
  on conflict (booking_id) do nothing;
  if not found then raise exception 'ALREADY_EXISTS'; end if;
end $$;
revoke execute on function public.save_assessment(text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_assessment(text, text, jsonb) to anon, authenticated;

