-- 0028_easykash_callbacks: EasyKash calls our callback URL after each payment. The easykash-webhook Edge Function
-- checks the HMAC signature and keeps every verified callback here. Bookings are not changed yet: wiring a paid
-- callback to confirm its booking comes with the EasyKash payment option on the site.
create table public.easykash_callbacks (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  easykash_ref text not null unique,
  customer_reference text,
  product_code text,
  amount text,
  payment_method text,
  product_type text,
  status text,
  voucher text,
  payload jsonb not null
);
alter table public.easykash_callbacks enable row level security;
create policy easykash_callbacks_admin_read on public.easykash_callbacks for select to authenticated
using ((select public.current_staff_role()) = 'admin');
revoke all on public.easykash_callbacks from public, anon, authenticated;
grant select on public.easykash_callbacks to authenticated;

-- Service role only (the Edge Function). A repeated callback for the same payment is kept once.
create function public.record_easykash_callback(p_payload jsonb)
returns boolean language plpgsql volatile security definer
set search_path = ''
as $$
declare v_ref text := nullif(btrim(p_payload->>'easykashRef'), '');
begin
  if v_ref is null then raise exception 'INVALID_INPUT' using detail = 'easykashRef'; end if;
  insert into public.easykash_callbacks (easykash_ref, customer_reference, product_code, amount, payment_method, product_type, status, voucher, payload)
  values (v_ref, p_payload->>'customerReference', p_payload->>'ProductCode', p_payload->>'Amount', p_payload->>'PaymentMethod',
          p_payload->>'ProductType', p_payload->>'status', p_payload->>'voucher', p_payload)
  on conflict (easykash_ref) do nothing;
  return found;
end $$;
revoke execute on function public.record_easykash_callback(jsonb) from public, anon, authenticated;
grant execute on function public.record_easykash_callback(jsonb) to service_role;
