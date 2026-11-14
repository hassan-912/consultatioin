-- 0047_no_customer_cancel_after_ticket: once a booking is confirmed (the ticket is issued) the customer can no
-- longer cancel it from their link. Staff can still cancel through apply_transition. Otherwise as in 0010.
create or replace function public.cancel_booking(p_manage_token text)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare b public.bookings;
begin
  perform public.assert_customer_access();
  b := public.booking_by_token(p_manage_token);
  if b.id is null then raise exception 'NOT_FOUND'; end if;
  if b.status = 'confirmed' then raise exception 'INVALID_TRANSITION' using detail = 'ticket-issued'; end if;
  return public.customer_view(public.apply_transition(b.id, 'cancel', 'customer'));
end $$;
