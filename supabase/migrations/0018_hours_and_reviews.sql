-- 0018_hours_and_reviews: company working hours become 12:00–18:00, and customers can rate a completed consultation.

-- Every working day becomes one 12:00–18:00 window (branch local time). Days off stay off; breaks, formats and
-- limits are untouched. Existing bookings are not moved.
update public.schedules s
set weekly = (
  select jsonb_object_agg(e.key, case when jsonb_array_length(e.value) = 0 then e.value else '[{"start": 720, "end": 1080}]'::jsonb end)
  from jsonb_each(s.weekly) e
);

-- One review per completed booking, written only through submit_review (manage-token capability).
create table public.consultant_reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  consultant_id text not null,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  reviewer_name text not null check (char_length(reviewer_name) between 1 and 40),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index consultant_reviews_consultant_idx on public.consultant_reviews (consultant_id, created_at desc);
alter table public.consultant_reviews enable row level security;
revoke all on public.consultant_reviews from anon, authenticated;
create policy consultant_reviews_staff_read on public.consultant_reviews for select to authenticated
  using (public.current_staff_role() = 'admin');
grant select on public.consultant_reviews to authenticated;

create function public.review_json(r public.consultant_reviews)
returns jsonb language sql immutable set search_path = ''
as $$ select jsonb_build_object('rating', r.rating, 'comment', coalesce(r.comment, ''), 'name', r.reviewer_name, 'created_at', r.created_at) $$;
revoke execute on function public.review_json(public.consultant_reviews) from public, anon, authenticated, service_role;

-- The customer's own review for this booking, or null.
create function public.get_review(p_manage_token text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare b public.bookings; r public.consultant_reviews;
begin
  perform public.assert_customer_access();
  b := public.booking_by_token(p_manage_token);
  if b.id is null then raise exception 'NOT_FOUND'; end if;
  select * into r from public.consultant_reviews where booking_id = b.id;
  if not found then return null; end if;
  return public.review_json(r);
end $$;
revoke execute on function public.get_review(text) from public, anon, authenticated, service_role;
grant execute on function public.get_review(text) to anon, authenticated;

-- Only after the consultant marked the consultation completed; once per booking. Shows the first name only.
create function public.submit_review(p_manage_token text, p_rating int, p_comment text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  b public.bookings; r public.consultant_reviews;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  perform public.assert_customer_access();
  b := public.booking_by_token(p_manage_token);
  if b.id is null then raise exception 'NOT_FOUND'; end if;
  perform public.hit_rate_limit('review:' || b.id::text, 5, interval '1 hour');
  if b.status <> 'completed' then raise exception 'INVALID_TRANSITION'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'INVALID_INPUT' using detail = 'rating'; end if;
  if v_comment is not null and char_length(v_comment) > 500 then raise exception 'INVALID_INPUT' using detail = 'comment'; end if;
  insert into public.consultant_reviews (booking_id, consultant_id, rating, comment, reviewer_name)
  values (b.id, b.consultant_id, p_rating, v_comment,
          left(coalesce(nullif(split_part(btrim(b.customer_name), ' ', 1), ''), 'Customer'), 40))
  on conflict (booking_id) do nothing
  returning * into r;
  if not found then raise exception 'INVALID_TRANSITION' using detail = 'already-reviewed'; end if;
  insert into public.audit_log(actor_user, actor_kind, booking_id, action, from_value, to_value)
  values (null, 'customer', b.id, 'reviewed', null, p_rating::text);
  return public.review_json(r);
end $$;
revoke execute on function public.submit_review(text, int, text) from public, anon, authenticated, service_role;
grant execute on function public.submit_review(text, int, text) to anon, authenticated;

-- Public: average, count and the latest visible reviews for one consultant. No booking or contact data.
create function public.public_consultant_reviews(p_consultant_id text, p_limit int default 20)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'average', (select round(avg(rating)::numeric, 1) from public.consultant_reviews where consultant_id = p_consultant_id and not hidden),
    'count', (select count(*) from public.consultant_reviews where consultant_id = p_consultant_id and not hidden),
    'reviews', coalesce((
      select jsonb_agg(public.review_json(r) order by r.created_at desc)
      from (select * from public.consultant_reviews where consultant_id = p_consultant_id and not hidden
            order by created_at desc limit greatest(1, least(coalesce(p_limit, 20), 50))) r
    ), '[]'::jsonb))
$$;
revoke execute on function public.public_consultant_reviews(text, int) from public, anon, authenticated, service_role;
grant execute on function public.public_consultant_reviews(text, int) to anon, authenticated;
