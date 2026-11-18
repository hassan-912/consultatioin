-- 0049: the sales manager sees every paid client (finance verified), whoever brought them in.
-- Other sales people keep seeing only the bookings made through their own link (0022); the app lists the paid ones.
-- Paid = confirmed, checked-in, completed or no-show. Keep in step with PAID_STATUSES in src/domain/bookingStatus.ts.
drop policy bookings_staff_read on public.bookings;
create policy bookings_staff_read on public.bookings for select to authenticated using (
  (select public.current_staff_role()) in ('admin','finance','reception')
  or consultant_id = (select public.current_consultant_id())
  or ((select public.current_staff_role()) = 'sales' and sales_user_id = (select auth.uid()))
  or ((select public.current_staff_role()) = 'sales' and (select public.is_sales_manager())
      and status in ('confirmed','checked-in','completed','no-show')));

-- The client no longer answers the assessment or the readiness check while booking: the consultant fills in the
-- assessment on the client's card (staff_save_assessment, 0045). Close the public entry points again; no data is deleted.
revoke execute on function public.submit_readiness_request(jsonb) from public, anon, authenticated;
revoke execute on function public.save_assessment(text, text, jsonb) from public, anon, authenticated;
