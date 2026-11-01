-- 0019: only admins hide/restore reviews; hidden reviews leave the public summary.
begin;
set local search_path = public, extensions;
select plan(10);

create function pg_temp.q(uid uuid, sql text) returns text language plpgsql as $$
declare r text;
begin
  if uid is null then
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    perform set_config('role', 'anon', true);
  else
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
  end if;
  begin execute sql into r; r := coalesce(nullif(r, ''), 'OK');
  exception when others then r := 'ERR:' || sqlstate || ':' || sqlerrm; end;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  return r;
end $$;

insert into auth.users (id, email, aud, role, instance_id)
select ('00000000-0000-0000-0000-0000000000c' || n)::uuid, 'rm-c' || n || '@test.local', 'authenticated', 'authenticated',
       '00000000-0000-0000-0000-000000000000'
from generate_series(1, 2) n;
insert into staff_profiles (user_id, display_name, role, consultant_id, active) values
  ('00000000-0000-0000-0000-0000000000c1', 'Admin', 'admin', null, true),
  ('00000000-0000-0000-0000-0000000000c2', 'Finance', 'finance', null, true);

insert into public.bookings(reference,qr_token,manage_token,consultant_id,branch_id,format,starts_at,ends_at,tz,price_amount,
  customer_name,customer_phone,channel,lang,status,hold_expires_at)
values ('RM-1','qrm1',lpad('1', 32, 'd'),'mohamed-salah','sheikh-zayed','in-person',now() - interval '2 days',
  now() - interval '2 days' + interval '30 minutes','Africa/Cairo',1000,'Rude Person','+201001234567','whatsapp','en','completed',now());
select public.submit_review(lpad('1', 32, 'd'), 1, 'bad words');
create temp table rid as select id from consultant_reviews where comment = 'bad words';
grant select on rid to authenticated, anon;

select is((public.public_consultant_reviews('mohamed-salah')->>'count')::int, 1, 'review public before moderation');
select is(pg_temp.q(null, format('select public.staff_set_review_hidden(%L, true)', (select id from rid))) like 'ERR:42501:%', true, 'anon cannot moderate');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000c2', format('select public.staff_set_review_hidden(%L, true)', (select id from rid))), 'ERR:P0001:FORBIDDEN', 'finance cannot moderate');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000c1', format('select public.staff_set_review_hidden(%L, true)', gen_random_uuid())), 'ERR:P0001:NOT_FOUND', 'unknown review');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000c1', format('select public.staff_set_review_hidden(%L, true)', (select id from rid))), 'OK', 'admin hides');
select is((public.public_consultant_reviews('mohamed-salah')->>'count')::int, 0, 'hidden review leaves the public summary');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000c1', 'select count(*)::text from public.consultant_reviews'), '1', 'admin still sees hidden reviews');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000c2', 'select count(*)::text from public.consultant_reviews'), '0', 'finance sees no review rows');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000c1', format('select public.staff_set_review_hidden(%L, false)', (select id from rid))), 'OK', 'admin restores');
select is((select count(*)::int from audit_log where action in ('review-hidden','review-shown')), 2, 'both changes audited');

select * from finish();
rollback;
