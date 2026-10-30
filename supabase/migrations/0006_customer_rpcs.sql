-- 0006_customer_rpcs: anon-callable booking RPCs (spec §4). All SECURITY DEFINER, search_path = '', explicit grants.
-- Errors (SQLSTATE P0001, message = code): SLOT_TAKEN, HOLD_EXPIRED, INVALID_TRANSITION, RATE_LIMITED,
-- INVALID_INPUT, NOT_FOUND. Schedule violations (past / outside hours / day off / format / daily cap) raise
-- SLOT_TAKEN like src/store/actions.ts createReservation, with the reason in DETAIL.

-- Consultant -> branch -> time zone (src/config/consultants.ts + src/config/branches.ts).
create table public.consultant_branches (
  consultant_id text primary key,
  branch_id text not null,
  tz text not null,
  created_at timestamptz not null default now()
);
alter table public.consultant_branches enable row level security;
insert into public.consultant_branches (consultant_id, branch_id, tz) values
  ('mohamed-gamal', 'nasr-city', 'Africa/Cairo'),
  ('ahmed-salama', 'nasr-city', 'Africa/Cairo'),
  ('ahmed-khalil', 'nasr-city', 'Africa/Cairo'),
  ('mohamed-esmail', 'nasr-city', 'Africa/Cairo'),
  ('ahmed-tarek', 'sheikh-zayed', 'Africa/Cairo'),
  ('mohamed-salah', 'sheikh-zayed', 'Africa/Cairo'),
  ('mohamed-abdelaziz', 'dubai', 'Asia/Dubai');

-- Fixed-window counters. A raised RATE_LIMITED rolls back its own increment, so the counter stays at the cap
-- until the window rolls over; attempts that fail for other reasons (which raise) are not counted.
create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count int not null,
  created_at timestamptz not null default now()
);
alter table public.rate_limits enable row level security;
revoke all on public.consultant_branches, public.rate_limits from anon, authenticated;

create function public.hit_rate_limit(p_key text, p_max int, p_window interval)
returns void language plpgsql
set search_path = ''
as $$
declare c int;
begin
  insert into public.rate_limits as r (key, window_start, count) values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when r.window_start <= now() - p_window then 1 else r.count + 1 end,
    window_start = case when r.window_start <= now() - p_window then now() else r.window_start end
  returning count into c;
  if c > p_max then raise exception 'RATE_LIMITED'; end if;
end $$;

create function public.gen_token()
returns text language sql volatile
set search_path = ''
as $$ select encode(extensions.gen_random_bytes(16), 'hex') $$;

-- MG-XXXX-XXXX; no 0/O/1/I (src/domain/ids.ts makeReference).
create function public.gen_reference()
returns text language plpgsql volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(8);
  s text := '';
begin
  for i in 0..7 loop
    s := s || substr(alphabet, get_byte(bytes, i) % 32 + 1, 1);
  end loop;
  return 'MG-' || substr(s, 1, 4) || '-' || substr(s, 5, 4);
end $$;

-- Slot starts allowed by the schedule alone (src/domain/availability.ts getSlots minus busy bookings):
-- format offered, not a day off (weekly empty or any exception covering the date), inside a weekly window,
-- 15-min steps from the window start, clear of breaks, not in the past. 30-min consultations (src/config/booking.ts).
create function public.schedule_slots(p_consultant_id text, p_date date, p_format text)
returns setof timestamptz language sql stable
set search_path = ''
as $$
  select st
  from public.schedules s
  join public.consultant_branches cb on cb.consultant_id = s.consultant_id
  cross join lateral jsonb_array_elements(coalesce(s.weekly -> extract(dow from p_date)::int::text, '[]'::jsonb)) w
  cross join lateral generate_series((w->>'start')::int, (w->>'end')::int - 30, 15) m
  cross join lateral (select (p_date + make_interval(mins => m)) at time zone cb.tz as st) x
  where s.consultant_id = p_consultant_id
    and p_format = any(s.formats)
    and not exists (select 1 from public.schedule_exceptions e
                    where e.consultant_id = s.consultant_id and p_date between e.starts_on and e.ends_on)
    and st >= now()
    and not exists (select 1 from jsonb_array_elements(coalesce(s.breaks, '[]'::jsonb)) br
                    where st < (p_date + make_interval(mins => (br->>'end')::int)) at time zone cb.tz
                      and st + interval '30 minutes' > (p_date + make_interval(mins => (br->>'start')::int)) at time zone cb.tz)
  order by st
