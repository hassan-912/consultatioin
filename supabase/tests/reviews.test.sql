-- 0018: 12:00–18:00 hours and customer reviews of completed consultations.
begin;
set local search_path = public, extensions;
select plan(20);

create function pg_temp.mk(n int, st booking_status, who text) returns uuid language sql as $$
  insert into public.bookings(reference,qr_token,manage_token,consultant_id,branch_id,format,starts_at,ends_at,tz,price_amount,
    customer_name,customer_phone,channel,lang,status,hold_expires_at)
  values ('RV-'||n,'qrv'||n,lpad(n::text, 32, 'c'),'ahmed-khalil','nasr-city','in-person',
    now() - make_interval(days => n), now() - make_interval(days => n) + interval '30 minutes',
    'Africa/Cairo',1000,who,'+201001234567','whatsapp','en',st,now()+interval '1 day')
  returning id
$$;
create function pg_temp.tok(n int) returns text language sql as $$ select lpad(n::text, 32, 'c') $$;
select pg_temp.mk(1, 'completed', '  Sara Ali ');
select pg_temp.mk(2, 'completed', 'Omar');
select pg_temp.mk(3, 'confirmed', 'Mona');

-- Hours
select is((select count(*)::int from schedules s, jsonb_each(s.weekly) e, jsonb_array_elements(e.value) w
           where (w->>'start')::int <> 720 or (w->>'end')::int <> 1080), 0, 'every working window is 12:00-18:00');
select ok((select count(*) from schedules s, jsonb_each(s.weekly) e where jsonb_array_length(e.value) = 0) > 0, 'days off stay off');

-- Privileges
select ok(not has_table_privilege('anon', 'public.consultant_reviews', 'select'), 'anon cannot read the reviews table');
select ok(has_function_privilege('anon', 'public.submit_review(text,integer,text)', 'execute'), 'anon may call submit_review');
select ok(has_function_privilege('anon', 'public.public_consultant_reviews(text,integer)', 'execute'), 'anon may read public reviews');
select ok(not has_function_privilege('anon', 'public.review_json(public.consultant_reviews)', 'execute'), 'helper is private');

-- Rules
select throws_ok($$select public.submit_review('bad', 5, '')$$, 'P0001', 'NOT_FOUND', 'unknown token');
select throws_ok(format('select public.submit_review(%L, 5, %L)', pg_temp.tok(3), ''), 'P0001', 'INVALID_TRANSITION', 'not completed yet');
select throws_ok(format('select public.submit_review(%L, 6, %L)', pg_temp.tok(1), ''), 'P0001', 'INVALID_INPUT', 'rating above 5');
select throws_ok(format('select public.submit_review(%L, 0, %L)', pg_temp.tok(1), ''), 'P0001', 'INVALID_INPUT', 'rating below 1');
select throws_ok(format('select public.submit_review(%L, 4, %L)', pg_temp.tok(1), repeat('x', 501)), 'P0001', 'INVALID_INPUT', 'comment too long');
select is(public.get_review(pg_temp.tok(1)), null::jsonb, 'no review yet');

select is((public.submit_review(pg_temp.tok(1), 5, '  Very helpful  '))->>'name', 'Sara', 'first name only is published');
select is(public.get_review(pg_temp.tok(1))->>'comment', 'Very helpful', 'comment trimmed and readable by the customer');
select throws_ok(format('select public.submit_review(%L, 1, %L)', pg_temp.tok(1), ''), 'P0001', 'INVALID_TRANSITION', 'only one review per booking');
select is((select count(*)::int from audit_log where action = 'reviewed'), 1, 'review is audited');
select is((public.submit_review(pg_temp.tok(2), 4, null))->>'comment', '', 'comment optional');

select is(public.public_consultant_reviews('ahmed-khalil')->>'average', '4.5', 'average of visible reviews');
update consultant_reviews set hidden = true where rating = 4;
select is((public.public_consultant_reviews('ahmed-khalil')->>'count')::int, 1, 'hidden reviews are excluded');
select is(jsonb_array_length(public.public_consultant_reviews('mohamed-gamal')->'reviews'), 0, 'other consultants unaffected');

select * from finish();
rollback;
