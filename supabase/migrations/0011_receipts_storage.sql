-- Preserve counters: cleanup is a separately authorized operational action.
create or replace function public.hit_rate_limit(p_key text, p_max int, p_window interval)
returns void language plpgsql set search_path = '' as $$
declare c int;
begin
  insert into public.rate_limits as r (key, window_start, count) values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when r.window_start <= now() - p_window then 1 else r.count + 1 end,
    window_start = case when r.window_start <= now() - p_window then now() else r.window_start end
  returning count into c;
  if c > p_max then raise exception 'RATE_LIMITED'; end if;
end $$;
-- Private receipts: only the Edge Function signs uploads after a customer capability check.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf']);

create policy receipts_finance_read on storage.objects for select to authenticated
using (bucket_id = 'receipts' and (select public.current_staff_role()) in ('finance','admin'));
-- No INSERT/UPDATE/DELETE policies: customers only use signed upload tokens; no upsert.
create function public.create_receipt_upload(p_manage_token text, p_extension text default 'jpg')
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare b public.bookings;
begin
  perform public.assert_customer_access();
  b := public.booking_by_token(p_manage_token);
  if b.id is null then raise exception 'NOT_FOUND'; end if;
  if p_extension is null or p_extension not in ('jpg','png','webp','pdf') then raise exception 'INVALID_INPUT'; end if;
  if b.status = 'expired' or (b.status = 'reserved' and b.hold_expires_at <= now()) then raise exception 'HOLD_EXPIRED'; end if;
  if b.status not in ('reserved','rejected','wrong-amount','duplicate','late-transfer') then raise exception 'INVALID_TRANSITION'; end if;
  perform public.hit_rate_limit('receipt:' || b.id::text, 10, interval '10 minutes');
  return jsonb_build_object('booking_id', b.id, 'path', b.id::text || '/' || gen_random_uuid()::text || '.' || p_extension);
end $$;
revoke execute on function public.create_receipt_upload(text,text) from public, anon, authenticated, service_role;
grant execute on function public.create_receipt_upload(text,text) to anon, authenticated;