$$;

-- Blocking bookings on the consultant's local date (for max_per_day).
create function public.busy_count(p_consultant_id text, p_date date, p_exclude uuid default null)
returns int language sql stable
set search_path = ''
as $$
  select count(*)::int from public.bookings b
  join public.consultant_branches cb on cb.consultant_id = b.consultant_id
  where b.consultant_id = p_consultant_id and b.id is distinct from p_exclude
    and public.is_blocking(b.status, b.hold_expires_at)
    and (b.starts_at at time zone cb.tz)::date = p_date
$$;

-- True when another blocking booking sits within the 10-min buffer of [s, s+30min).
create function public.slot_clashes(p_consultant_id text, p_starts_at timestamptz, p_exclude uuid default null)
returns boolean language sql stable
set search_path = ''
as $$
  select exists (select 1 from public.bookings b
    where b.consultant_id = p_consultant_id and b.id is distinct from p_exclude
      and public.is_blocking(b.status, b.hold_expires_at)
      and b.blocks_range && public.booking_blocks_range(p_starts_at, p_starts_at + interval '30 minutes'))
$$;

-- Raises SLOT_TAKEN (with reason) unless p_starts_at is a bookable slot for this consultant/format.
create function public.assert_slot_open(p_consultant_id text, p_format text, p_starts_at timestamptz, p_exclude uuid default null)
returns void language plpgsql
set search_path = ''
as $$
declare
  tz text;
  d date;
  cap int;
begin
  select cb.tz, s.max_per_day into tz, cap
  from public.consultant_branches cb join public.schedules s on s.consultant_id = cb.consultant_id
  where cb.consultant_id = p_consultant_id;
  if tz is null then raise exception 'INVALID_INPUT' using detail = 'unknown consultant'; end if;
  if p_starts_at < now() then raise exception 'SLOT_TAKEN' using detail = 'past'; end if;
  d := (p_starts_at at time zone tz)::date;
  if not exists (select 1 from public.schedule_slots(p_consultant_id, d, p_format) st where st = p_starts_at) then
    raise exception 'SLOT_TAKEN' using detail = 'outside schedule';
  end if;
  if cap is not null and public.busy_count(p_consultant_id, d, p_exclude) >= cap then
    raise exception 'SLOT_TAKEN' using detail = 'daily limit';
  end if;
  if public.slot_clashes(p_consultant_id, p_starts_at, p_exclude) then
    raise exception 'SLOT_TAKEN';
  end if;
end $$;

-- The customer-facing view of one booking: its own tokens, no staff fields (decided_by, audit, notes).
create function public.customer_view(b public.bookings)
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
    'ticket_sent_at', b.ticket_sent_at, 'ticket_sent_via', b.ticket_sent_via, 'created_at', b.created_at,
    'payment', (select jsonb_build_object('method', p.method, 'txn_ref', p.txn_ref, 'submitted_at', p.submitted_at,
                                          'has_receipt', p.receipt_path is not null)
                from public.payments p where p.booking_id = b.id order by p.submitted_at desc, p.created_at desc limit 1))
$$;

create function public.booking_by_token(p_manage_token text)
returns public.bookings language sql stable
set search_path = ''
as $$
  select * from public.bookings
  where p_manage_token ~ '^[0-9a-f]{32}$' and manage_token = p_manage_token
$$;

-- ---------------------------------------------------------------- anon RPCs

create function public.available_slots(p_consultant_id text, p_date date, p_format text)
returns timestamptz[] language plpgsql stable security definer
set search_path = ''
as $$
declare cap int;
begin
  if p_format is null or p_format not in ('online','in-person') or p_date is null then
    raise exception 'INVALID_INPUT' using detail = 'format/date';
  end if;
  select max_per_day into cap from public.schedules where consultant_id = p_consultant_id;
  if cap is not null and public.busy_count(p_consultant_id, p_date) >= cap then return '{}'; end if;
  return coalesce((select array_agg(st order by st) from public.schedule_slots(p_consultant_id, p_date, p_format) st
                   where not public.slot_clashes(p_consultant_id, st)), '{}');
end $$;

