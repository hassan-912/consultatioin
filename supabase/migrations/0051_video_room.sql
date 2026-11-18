-- 0051: online consultations happen in a video room on the site (Daily.co, created by the video-room edge function).
-- These helpers are for that function only (service role): it decides who may enter, the database decides what they see.

-- The client's booking through their manage link, as the room needs it. Null for an unknown link.
create function public.video_room_booking(p_manage_token text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare b public.bookings;
begin
  b := public.booking_by_token(p_manage_token);
  if b.id is null then return null; end if;
  return jsonb_build_object('id', b.id, 'reference', b.reference, 'name', b.customer_name, 'status', b.status,
    'format', b.format, 'starts_at', b.starts_at, 'ends_at', b.ends_at, 'lang', b.lang);
end $$;
revoke execute on function public.video_room_booking(text) from public, anon, authenticated;
grant execute on function public.video_room_booking(text) to service_role;

-- A staff member's view of the same booking: only the booking's own consultant or an admin (active profiles).
create function public.video_room_staff_booking(p_booking_id uuid, p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare b public.bookings; p public.staff_profiles;
begin
  select * into p from public.staff_profiles where user_id = p_user_id and active;
  if p.user_id is null then return null; end if;
  select * into b from public.bookings where id = p_booking_id;
  if b.id is null then return null; end if;
  if p.role <> 'admin' and (p.role <> 'consultant' or p.consultant_id is distinct from b.consultant_id) then return null; end if;
  return jsonb_build_object('id', b.id, 'reference', b.reference, 'name', p.display_name, 'status', b.status,
    'format', b.format, 'starts_at', b.starts_at, 'ends_at', b.ends_at, 'lang', b.lang);
end $$;
revoke execute on function public.video_room_staff_booking(uuid, uuid) from public, anon, authenticated;
grant execute on function public.video_room_staff_booking(uuid, uuid) to service_role;

-- The client opened the room: a confirmed booking is checked in, as a reception scan would. Later opens change nothing.
create function public.video_room_client_joined(p_booking_id uuid)
returns void language plpgsql volatile security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.bookings where id = p_booking_id and status = 'confirmed' and format = 'online') then
    perform public.apply_transition(p_booking_id, 'check-in', 'customer', null, null);
  end if;
end $$;
revoke execute on function public.video_room_client_joined(uuid) from public, anon, authenticated;
grant execute on function public.video_room_client_joined(uuid) to service_role;
