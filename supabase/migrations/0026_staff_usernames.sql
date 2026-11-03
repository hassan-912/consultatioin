-- 0026_staff_usernames: a self-signed-up person chooses the username shown across the site before their request
-- reaches the admin. They keep signing in with their email (or Google). Usernames are unique, ignoring case.
create or replace function public.request_staff_access(p_display_name text)
returns text language plpgsql volatile security definer
set search_path = ''
as $$
declare
  u auth.users;
  v_name text := btrim(coalesce(p_display_name, ''));
begin
  if auth.uid() is null then raise exception 'FORBIDDEN'; end if;
  if exists (select 1 from public.staff_profiles where user_id = auth.uid()) then return 'member'; end if;
  select * into u from auth.users where id = auth.uid();
  if not found or u.email is null then raise exception 'FORBIDDEN'; end if;
  -- No name given: report whether a request is already filed, without creating one.
  if v_name = '' then
    return case when exists (select 1 from public.staff_access_requests where user_id = u.id) then 'pending' else 'needs-name' end;
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 40 then raise exception 'INVALID_INPUT' using detail = 'display_name'; end if;
  if exists (select 1 from public.staff_profiles where lower(btrim(display_name)) = lower(v_name))
     or exists (select 1 from public.staff_access_requests where user_id <> u.id and lower(btrim(display_name)) = lower(v_name)) then
    return 'taken';
  end if;
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
