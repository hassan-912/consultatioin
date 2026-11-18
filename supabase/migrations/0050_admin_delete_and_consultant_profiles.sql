-- 0050: the admin can delete a booking, and edit a consultant's public profile (bio, photo, video) from the site.

-- ── Delete a booking ─────────────────────────────────────────────────────────────────────────
-- Admin only. Payments, records, assessments, reviews and payment attempts go with it (on delete cascade);
-- queued ticket emails block the delete, so they go first. The audit log keeps the reference and the name.
create function public.admin_delete_booking(p_booking_id uuid)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare b public.bookings;
begin
  perform public.require_admin();
  select * into b from public.bookings where id = p_booking_id for update;
  if b.id is null then raise exception 'NOT_FOUND'; end if;
  delete from public.ticket_email_outbox where booking_id = b.id;
  delete from public.bookings where id = b.id;
  insert into public.audit_log(actor_user, actor_kind, action, from_value, to_value, note)
  values (auth.uid(), 'admin', 'booking-deleted', b.status::text, null, b.reference || ' · ' || b.customer_name);
end $$;
revoke execute on function public.admin_delete_booking(uuid) from public, anon;
grant execute on function public.admin_delete_booking(uuid) to authenticated;

-- ── Consultant profiles ──────────────────────────────────────────────────────────────────────
-- What the admin changed over the built-in profile. A null column keeps the built-in value.
create table public.consultant_profiles (
  consultant_id text primary key,
  bio_en text check (bio_en is null or char_length(bio_en) <= 4000),
  bio_ar text check (bio_ar is null or char_length(bio_ar) <= 4000),
  photo_url text check (photo_url is null or (char_length(photo_url) <= 1000 and photo_url ~ '^(https://|/)')),
  video_url text check (video_url is null or (char_length(video_url) <= 1000 and video_url ~ '^(https://|/)')),
  video_poster text check (video_poster is null or (char_length(video_poster) <= 1000 and video_poster ~ '^(https://|/)')),
  updated_at timestamptz not null default now()
);
alter table public.consultant_profiles enable row level security;
-- No table policies: everyone reads through public_consultant_profiles(), only the admin writes through the RPC.

create function public.public_consultant_profiles()
returns table (consultant_id text, bio_en text, bio_ar text, photo_url text, video_url text, video_poster text)
language sql stable security definer set search_path = ''
as $$ select consultant_id, bio_en, bio_ar, photo_url, video_url, video_poster from public.consultant_profiles $$;
revoke execute on function public.public_consultant_profiles() from public, anon, authenticated, service_role;
grant execute on function public.public_consultant_profiles() to anon, authenticated;

create function public.admin_save_consultant_profile(
  p_consultant_id text, p_bio_en text, p_bio_ar text, p_photo_url text, p_video_url text, p_video_poster text)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare old public.consultant_profiles; changed text[] := '{}';
begin
  perform public.require_admin();
  if not exists (select 1 from public.consultant_branches where consultant_id = p_consultant_id) then
    raise exception 'INVALID_INPUT' using detail = 'consultant';
  end if;
  select * into old from public.consultant_profiles where consultant_id = p_consultant_id;
  if old.bio_en is distinct from nullif(btrim(p_bio_en), '') or old.bio_ar is distinct from nullif(btrim(p_bio_ar), '') then changed := changed || 'bio'; end if;
  if old.photo_url is distinct from nullif(btrim(p_photo_url), '') then changed := changed || 'photo'; end if;
  if old.video_url is distinct from nullif(btrim(p_video_url), '') then changed := changed || 'video'; end if;
  insert into public.consultant_profiles as t (consultant_id, bio_en, bio_ar, photo_url, video_url, video_poster, updated_at)
  values (p_consultant_id, nullif(btrim(p_bio_en), ''), nullif(btrim(p_bio_ar), ''), nullif(btrim(p_photo_url), ''),
          nullif(btrim(p_video_url), ''), nullif(btrim(p_video_poster), ''), now())
  on conflict (consultant_id) do update set bio_en = excluded.bio_en, bio_ar = excluded.bio_ar, photo_url = excluded.photo_url,
    video_url = excluded.video_url, video_poster = excluded.video_poster, updated_at = now();
  insert into public.audit_log(actor_user, actor_kind, action, from_value, to_value, note)
  values (auth.uid(), 'admin', 'consultant-edited', null, p_consultant_id, nullif(array_to_string(changed, ', '), ''));
end $$;
revoke execute on function public.admin_save_consultant_profile(text, text, text, text, text, text) from public, anon;
grant execute on function public.admin_save_consultant_profile(text, text, text, text, text, text) to authenticated;

-- Public bucket for consultant photos and videos. Anyone can view; only the admin uploads, replaces or removes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('consultant-media', 'consultant-media', true, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do nothing;
create policy consultant_media_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'consultant-media' and (select public.current_staff_role()) = 'admin');
create policy consultant_media_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'consultant-media' and (select public.current_staff_role()) = 'admin');
create policy consultant_media_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'consultant-media' and (select public.current_staff_role()) = 'admin');
