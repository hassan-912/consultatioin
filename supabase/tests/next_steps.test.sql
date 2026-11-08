-- 0037: next step after a consultation (contract / refund / thinking), finance's list, follow-ups, admin free slots.
begin;
set local search_path = public, extensions;
select plan(15);

create function pg_temp.q(r text, uid uuid, sql text) returns text language plpgsql as $$
declare res text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', r)::text, true);
  perform set_config('role', r, true);
  begin execute sql into res; res := coalesce(nullif(res, ''), 'OK');
  exception when others then res := 'ERR:' || sqlstate || ':' || sqlerrm; end;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  return res;
end $$;

insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-0000-0000-0000000000f1', 'gamal@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000f2', 'salama@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000f3', 'fin3@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000f4', 'boss3@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into staff_profiles (user_id, display_name, role, consultant_id, active) values
  ('00000000-0000-0000-0000-0000000000f1', 'Gamal T', 'consultant', 'mohamed-gamal', true),
  ('00000000-0000-0000-0000-0000000000f2', 'Salama T', 'consultant', 'ahmed-salama', true),
  ('00000000-0000-0000-0000-0000000000f3', 'Fin T', 'finance', null, true),
  ('00000000-0000-0000-0000-0000000000f4', 'Boss T', 'admin', null, true);
insert into public.bookings(id,reference,qr_token,manage_token,consultant_id,branch_id,format,starts_at,ends_at,tz,price_amount,
  customer_name,customer_phone,channel,lang,program,status,hold_expires_at)
values
  ('00000000-0000-0000-0000-0000000000a1','NS-1','qns1',lpad('1', 32, 'c'),'mohamed-gamal','nasr-city','online',now() - interval '2 hours',now() - interval '75 minutes','Africa/Cairo',1000,'Sara','+201001234567','whatsapp','ar','tourism','completed',null),
  ('00000000-0000-0000-0000-0000000000a2','NS-2','qns2',lpad('2', 32, 'c'),'mohamed-gamal','nasr-city','online',now() - interval '3 hours',now() - interval '135 minutes','Africa/Cairo',1000,'Omar','+201001234568','whatsapp','en','tourism','completed',null),
  ('00000000-0000-0000-0000-0000000000a3','NS-3','qns3',lpad('3', 32, 'c'),'mohamed-gamal','nasr-city','online',now() + interval '700 days',now() + interval '700 days 45 minutes','Africa/Cairo',1000,'Laila','+201001234569','whatsapp','ar','tourism','confirmed',null);
insert into public.consultation_records (booking_id, notes, outcome) values ('00000000-0000-0000-0000-0000000000a1', 'Private note', 'none');

-- Recording the next step
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000f1',
  $q$select (public.save_next_step('00000000-0000-0000-0000-0000000000a1', 'contract', 'immigration'))->>'recommended_program'$q$), 'immigration',
  'the consultant records a contract and recommends a different program');
select is((select notes from consultation_records where booking_id = '00000000-0000-0000-0000-0000000000a1'), 'Private note', 'notes are untouched');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000f1',
  $q$select (public.save_next_step('00000000-0000-0000-0000-0000000000a2', 'thinking', null))->>'recommended_program'$q$), 'tourism',
  'no program chosen keeps the one the client booked');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000f2',
  $q$select public.save_next_step('00000000-0000-0000-0000-0000000000a1', 'refund', null)::text$q$), 'ERR:P0001:FORBIDDEN',
  'another consultant cannot set it');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000f3',
  $q$select public.save_next_step('00000000-0000-0000-0000-0000000000a1', 'refund', null)::text$q$), 'ERR:P0001:FORBIDDEN',
  'nor can finance');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000f1',
  $q$select public.save_next_step('00000000-0000-0000-0000-0000000000a3', 'contract', null)::text$q$), 'ERR:P0001:INVALID_TRANSITION',
  'only after the consultation');

-- Finance sees contract/refund only, without notes
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000f3', $q$select string_agg(reference || ' ' || next_step, ',') from public.finance_next_steps()$q$),
  'NS-1 contract', 'finance sees the contract, not the "thinking" client');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000f3', 'select count(*)::text from consultation_records'), '0', 'finance still cannot read consultation records (notes)');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000f1', 'select count(*)::text from public.finance_next_steps()'), 'ERR:P0001:FORBIDDEN', 'consultants cannot read the finance list');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000f3', $q$select public.finance_mark_handled('00000000-0000-0000-0000-0000000000a1')::text$q$), 'OK', 'finance marks it handled');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000f3', 'select handled_at is not null from public.finance_next_steps()'), 'true', 'and it shows as handled');

-- Follow-ups
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000f2', $q$select public.mark_followed_up('00000000-0000-0000-0000-0000000000a2')::text$q$), 'ERR:P0001:FORBIDDEN', 'only the client''s consultant marks the follow-up');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000f1', $q$select public.mark_followed_up('00000000-0000-0000-0000-0000000000a2')::text$q$), 'OK', 'the consultant marks it followed up');

-- Admin free slots
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000f3', 'select count(*)::text from public.staff_free_slots(current_date + 3, 7)'), 'ERR:P0001:FORBIDDEN', 'free-slot list is admin-only');
select ok(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000f4',
  $q$select (count(*) filter (where extract(minute from starts_at) <> 0) = 0 and count(*) > 0)::text from public.staff_free_slots(current_date + 3, 7)$q$) = 'true',
  'the admin gets every consultant''s free times, all on the hour');

select * from finish();
rollback;
