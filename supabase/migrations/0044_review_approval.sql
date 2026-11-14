-- 0044_review_approval: a customer review stays off the public profile until the consultant it is about approves it.
-- Each consultant decides only their own reviews (admin may decide any). Every existing review goes back to pending.
-- Nothing is deleted; every decision is audited. The admin hide switch (0019) still applies on top.
create type public.review_status as enum ('pending', 'approved', 'rejected');
alter table public.consultant_reviews add column status public.review_status not null default 'pending';
update public.consultant_reviews set status = 'pending';
create index consultant_reviews_status_idx on public.consultant_reviews (consultant_id, status, created_at desc);

-- Public: only approved and not hidden reviews count.
create or replace function public.public_consultant_reviews(p_consultant_id text, p_limit int default 20)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'average', (select round(avg(rating)::numeric, 1) from public.consultant_reviews
                where consultant_id = p_consultant_id and not hidden and status = 'approved'),
    'count', (select count(*) from public.consultant_reviews
              where consultant_id = p_consultant_id and not hidden and status = 'approved'),
    'reviews', coalesce((
      select jsonb_agg(public.review_json(r) order by r.created_at desc)
      from (select * from public.consultant_reviews where consultant_id = p_consultant_id and not hidden and status = 'approved'
            order by created_at desc limit greatest(1, least(coalesce(p_limit, 20), 50))) r
    ), '[]'::jsonb))
$$;
revoke execute on function public.public_consultant_reviews(text, int) from public, anon, authenticated, service_role;
grant execute on function public.public_consultant_reviews(text, int) to anon, authenticated;

-- The signed-in consultant's own reviews, newest first, every status.
create function public.consultant_my_reviews()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_cid text := public.current_consultant_id();
begin
  if v_cid is null then raise exception 'FORBIDDEN'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'rating', r.rating, 'comment', coalesce(r.comment, ''), 'name', r.reviewer_name,
                                        'created_at', r.created_at, 'status', r.status, 'booking_ref', b.reference)
                     order by r.created_at desc, r.id)
    from public.consultant_reviews r join public.bookings b on b.id = r.booking_id
    where r.consultant_id = v_cid), '[]'::jsonb);
end $$;
revoke execute on function public.consultant_my_reviews() from public, anon;
grant execute on function public.consultant_my_reviews() to authenticated, service_role;

-- The review's own consultant (or an admin) approves, rejects, or returns it to pending.
create function public.consultant_set_review_status(p_review_id uuid, p_status public.review_status)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare r public.consultant_reviews; v_admin boolean := public.current_staff_role() is not distinct from 'admin';
begin
  if p_status is null then raise exception 'INVALID_INPUT'; end if;
  if not v_admin and public.current_consultant_id() is null then raise exception 'FORBIDDEN'; end if;
  select * into r from public.consultant_reviews where id = p_review_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not v_admin and r.consultant_id is distinct from public.current_consultant_id() then raise exception 'FORBIDDEN'; end if;
  if r.status = p_status then return; end if;
  update public.consultant_reviews set status = p_status where id = r.id;
  insert into public.audit_log(actor_user, actor_kind, booking_id, action, from_value, to_value)
  values (auth.uid(), case when v_admin then 'admin' else 'consultant' end, r.booking_id, 'review-' || p_status::text, r.status::text, p_status::text);
end $$;
revoke execute on function public.consultant_set_review_status(uuid, public.review_status) from public, anon;
grant execute on function public.consultant_set_review_status(uuid, public.review_status) to authenticated, service_role;
