-- 0027_swap_reason: reception must say why they moved a client to another consultant. The reason stays on the
-- booking (so the new consultant sees it, with who the client was booked with) and in the history log.
alter table public.bookings add column swap_reason text check (swap_reason is null or char_length(swap_reason) <= 300);
alter table public.bookings add column swapped_from text;
-- 0009 grants bookings columns one by one; new columns must be granted explicitly.
grant select (swap_reason, swapped_from) on public.bookings to authenticated;
alter table public.audit_log add column note text check (note is null or char_length(note) <= 300);

drop function public.staff_reassign_consultant(uuid, text);
create function public.staff_reassign_consultant(p_booking_id uuid, p_consultant_id text, p_reason text)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
declare b public.bookings; v_branch text; v_reason text := btrim(coalesce(p_reason, ''));
begin
  if public.current_staff_role() is null or public.current_staff_role() not in ('reception','admin') then raise exception 'FORBIDDEN'; end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 300 then raise exception 'INVALID_INPUT' using detail = 'reason'; end if;
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if b.status not in ('confirmed','checked-in') then raise exception 'INVALID_TRANSITION'; end if;
  select branch_id into v_branch from public.consultant_branches where consultant_id = p_consultant_id;
  if v_branch is null then raise exception 'INVALID_INPUT' using detail = 'consultant_id'; end if;
  if b.format = 'in-person' and v_branch <> b.branch_id then raise exception 'INVALID_INPUT' using detail = 'other branch'; end if;
  if p_consultant_id = b.consultant_id then return; end if;
  begin
    update public.bookings set consultant_id = p_consultant_id, swap_reason = v_reason, swapped_from = b.consultant_id where id = b.id;
  exception when exclusion_violation then raise exception 'SLOT_TAKEN';
  end;
  insert into public.audit_log(actor_user, actor_kind, booking_id, action, from_value, to_value, note)
  values (auth.uid(), public.current_staff_role()::text, b.id, 'consultant-changed', b.consultant_id, p_consultant_id, v_reason);
end $$;
revoke execute on function public.staff_reassign_consultant(uuid, text, text) from public, anon;
grant execute on function public.staff_reassign_consultant(uuid, text, text) to authenticated, service_role;
