-- 0042_refund_reason: when the consultant records "the client wants a refund" they must write the reason.
-- Finance sees it with the client's details, the salesperson and the consultation fee the client paid.
alter table public.consultation_records
  add column refund_reason text check (char_length(refund_reason) <= 500);

drop function public.save_next_step(uuid, text, text);
create function public.save_next_step(p_booking_id uuid, p_next_step text, p_program text, p_refund_reason text default null)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  r public.staff_role := public.current_staff_role();
  b public.bookings;
  rec public.consultation_records;
  v_program text := nullif(btrim(coalesce(p_program, '')), '');
  v_reason text := nullif(btrim(coalesce(p_refund_reason, '')), '');
begin
  if r is null or r not in ('admin','consultant') then raise exception 'FORBIDDEN'; end if;
  select * into b from public.bookings where id = p_booking_id;
  if not found or (r = 'consultant' and b.consultant_id is distinct from public.current_consultant_id()) then raise exception 'FORBIDDEN'; end if;
  if b.status not in ('checked-in','completed') then raise exception 'INVALID_TRANSITION'; end if;
  if p_next_step is null or p_next_step not in ('contract','refund','thinking') then raise exception 'INVALID_INPUT' using detail = 'next_step'; end if;
  if v_program is not null and v_program not in ('immigration','job-seeking','education','investment','tourism') then
    raise exception 'INVALID_INPUT' using detail = 'program';
  end if;
  -- A refund needs a written reason; other steps keep none.
  if p_next_step = 'refund' and (v_reason is null or char_length(v_reason) > 500) then
    raise exception 'INVALID_INPUT' using detail = 'refund_reason';
  end if;
  if p_next_step <> 'refund' then v_reason := null; end if;
  insert into public.consultation_records as c (booking_id, notes, outcome, updated_by, next_step, recommended_program, next_step_at, refund_reason)
  values (b.id, '', 'none', auth.uid(), p_next_step, coalesce(v_program, b.program), now(), v_reason)
  on conflict (booking_id) do update set
    next_step = excluded.next_step, recommended_program = excluded.recommended_program, updated_by = excluded.updated_by,
    refund_reason = excluded.refund_reason,
    -- A changed decision is new news for finance and restarts the follow-up.
    next_step_at = case when c.next_step is distinct from excluded.next_step then now() else c.next_step_at end,
    finance_handled_at = case when c.next_step is distinct from excluded.next_step then null else c.finance_handled_at end,
    finance_handled_by = case when c.next_step is distinct from excluded.next_step then null else c.finance_handled_by end,
    followed_up_at = case when c.next_step is distinct from excluded.next_step then null else c.followed_up_at end
  returning * into rec;
  insert into public.audit_log(actor_user, actor_kind, booking_id, action, from_value, to_value)
  values (auth.uid(), r::text, b.id, 'next-step', null, p_next_step || coalesce(':' || rec.recommended_program, ''));
  return to_jsonb(rec) - 'notes';
end $$;
revoke execute on function public.save_next_step(uuid, text, text, text) from public, anon;
grant execute on function public.save_next_step(uuid, text, text, text) to authenticated;

-- Finance or admin: contract and refund cases, now with the salesperson, the refund reason and the fee paid.
drop function public.finance_next_steps();
create function public.finance_next_steps()
returns table (booking_id uuid, reference text, customer_name text, customer_phone text, consultant_id text,
               next_step text, recommended_program text, next_step_at timestamptz, handled_at timestamptz,
               sales_name text, refund_reason text, price_amount numeric, price_currency text)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if public.current_staff_role() is null or public.current_staff_role() not in ('finance','admin') then raise exception 'FORBIDDEN'; end if;
  return query
    select b.id, b.reference, b.customer_name, b.customer_phone, b.consultant_id, c.next_step, c.recommended_program,
           c.next_step_at, c.finance_handled_at, b.sales_name, c.refund_reason, b.price_amount::numeric, b.price_currency
    from public.consultation_records c join public.bookings b on b.id = c.booking_id
    where c.next_step in ('contract','refund')
    order by c.finance_handled_at is not null, c.next_step_at desc;
end $$;
revoke execute on function public.finance_next_steps() from public, anon;
grant execute on function public.finance_next_steps() to authenticated;
