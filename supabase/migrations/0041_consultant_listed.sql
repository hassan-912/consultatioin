-- 0041_consultant_listed: the admin shows or hides each consultant on the home page. A hidden consultant keeps
-- their bookings and can still be booked by direct link; they just aren't listed. The public metadata says who is listed.
alter table public.consultant_branches add column listed boolean not null default true;

drop function public.public_consultant_metadata();
create function public.public_consultant_metadata()
returns table (consultant_id text, formats text[], total bigint, this_month bigint, listed boolean)
language sql stable security definer set search_path = ''
as $$
  select s.consultant_id, s.formats,
    count(b.id) filter (where b.status = 'completed'),
    count(b.id) filter (where b.status = 'completed'
      and date_trunc('month', b.starts_at at time zone cb.tz) = date_trunc('month', now() at time zone cb.tz)),
    cb.listed
  from public.schedules s
  join public.consultant_branches cb on cb.consultant_id = s.consultant_id
  left join public.bookings b on b.consultant_id = s.consultant_id
  group by s.consultant_id, s.formats, cb.tz, cb.listed
$$;
revoke execute on function public.public_consultant_metadata() from public, anon, authenticated, service_role;
grant execute on function public.public_consultant_metadata() to anon, authenticated;

-- Admin: show or hide a consultant on the home page.
create function public.admin_set_consultant_listed(p_consultant_id text, p_listed boolean)
returns void language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  if p_listed is null then raise exception 'INVALID_INPUT'; end if;
  update public.consultant_branches set listed = p_listed where consultant_id = p_consultant_id;
  if not found then raise exception 'INVALID_INPUT' using detail = 'consultant'; end if;
  insert into public.audit_log(actor_user, actor_kind, action, from_value, to_value)
  values (auth.uid(), 'admin', case when p_listed then 'consultant-shown' else 'consultant-hidden' end, null, p_consultant_id);
end $$;
revoke execute on function public.admin_set_consultant_listed(text, boolean) from public, anon;
grant execute on function public.admin_set_consultant_listed(text, boolean) to authenticated;