-- details: {name, phone, email?, channel: email|whatsapp, lang|consultationLang: ar|en, program?, note?}
create function public.reserve_slot(p_consultant_id text, p_format text, p_starts_at timestamptz, p_details jsonb)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_details->>'name');
  v_phone text := public.clean_phone(coalesce(p_details->>'phone', ''));
  v_email text := nullif(btrim(coalesce(p_details->>'email', '')), '');
  v_channel text := coalesce(p_details->>'channel', 'whatsapp');
  v_lang text := coalesce(p_details->>'lang', p_details->>'consultationLang', 'ar');
  v_program text := nullif(btrim(coalesce(p_details->>'program', '')), '');
  v_note text := nullif(btrim(coalesce(p_details->>'note', '')), '');
  v_cb public.consultant_branches;
  b public.bookings;
begin
  if p_details is null or jsonb_typeof(p_details) <> 'object' then raise exception 'INVALID_INPUT' using detail = 'details'; end if;
  if p_format is null or p_format not in ('online','in-person') then raise exception 'INVALID_INPUT' using detail = 'format'; end if;
  if p_starts_at is null then raise exception 'INVALID_INPUT' using detail = 'starts_at'; end if;
  if v_name is null or v_name = '' or char_length(v_name) > 100 then raise exception 'INVALID_INPUT' using detail = 'name'; end if;
  if v_phone !~ '^\+\d{8,15}$' then raise exception 'INVALID_INPUT' using detail = 'phone'; end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$') then
    raise exception 'INVALID_INPUT' using detail = 'email';
  end if;
  if v_channel not in ('email','whatsapp') or (v_channel = 'email' and v_email is null) then
    raise exception 'INVALID_INPUT' using detail = 'channel';
  end if;
  if v_lang not in ('ar','en') then raise exception 'INVALID_INPUT' using detail = 'lang'; end if;
  if char_length(v_program) > 50 then raise exception 'INVALID_INPUT' using detail = 'program'; end if;
  if char_length(v_note) > 300 then raise exception 'INVALID_INPUT' using detail = 'note'; end if;
  select * into v_cb from public.consultant_branches where consultant_id = p_consultant_id;
  if not found then raise exception 'INVALID_INPUT' using detail = 'consultant'; end if;

  perform public.hit_rate_limit('reserve:' || v_phone, 5, interval '10 minutes');

  perform public.expire_stale_holds(p_consultant_id, public.booking_blocks_range(p_starts_at, p_starts_at + interval '30 minutes'));
  perform public.assert_slot_open(p_consultant_id, p_format, p_starts_at);

  for attempt in 1..5 loop
    begin
      insert into public.bookings (reference, qr_token, manage_token, consultant_id, branch_id, format, starts_at, ends_at, tz,
        price_amount, price_currency, customer_name, customer_phone, customer_email, channel, lang, program, note,
        status, hold_expires_at)
      values (public.gen_reference(), public.gen_token(), public.gen_token(), p_consultant_id, v_cb.branch_id,
        p_format::public.booking_format, p_starts_at, p_starts_at + interval '30 minutes', v_cb.tz,
        1000, 'EGP', v_name, v_phone, v_email, v_channel, v_lang, v_program, v_note,
        'reserved', now() + interval '30 minutes')
      returning * into b;
      exit;
    exception
      when exclusion_violation then raise exception 'SLOT_TAKEN';
      when unique_violation then
        if attempt = 5 then raise; end if;  -- reference/token collision: retry with fresh values
    end;
  end loop;

  insert into public.audit_log(actor_kind, booking_id, action, from_value, to_value)
  values ('customer', b.id, 'created', null, 'reserved');
  return jsonb_build_object('booking_id', b.id, 'reference', b.reference, 'manage_token', b.manage_token,
                            'hold_expires_at', b.hold_expires_at);
end $$;

-- Only from reserved (unexpired) or rejected (slot re-checked). A repeat submit while on-hold is a no-op.
-- p_receipt_path must be a key under this booking's folder: [receipts/]{booking_id}/{file}.
create function public.submit_payment(p_manage_token text, p_method text, p_txn_ref text, p_receipt_path text default null)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  b public.bookings;
  v_txn text := btrim(public.normalize_digits(coalesce(p_txn_ref, '')));
