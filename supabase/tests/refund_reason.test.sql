-- 0042: a refund needs a written reason; finance sees it with the salesperson and the fee paid.
begin;
set local search_path = public, extensions;
select plan(8);

create function pg_temp.q(r text, uid uuid, sql text) returns text language plpgsql as $f$
declare res text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', r)::text, true);
  perform set_config('role', r, true);
  begin execute sql into res; res := coalesce(nullif(res, ''), 'OK');
  exception when others then res := 'ERR:' || sqlstate || ':' || sqlerrm; end;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  return res;
end $f$;

insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'gamal7@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000e3', 'fin7@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into staff_profiles (user_id, display_name, role, consultant_id, active) values
  ('00000000-0000-0000-0000-0000000000e1', 'Gamal Seven', 'consultant', 'mohamed-gamal', true),
  ('00000000-0000-0000-0000-0000000000e3', 'Fin Seven', 'finance', null, true);
insert into public.bookings(id,reference,qr_token,manage_token,consultant_id,branch_id,format,starts_at,ends_at,tz,price_amount,
  customer_name,customer_phone,channel,lang,program,status,hold_expires_at,sales_name)
values ('00000000-0000-0000-0000-0000000000b7','RF-1','qrf1',lpad('7', 32, 'c'),'mohamed-gamal','nasr-city','online',now() - interval '6 hours',now() - interval '315 minutes','Africa/Cairo',1500,'Mona','+201001234570','whatsapp','ar','tourism','completed',null,'Youssef Sales');

select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000e1',
  $q$select public.save_next_step('00000000-0000-0000-0000-0000000000b7', 'refund', null)::text$q$), 'ERR:P0001:INVALID_INPUT', 'a refund without a reason is refused');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000e1',
  $q$select public.save_next_step('00000000-0000-0000-0000-0000000000b7', 'refund', null, '   ')::text$q$), 'ERR:P0001:INVALID_INPUT', 'blank does not count');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000e1',
  format($q$select public.save_next_step('00000000-0000-0000-0000-0000000000b7', 'refund', null, %L)::text$q$, repeat('x', 501))), 'ERR:P0001:INVALID_INPUT', 'at most 500 characters');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000e1',
  $q$select (public.save_next_step('00000000-0000-0000-0000-0000000000b7', 'refund', null, ' Budget is too low for tourism '))->>'refund_reason'$q$),
  'Budget is too low for tourism', 'the consultant saves the refund with a reason');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000e3',
  $q$select concat_ws(' | ', reference, next_step, sales_name, refund_reason, price_amount::int::text, price_currency) from public.finance_next_steps() where reference = 'RF-1'$q$),
  'RF-1 | refund | Youssef Sales | Budget is too low for tourism | 1500 | EGP', 'finance sees the salesperson, the reason and the fee paid');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000e1',
  $q$select coalesce((public.save_next_step('00000000-0000-0000-0000-0000000000b7', 'contract', null, 'ignored'))->>'refund_reason', 'none')$q$),
  'none', 'switching to a contract clears the reason');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000e1',
  $q$select (public.save_next_step('00000000-0000-0000-0000-0000000000b7', 'thinking', 'education'))->>'next_step'$q$), 'thinking', 'other steps still need no reason');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000e1', 'select count(*)::text from public.finance_next_steps()'), 'ERR:P0001:FORBIDDEN', 'consultants still cannot read the finance list');

select * from finish();
rollback;
