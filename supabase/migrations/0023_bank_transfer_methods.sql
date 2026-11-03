-- 0023_bank_transfer_methods: customers outside Egypt pay by bank transfer (AED at Mashreq Dubai, USD/EUR at
-- Banque du Caire). Only the accepted method list changes; everything else is 0010's submit_payment unchanged.
create or replace function public.submit_payment(p_manage_token text, p_method text, p_txn_ref text, p_receipt_path text default null)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  b public.bookings;
  v_txn text := btrim(public.normalize_digits(coalesce(p_txn_ref, '')));
begin
  perform public.assert_customer_access();
  select * into b from public.bookings where id = (public.booking_by_token(p_manage_token)).id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if b.status = 'on-hold' then return public.customer_view(b); end if;
  if b.status = 'expired' then raise exception 'HOLD_EXPIRED'; end if;

  if p_method is null or p_method not in ('instapay','vodafone-cash','bank-aed','bank-usd-eur') then raise exception 'INVALID_INPUT' using detail = 'method'; end if;
  if v_txn = '' or char_length(v_txn) > 100 then raise exception 'INVALID_INPUT' using detail = 'txn_ref'; end if;
  if p_receipt_path is not null and (char_length(p_receipt_path) > 200
      or p_receipt_path !~ ('^(receipts/)?' || b.id::text || '/[A-Za-z0-9._-]+$')) then
    raise exception 'INVALID_INPUT' using detail = 'receipt_path';
  end if;

  b := public.apply_transition(b.id, 'submit-payment', 'customer');
  insert into public.payments(booking_id, method, txn_ref, receipt_path) values (b.id, p_method, v_txn, p_receipt_path);
  return public.customer_view(b);
end $$;
