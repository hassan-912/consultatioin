-- 0022_sales_and_reassign: sales people, their referral links, who sees what, and reception's consultant swap.

-- ── Sales people and referral links ──────────────────────────────────────────────────────────
-- A sales person's link carries their referral code. The booking keeps who referred it, plus a snapshot of the
-- name so finance, reception, consultants and the customer's ticket can show it without reading staff_profiles.
alter table public.staff_profiles add column referral_code text unique check (referral_code ~ '^[a-z0-9]{8}$');
alter table public.bookings add column sales_user_id uuid references public.staff_profiles(user_id) on delete set null;
alter table public.bookings add column sales_name text check (sales_name is null or char_length(sales_name) <= 100);
create index bookings_sales_user_idx on public.bookings (sales_user_id) where sales_user_id is not null;
-- 0009 grants bookings columns one by one; new columns must be granted explicitly.
grant select (sales_user_id, sales_name) on public.bookings to authenticated;

-- Admins may now grant the sales role (same rules otherwise).
create or replace function public.set_staff_role(p_user_id uuid, p_display_name text, p_role text, p_consultant_id text, p_active boolean)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_display_name, ''));
  old_role public.staff_role;
  sp public.staff_profiles;
begin
  perform public.require_admin();
  if p_role is null or p_role not in ('admin','finance','reception','consultant','sales') then
    raise exception 'INVALID_INPUT' using detail = 'role';
  end if;
  if v_name = '' or char_length(v_name) > 100 then raise exception 'INVALID_INPUT' using detail = 'display_name'; end if;
  if p_role = 'consultant' and not exists (select 1 from public.consultant_branches where consultant_id = p_consultant_id) then
    raise exception 'INVALID_INPUT' using detail = 'consultant_id';
  end if;
  if p_user_id = auth.uid() and (p_role <> 'admin' or not coalesce(p_active, true)) then
    raise exception 'INVALID_INPUT' using detail = 'cannot demote or deactivate yourself';
  end if;

  select role into old_role from public.staff_profiles where user_id = p_user_id;
  begin
    insert into public.staff_profiles as t (user_id, display_name, role, consultant_id, active)
    values (p_user_id, v_name, p_role::public.staff_role,
            case when p_role = 'consultant' then p_consultant_id end, coalesce(p_active, true))
    on conflict (user_id) do update set
      display_name = excluded.display_name, role = excluded.role,
      consultant_id = excluded.consultant_id, active = excluded.active
    returning * into sp;
  exception when foreign_key_violation then
    raise exception 'NOT_FOUND' using detail = 'no such user';
  end;
  insert into public.audit_log(actor_user, actor_kind, action, from_value, to_value)
  values (auth.uid(), 'admin', 'staff-role', old_role::text,
          format('%s %s%s', p_user_id, p_role, case when sp.active then '' else ' (inactive)' end));
  return to_jsonb(sp);
end $$;

create or replace function public.invite_staff_profile(p_actor uuid, p_user_id uuid, p_display_name text, p_role text, p_consultant_id text)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
declare v_name text := btrim(coalesce(p_display_name, ''));
begin
  if p_actor is null or p_user_id is null then raise exception 'INVALID_INPUT' using detail = 'user'; end if;
  if not exists (select 1 from public.staff_profiles where user_id = p_actor and active and role = 'admin') then
    raise exception 'FORBIDDEN';
  end if;
  if p_role is null or p_role not in ('admin','finance','reception','consultant','sales') then
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

-- The calling sales person's code, created on first use.
create function public.my_referral_code()
returns text language plpgsql volatile security definer
set search_path = ''
as $$
declare v text;
begin
  if public.current_staff_role() is distinct from 'sales' then raise exception 'FORBIDDEN'; end if;
  select referral_code into v from public.staff_profiles where user_id = auth.uid();
  if v is not null then return v; end if;
  loop
    v := left(public.gen_token(), 8);
    begin
      update public.staff_profiles set referral_code = v where user_id = auth.uid() and referral_code is null;
      return v;
    exception when unique_violation then null; -- another profile drew the same code; draw again
    end;
  end loop;
end $$;
revoke execute on function public.my_referral_code() from public, anon;
grant execute on function public.my_referral_code() to authenticated;

-- Customer: attach the referral from the link they arrived with. Only while held, only once, only an active
-- sales person's code. Unknown codes are ignored (returns false) so a stale link never blocks a booking.
create function public.set_booking_referral(p_manage_token text, p_code text)
returns boolean language plpgsql volatile security definer
set search_path = ''
as $$
declare b public.bookings; sp public.staff_profiles;
begin
  perform public.assert_customer_access();
  b := public.booking_by_token(p_manage_token);
  if b.id is null then raise exception 'NOT_FOUND'; end if;
  if b.status not in ('reserved', 'on-hold') or b.sales_user_id is not null then return false; end if;
  if p_code is null or p_code !~ '^[a-z0-9]{8}$' then return false; end if;
  perform public.hit_rate_limit('referral:' || b.id::text, 10, interval '1 hour');
  select * into sp from public.staff_profiles where referral_code = p_code and role = 'sales' and active;
  if not found then return false; end if;
  update public.bookings set sales_user_id = sp.user_id, sales_name = sp.display_name where id = b.id;
  insert into public.audit_log(actor_user, actor_kind, booking_id, action, from_value, to_value)
  values (null, 'customer', b.id, 'referred', null, sp.display_name);
  return true;
