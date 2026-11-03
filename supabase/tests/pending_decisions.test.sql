-- 0024: admins list, add, edit and resolve (delete) pending decisions; other staff and anon cannot.
begin;
set local search_path = public, extensions;
select plan(11);

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
select ('00000000-0000-0000-0000-0000000000d' || n)::uuid, 'pd-' || n || '@test.local', 'authenticated', 'authenticated',
       '00000000-0000-0000-0000-000000000000'
from generate_series(1, 2) n;
insert into staff_profiles (user_id, display_name, role, consultant_id, active) values
  ('00000000-0000-0000-0000-0000000000d1', 'Admin', 'admin', null, true),
  ('00000000-0000-0000-0000-0000000000d2', 'Finance', 'finance', null, true);

select is(pg_temp.q('00000000-0000-0000-0000-0000000000d1', 'select count(*)::text from pending_decisions'), '18', 'admin sees the 18 starting decisions');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000d2', 'select count(*)::text from pending_decisions'), '0', 'finance sees none');
select is(pg_temp.q(null, 'select count(*)::text from pending_decisions') like 'ERR:42501:%', true, 'anon cannot read');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000d2', $q$select public.staff_save_decision(null, 'X', '', 'Q', '', '')::text$q$) like 'ERR:P0001:FORBIDDEN%', true, 'finance cannot add');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000d1', $q$select public.staff_save_decision(null, 'X', '', '  ', '', '')::text$q$) like 'ERR:P0001:INVALID_INPUT%', true, 'a question is required');

create temp table nid(id uuid);
grant all on nid to authenticated;
select is(pg_temp.q('00000000-0000-0000-0000-0000000000d1', $q$with x as (select public.staff_save_decision(null, 'Qena', 'قنا', 'Qena branch address', '', 'Hassan') id) insert into nid select id from x returning 'OK'$q$), 'OK', 'admin adds a decision');
select is((select owner || '|' || position from pending_decisions where id = (select id from nid)), 'Hassan|19', 'added at the end with its owner');
select is(pg_temp.q('00000000-0000-0000-0000-0000000000d1', format($q$select public.staff_save_decision(%L, 'Qena', 'قنا', 'Qena address and consultants', 'عنوان فرع قنا', '')::text$q$, (select id from nid))) = (select id::text from nid), true, 'admin edits it');
select is((select question_en || '|' || question_ar || '|' || owner from pending_decisions where id = (select id from nid)), 'Qena address and consultants|عنوان فرع قنا|', 'edit saved');

select is(pg_temp.q('00000000-0000-0000-0000-0000000000d1', format('select public.staff_resolve_decision(%L)', (select id from nid))), 'OK', 'admin resolves it');
select is((select count(*)::int from pending_decisions where id = (select id from nid)) * 10
  + (select count(*)::int from audit_log where action = 'decision-resolved' and to_value = 'Qena address and consultants'), 1, 'resolved decision is deleted and audited');

select * from finish();
rollback;