begin
  select * into b from public.bookings where id = (public.booking_by_token(p_manage_token)).id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if b.status = 'on-hold' then return public.customer_view(b); end if;

  if p_method is null or p_method not in ('instapay','vodafone-cash') then raise exception 'INVALID_INPUT' using detail = 'method'; end if;
  if v_txn = '' or char_length(v_txn) > 100 then raise exception 'INVALID_INPUT' using detail = 'txn_ref'; end if;
  if p_receipt_path is not null and (char_length(p_receipt_path) > 200
      or p_receipt_path !~ ('^(receipts/)?' || b.id::text || '/[A-Za-z0-9._-]+$')) then
    raise exception 'INVALID_INPUT' using detail = 'receipt_path';
  end if;

  b := public.apply_transition(b.id, 'submit-payment', 'customer');
  insert into public.payments(booking_id, method, txn_ref, receipt_path) values (b.id, p_method, v_txn, p_receipt_path);
  return public.customer_view(b);
end $$;

create function public.get_booking(p_manage_token text)
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select public.customer_view(b) from public.booking_by_token(p_manage_token) b where b.id is not null
$$;

-- reference + phone -> manage_token, or null. Accepts lowercase references and Arabic digits.
create function public.find_booking(p_reference text, p_phone text)
returns text language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_ref text := upper(btrim(public.normalize_digits(coalesce(p_reference, ''))));
  v_phone text := public.clean_phone(coalesce(p_phone, ''));
begin
  if v_ref !~ '^MG-[A-Z0-9]{4}-[A-Z0-9]{4}$' or v_phone !~ '^\+\d{8,15}$' then return null; end if;
  perform public.hit_rate_limit('find:' || v_ref || ':' || v_phone, 10, interval '10 minutes');
  return (select manage_token from public.bookings where reference = v_ref and customer_phone = v_phone);
end $$;

create function public.cancel_booking(p_manage_token text)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare b public.bookings := public.booking_by_token(p_manage_token);
begin
  if b.id is null then raise exception 'NOT_FOUND'; end if;
  return public.customer_view(public.apply_transition(b.id, 'cancel', 'customer'));
end $$;

-- Moves a booking to another open slot, keeping its payment and reference (src/store/actions.ts rescheduleBooking).
-- Allowed while the booking is still live (the cancellable set); an unpaid hold past its deadline cannot move.
create function public.reschedule_booking(p_manage_token text, p_starts_at timestamptz)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  b public.bookings;
  nb public.bookings;
begin
  select * into b from public.bookings where id = (public.booking_by_token(p_manage_token)).id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_starts_at is null then raise exception 'INVALID_INPUT' using detail = 'starts_at'; end if;
  if b.status not in ('reserved','on-hold','confirmed','rejected','wrong-amount','duplicate','late-transfer') then
    raise exception 'INVALID_TRANSITION' using detail = format('cannot reschedule from %s', b.status);
  end if;
  if b.status = 'reserved' and now() > b.hold_expires_at then raise exception 'HOLD_EXPIRED'; end if;

  perform public.expire_stale_holds(b.consultant_id, public.booking_blocks_range(p_starts_at, p_starts_at + (b.ends_at - b.starts_at)), b.id);
  perform public.assert_slot_open(b.consultant_id, b.format::text, p_starts_at, b.id);
  begin
    update public.bookings set starts_at = p_starts_at, ends_at = p_starts_at + (b.ends_at - b.starts_at)
    where id = b.id returning * into nb;
  exception when exclusion_violation then raise exception 'SLOT_TAKEN';
  end;
  insert into public.audit_log(actor_kind, booking_id, action, from_value, to_value)
  values ('customer', b.id, 'transition', b.starts_at::text, nb.starts_at::text);
  return public.customer_view(nb);
end $$;

-- Internal helpers stay private; only the seven RPCs are exposed.
revoke execute on function public.hit_rate_limit(text, int, interval), public.gen_token(), public.gen_reference(),
  public.schedule_slots(text, date, text), public.busy_count(text, date, uuid), public.slot_clashes(text, timestamptz, uuid),
  public.assert_slot_open(text, text, timestamptz, uuid), public.customer_view(public.bookings), public.booking_by_token(text)
  from public, anon, authenticated;
grant execute on function
  public.available_slots(text, date, text),
  public.reserve_slot(text, text, timestamptz, jsonb),
  public.submit_payment(text, text, text, text),
  public.get_booking(text),
  public.find_booking(text, text),
  public.cancel_booking(text),
  public.reschedule_booking(text, timestamptz)
  to anon, authenticated, service_role;