end $$;
revoke execute on function public.set_booking_referral(text, text) from public, anon, authenticated, service_role;
grant execute on function public.set_booking_referral(text, text) to anon, authenticated;

-- The customer's ticket shows "Your advisor".
create or replace function public.customer_view(b public.bookings)
returns jsonb language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id, 'reference', b.reference, 'qr_token', b.qr_token, 'manage_token', b.manage_token,
    'consultant_id', b.consultant_id, 'branch_id', b.branch_id, 'format', b.format,
    'duration_min', (extract(epoch from b.ends_at - b.starts_at) / 60)::int,
    'starts_at', b.starts_at, 'ends_at', b.ends_at, 'tz', b.tz,
    'price_amount', b.price_amount, 'price_currency', b.price_currency,
    'customer', jsonb_build_object('name', b.customer_name, 'phone', b.customer_phone, 'email', b.customer_email,
                                   'channel', b.channel, 'lang', b.lang, 'program', b.program, 'note', b.note),
    'status', b.status, 'hold_expires_at', b.hold_expires_at, 'reject_reason', b.reject_reason,
    'meeting_url', b.meeting_url, 'checked_in_at', b.checked_in_at,
    'ticket_sent_at', b.ticket_sent_at, 'sales_name', b.sales_name, 'ticket_sent_via', b.ticket_sent_via, 'created_at', b.created_at,
    'payment', (select jsonb_build_object('method', p.method, 'txn_ref', p.txn_ref, 'submitted_at', p.submitted_at,
                                          'has_receipt', p.receipt_path is not null)
                from public.payments p where p.booking_id = b.id order by p.submitted_at desc, p.created_at desc limit 1))
$$;

-- ── Visibility ────────────────────────────────────────────────────────────────────────────────
-- Sales people read only the bookings they referred (no payments, records or audit).
drop policy bookings_staff_read on public.bookings;
create policy bookings_staff_read on public.bookings for select to authenticated using (
  (select public.current_staff_role()) in ('admin','finance','reception')
  or consultant_id = (select public.current_consultant_id())
  or ((select public.current_staff_role()) = 'sales' and sales_user_id = (select auth.uid())));

-- File assessments: admin, the booking's consultant, and the sales person who referred the client.
drop policy booking_assessments_staff_read on public.booking_assessments;
create policy booking_assessments_staff_read on public.booking_assessments for select to authenticated using (
  (select public.current_staff_role()) = 'admin'
  or exists (select 1 from public.bookings b where b.id = booking_id and (
       b.consultant_id = (select public.current_consultant_id())
       or ((select public.current_staff_role()) = 'sales' and b.sales_user_id = (select auth.uid())))));

-- ── Reception: swap the consultant ────────────────────────────────────────────────────────────
-- For a late arrival or workload: move a confirmed / checked-in booking to another consultant. In-person
-- bookings stay in their branch. The existing no-double-booking constraint refuses a consultant who is busy.
create function public.staff_reassign_consultant(p_booking_id uuid, p_consultant_id text)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
declare b public.bookings; v_branch text;
begin
  if public.current_staff_role() is null or public.current_staff_role() not in ('reception','admin') then raise exception 'FORBIDDEN'; end if;
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if b.status not in ('confirmed','checked-in') then raise exception 'INVALID_TRANSITION'; end if;
  select branch_id into v_branch from public.consultant_branches where consultant_id = p_consultant_id;
  if v_branch is null then raise exception 'INVALID_INPUT' using detail = 'consultant_id'; end if;
  if b.format = 'in-person' and v_branch <> b.branch_id then raise exception 'INVALID_INPUT' using detail = 'other branch'; end if;
  if p_consultant_id = b.consultant_id then return; end if;
  begin
    update public.bookings set consultant_id = p_consultant_id where id = b.id;
  exception when exclusion_violation then raise exception 'SLOT_TAKEN';
  end;
  insert into public.audit_log(actor_user, actor_kind, booking_id, action, from_value, to_value)
  values (auth.uid(), public.current_staff_role()::text, b.id, 'consultant-changed', b.consultant_id, p_consultant_id);
end $$;
revoke execute on function public.staff_reassign_consultant(uuid, text) from public, anon;
grant execute on function public.staff_reassign_consultant(uuid, text) to authenticated, service_role;
