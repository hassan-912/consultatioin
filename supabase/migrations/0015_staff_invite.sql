-- 0015_staff_invite: audited, insert-only staff grant used by the invite-staff Edge Function (service role only).
-- Never overwrites or reactivates an existing staff_profiles row: role/active changes for existing staff go through
-- the audited admin RPC set_staff_role. Profile insert and audit row happen in one transaction.
create function public.invite_staff_profile(p_actor uuid, p_user_id uuid, p_display_name text, p_role text, p_consultant_id text)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
declare v_name text := btrim(coalesce(p_display_name, ''));
begin
  if p_actor is null or p_user_id is null then raise exception 'INVALID_INPUT' using detail = 'user'; end if;
  if not exists (select 1 from public.staff_profiles where user_id = p_actor and active and role = 'admin') then
    raise exception 'FORBIDDEN';
  end if;
  if p_role is null or p_role not in ('admin','finance','reception','consultant') then
    raise exception 'INVALID_INPUT' using detail = 'role';
  end if;
  if v_name = '' or char_length(v_name) > 100 then raise exception 'INVALID_INPUT' using detail = 'display_name'; end if;
  if p_role = 'consultant' and not exists (select 1 from public.consultant_branches where consultant_id = p_consultant_id) then
    raise exception 'INVALID_INPUT' using detail = 'consultant_id';
  end if;
  if exists (select 1 from public.staff_profiles where user_id = p_user_id) then raise exception 'ALREADY_EXISTS'; end if;
  begin
    insert into public.staff_profiles (user_id, display_name, role, consultant_id, active)
    values (p_user_id, v_name, p_role::public.staff_role, case when p_role = 'consultant' then p_consultant_id end, true);
  exception when unique_violation then raise exception 'ALREADY_EXISTS';
            when foreign_key_violation then raise exception 'NOT_FOUND' using detail = 'no such user';
  end;
  insert into public.audit_log(actor_user, actor_kind, action, from_value, to_value)
  values (p_actor, 'admin', 'staff-invited', p_user_id::text,
          p_role || case when p_role = 'consultant' then ':' || p_consultant_id else '' end);
end $$;

revoke execute on function public.invite_staff_profile(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.invite_staff_profile(uuid, uuid, text, text, text) to service_role;
