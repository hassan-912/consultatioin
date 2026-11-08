-- 0040: anyone (signed out) can book the 5 EGP payment-test consultant, at 5 EGP.
begin;
set local search_path = public, extensions;
select plan(3);

create temp table t as select st from generate_series(1, 14) g
  cross join lateral public.schedule_slots('test-ek-q7m4x9', current_date + g, 'online') st order by st limit 1;
create function pg_temp.anon_book(st timestamptz) returns text language plpgsql as $$
declare res text;
begin
  perform set_config('role', 'anon', true);
  begin
    select (public.reserve_slot('test-ek-q7m4x9', 'online', st, '{"name":"Public Tester","phone":"+201000000077","channel":"whatsapp","lang":"ar"}'::jsonb))->>'reference' into res;
  exception when others then res := 'ERR:' || sqlstate || ':' || sqlerrm; end;
  perform set_config('role', 'none', true);
  return res;
end $$;
grant execute on function pg_temp.anon_book(timestamptz) to anon;

select is((select admin_only from consultant_branches where consultant_id = 'test-ek-q7m4x9'), false, 'not admin-only any more');
select is(pg_temp.anon_book((select st from t)) like 'MG-%', true, 'a signed-out customer books it without a key');
select is((select price_amount || ' ' || price_currency from bookings where customer_phone = '+201000000077' order by created_at desc limit 1), '5 EGP', 'at 5 EGP');

select * from finish();
rollback;
