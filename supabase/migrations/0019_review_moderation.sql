-- 0019_review_moderation: admins hide (or restore) a customer review. Hidden reviews leave the public average,
-- count and list (0018 public_consultant_reviews already filters on hidden). Nothing is deleted.
create function public.staff_set_review_hidden(p_review_id uuid, p_hidden boolean)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
declare r public.consultant_reviews;
begin
  if public.current_staff_role() is null or public.current_staff_role() <> 'admin' then
    raise exception 'FORBIDDEN';
  end if;
  if p_hidden is null then raise exception 'INVALID_INPUT'; end if;
  select * into r from public.consultant_reviews where id = p_review_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if r.hidden = p_hidden then return; end if;
  update public.consultant_reviews set hidden = p_hidden where id = r.id;
  insert into public.audit_log(actor_user, actor_kind, booking_id, action, from_value, to_value)
  values (auth.uid(), 'admin', r.booking_id, case when p_hidden then 'review-hidden' else 'review-shown' end, null, r.rating::text);
end $$;
revoke execute on function public.staff_set_review_hidden(uuid, boolean) from public, anon;
grant execute on function public.staff_set_review_hidden(uuid, boolean) to authenticated, service_role;
