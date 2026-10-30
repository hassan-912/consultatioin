-- 0009_hide_booking_tokens (Task 4 review round 1).
-- A staff member who could read bookings.manage_token could call the customer RPCs (cancel_booking,
-- reschedule_booking) and bypass the staff role matrix with an unattributed 'customer' audit row.
-- Signed-in users now get SELECT on every bookings column except manage_token and qr_token:
--   * finance/admin fetch the manage link through staff_manage_token(booking_id) (needed for the WhatsApp ticket flow);
--   * reception never needs tokens: check_in looks qr_token / reference up server-side;
--   * staff_transition no longer echoes the tokens in its result.
-- Column privileges also apply to new columns: a column added to bookings later is NOT readable by staff until
-- granted explicitly.

revoke select on public.bookings from authenticated;
grant select (id, reference, consultant_id, branch_id, format, starts_at, ends_at, tz, price_amount, price_currency,
  customer_name, customer_phone, customer_email, channel, lang, program, note, status, hold_expires_at, reject_reason,
  meeting_url, checked_in_at, ticket_sent_at, ticket_sent_via, created_at, blocks_range)
  on public.bookings to authenticated;

create function public.staff_manage_token(p_booking_id uuid)
returns text language plpgsql stable security definer
set search_path = ''
as $$
declare t text;
begin
  if public.current_staff_role() is null or public.current_staff_role() not in ('finance','admin') then
    raise exception 'FORBIDDEN';
  end if;
  select manage_token into t from public.bookings where id = p_booking_id;
  if t is null then raise exception 'NOT_FOUND'; end if;
  return t;
end $$;
revoke execute on function public.staff_manage_token(uuid) from public, anon;
grant execute on function public.staff_manage_token(uuid) to authenticated, service_role;

-- Same as 0008, but the returned row omits manage_token and qr_token.
create or replace function public.staff_transition(p_booking_id uuid, p_event text, p_reason text default null)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  r public.staff_role := public.current_staff_role();
  b public.bookings;
  nb public.bookings;
  allowed boolean;
begin
  if r is null then raise exception 'FORBIDDEN'; end if;
  if p_event is null or p_event not in
      ('verify','reject','wrong-amount','duplicate','late','mark-sent','check-in','complete','no-show','cancel') then
    raise exception 'INVALID_INPUT' using detail = 'not a staff event: ' || coalesce(p_event, 'null');
  end if;
  if char_length(p_reason) > 300 then raise exception 'INVALID_INPUT' using detail = 'reason'; end if;

  select * into b from public.bookings where id = p_booking_id;
  if not found then
    if r = 'consultant' then raise exception 'FORBIDDEN'; end if;  -- don't reveal other consultants' ids
    raise exception 'NOT_FOUND';
  end if;

  allowed := case r
      when 'admin' then true
      when 'finance' then p_event in ('verify','reject','wrong-amount','duplicate','late','mark-sent')
      when 'reception' then p_event in ('check-in','no-show')
      when 'consultant' then p_event in ('complete','no-show') and b.consultant_id = public.current_consultant_id()
    end;
  if not coalesce(allowed, false) then raise exception 'FORBIDDEN'; end if;

  nb := public.apply_transition(b.id, p_event, r::text, auth.uid(), p_reason);

  if p_event in ('verify','reject','wrong-amount','duplicate') then
    update public.payments set decided_by = auth.uid(), decided_at = now(), decision = p_event
    where id = (select p.id from public.payments p where p.booking_id = b.id
                order by p.submitted_at desc, p.created_at desc limit 1);
  end if;
  return to_jsonb(nb) - 'manage_token' - 'qr_token';
end $$;
