-- 0038: only the admin edits the WhatsApp messages; staff can read them; the public can't.
begin;
set local search_path = public, extensions;
select plan(8);

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
  ('00000000-0000-0000-0000-0000000000b1', 'boss4@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000b2', 'gamal4@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000b3', 'nobody4@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into staff_profiles (user_id, display_name, role, consultant_id, active) values
  ('00000000-0000-0000-0000-0000000000b1', 'Boss Four', 'admin', null, true),
  ('00000000-0000-0000-0000-0000000000b2', 'Gamal Four', 'consultant', 'mohamed-gamal', true);

select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000b1',
  $q$select public.admin_save_message_template('follow_up', 'ar', 'أخبار حضرتك إيه؟ معاك {consultant} من شركة MG.')::text$q$), 'OK', 'the admin saves the follow-up message');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000b2',
  $q$select body from message_templates where key = 'follow_up' and lang = 'ar'$q$), 'أخبار حضرتك إيه؟ معاك {consultant} من شركة MG.', 'a consultant reads it');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000b2',
  $q$select public.admin_save_message_template('follow_up', 'ar', 'hacked')::text$q$), 'ERR:P0001:FORBIDDEN', 'a consultant cannot change it');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000b3',
  $q$select count(*)::text from message_templates$q$), '0', 'a signed-in non-staff account sees nothing');
select is(pg_temp.q('anon', null, $q$select count(*)::text from message_templates$q$) like 'ERR:42501:%', true, 'the public cannot read it');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000b1',
  $q$select public.admin_save_message_template('ticket_spam', 'ar', 'x')::text$q$), 'ERR:P0001:INVALID_INPUT', 'only the two known messages');
select is(pg_temp.q('authenticated', '00000000-0000-0000-0000-0000000000b1',
  $q$select public.admin_save_message_template('follow_up', 'ar', '   ')::text$q$), 'OK', 'a blank text restores the default');
select is((select count(*)::int from message_templates where key = 'follow_up' and lang = 'ar'), 0, 'so the row is gone');

select * from finish();
rollback;
