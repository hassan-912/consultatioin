-- 0044: a review is public only once its own consultant approves it; others are refused.
begin;
set local search_path = public, extensions;
select plan(14);

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
  ('00000000-0000-0000-0000-0000000000e1', 'boss7@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000e2', 'gamal7@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000e3', 'salama7@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000e4', 'fin7@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000e5', 'rec7@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000e6', 'sales7@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into staff_profiles (user_id, display_name, role, consultant_id, active) values
  ('00000000-0000-0000-0000-0000000000e1', 'Boss Seven', 'admin', null, true),
  ('00000000-0000-0000-0000-0000000000e2', 'Gamal Seven', 'consultant', 'mohamed-gamal', true),
  ('00000000-0000-0000-0000-0000000000e3', 'Salama Seven', 'consultant', 'ahmed-salama', true),
  ('00000000-0000-0000-0000-0000000000e4', 'Fin Seven', 'finance', null, true),
  ('00000000-0000-0000-0000-0000000000e5', 'Rec Seven', 'reception', null, true),
  ('00000000-0000-0000-0000-0000000000e6', 'Sales Seven', 'sales', null, true);

-- A completed booking for mohamed-gamal, reviewed by the customer through the normal RPC.
insert into bookings(reference,qr_token,manage_token,consultant_id,branch_id,format,starts_at,ends_at,tz,price_amount,
  customer_name,customer_phone,channel,lang,status,hold_expires_at)
values ('RA-1','qra1','mra1','mohamed-gamal','nasr-city','in-person', now() - interval '300 days', now() - interval '300 days' + interval '30 minutes',
  'Africa/Cairo',1000,'Sara Ali','+201001234567','email','ar','completed', now());
-- The review row as submit_review (0018) writes it; the customer path itself is covered by its own tests.
insert into consultant_reviews (booking_id, consultant_id, rating, comment, reviewer_name)
select id, 'mohamed-gamal', 4, 'great', 'Sara' from bookings where reference = 'RA-1';
create temp table rv as select id from consultant_reviews where booking_id = (select id from bookings where reference = 'RA-1');
grant select on rv to authenticated, anon;
create function pg_temp.pub() returns text language sql as $$ select (public.public_consultant_reviews('mohamed-gamal')->>'count') $$;
create function pg_temp.set(uid uuid, st text) returns text language sql as $$
  select pg_temp.q('authenticated', uid, format('select public.consultant_set_review_status(%L, %L)::text', (select id from rv), st)) $$;
create temp table base as select pg_temp.pub()::int as n;

select is((select status::text from consultant_reviews where id = (select id from rv)), 'pending', 'a new review is pending');
select is(pg_temp.pub()::int, (select n from base), 'a pending review is not public');
select is(pg_temp.set('00000000-0000-0000-0000-0000000000e2', 'approved'), 'OK', 'its consultant approves it');
select is(pg_temp.pub()::int, (select n from base) + 1, 'an approved review is public');
select ok(exists(select 1 from audit_log where action = 'review-approved' and booking_id = (select id from bookings where reference='RA-1')), 'approval is audited');
select is(pg_temp.set('00000000-0000-0000-0000-0000000000e2', 'rejected'), 'OK', 'and can change their mind');
select is(pg_temp.pub()::int, (select n from base), 'a rejected review leaves the public count');
select is(pg_temp.set('00000000-0000-0000-0000-0000000000e3', 'approved'), 'ERR:P0001:FORBIDDEN', 'another consultant is refused');
select is(pg_temp.set('00000000-0000-0000-0000-0000000000e4', 'approved'), 'ERR:P0001:FORBIDDEN', 'finance is refused');
select is(pg_temp.set('00000000-0000-0000-0000-0000000000e5', 'approved'), 'ERR:P0001:FORBIDDEN', 'reception is refused');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000e6', $q$select public.consultant_my_reviews()::text$q$), 'ERR:P0001:FORBIDDEN', 'sales cannot list reviews');
select is(pg_temp.set('00000000-0000-0000-0000-0000000000e1', 'approved'), 'OK', 'admin may decide any review');
select ok(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000e2', $q$select public.consultant_my_reviews()::text$q$) like '%"booking_ref": "RA-1"%', 'the consultant lists their own review');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000e3',
  $q$select count(*)::text from jsonb_array_elements(public.consultant_my_reviews()) e where e->>'booking_ref' = 'RA-1'$q$), '0', 'another consultant does not see it');

select * from finish();
rollback;
