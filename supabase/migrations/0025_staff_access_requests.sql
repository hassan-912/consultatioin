-- 0025_staff_access_requests: staff can sign themselves up (email + password, or Google) and ask for access.
-- Signing up grants nothing: there is no staff_profiles row, so every staff policy still refuses them. An admin
-- approves the request (choosing the role) or declines it.
create table public.staff_access_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null check (char_length(display_name) between 1 and 100),
  provider text not null default 'email',
  created_at timestamptz not null default now()
);
alter table public.staff_access_requests enable row level security;
create policy staff_access_requests_admin_read on public.staff_access_requests for select to authenticated
using ((select public.current_staff_role()) = 'admin');
revoke all on public.staff_access_requests from public, anon, authenticated;
grant select on public.staff_access_requests to authenticated;

-- Called by a signed-in person who has no staff profile. Returns 'member' (already staff) or 'pending'.
create function public.request_staff_access(p_display_name text)
returns text language plpgsql volatile security definer
set search_path = ''
as $$
declare
  u auth.users;
  v_name text := left(btrim(coalesce(p_display_name, '')), 100);
begin
  if auth.uid() is null then raise exception 'FORBIDDEN'; end if;
  if exists (select 1 from public.staff_profiles where user_id = auth.uid()) then return 'member'; end if;
  select * into u from auth.users where id = auth.uid();
  if not found or u.email is null then raise exception 'FORBIDDEN'; end if;
  if v_name = '' then v_name := left(split_part(u.email, '@', 1), 100); end if;
  -- A runaway sign-up wave cannot flood the admin's list.
  if not exists (select 1 from public.staff_access_requests where user_id = u.id)
     and (select count(*) from public.staff_access_requests) >= 200 then
    raise exception 'RATE_LIMITED';
  end if;
  insert into public.staff_access_requests(user_id, email, display_name, provider)
  values (u.id, lower(u.email), v_name, coalesce(to_jsonb(u)->'raw_app_meta_data'->>'provider', 'email'))
  on conflict (user_id) do update set display_name = excluded.display_name;
  return 'pending';
end $$;

create function public.approve_staff_request(p_user_id uuid, p_role text, p_consultant_id text)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
declare r public.staff_access_requests;
begin
  if public.current_staff_role() is null or public.current_staff_role() <> 'admin' then raise exception 'FORBIDDEN'; end if;
  if p_role is null or p_role not in ('admin','finance','reception','consultant','sales') then
    raise exception 'INVALID_INPUT' using detail = 'role';
  end if;
  if p_role = 'consultant' and not exists (select 1 from public.consultant_branches where consultant_id = p_consultant_id) then
    raise exception 'INVALID_INPUT' using detail = 'consultant_id';
  end if;
  select * into r from public.staff_access_requests where user_id = p_user_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  begin
    insert into public.staff_profiles (user_id, display_name, role, consultant_id, active)
    values (r.user_id, r.display_name, p_role::public.staff_role, case when p_role = 'consultant' then p_consultant_id end, true);
  exception when unique_violation then raise exception 'ALREADY_EXISTS';
  end;
  delete from public.staff_access_requests where user_id = r.user_id;
  insert into public.audit_log(actor_user, actor_kind, action, from_value, to_value)
  values (auth.uid(), 'admin', 'staff-approved', r.email,
          p_role || case when p_role = 'consultant' then ':' || p_consultant_id else '' end);
end $$;

create function public.decline_staff_request(p_user_id uuid)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
declare r public.staff_access_requests;
begin
  if public.current_staff_role() is null or public.current_staff_role() <> 'admin' then raise exception 'FORBIDDEN'; end if;
  delete from public.staff_access_requests where user_id = p_user_id returning * into r;
  if r.user_id is null then raise exception 'NOT_FOUND'; end if;
  insert into public.audit_log(actor_user, actor_kind, action, to_value)
  values (auth.uid(), 'admin', 'staff-declined', r.email);
end $$;

revoke execute on function public.request_staff_access(text) from public, anon;
grant execute on function public.request_staff_access(text) to authenticated, service_role;
revoke execute on function public.approve_staff_request(uuid, text, text) from public, anon;
grant execute on function public.approve_staff_request(uuid, text, text) to authenticated, service_role;
revoke execute on function public.decline_staff_request(uuid) from public, anon;
grant execute on function public.decline_staff_request(uuid) to authenticated, service_role;
