-- 0001_schema: base tables + no-double-booking constraint
create extension if not exists btree_gist with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgtap with schema extensions;
create extension if not exists pg_cron;

create type public.booking_status as enum (
  'reserved','on-hold','confirmed','checked-in','completed','no-show',
  'expired','rejected','wrong-amount','duplicate','late-transfer','cancelled');
create type public.booking_format as enum ('online','in-person');
create type public.staff_role as enum ('admin','finance','reception','consultant');
create type public.exception_kind as enum ('holiday','leave','unavailable');

create table public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role public.staff_role not null,
  consultant_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint staff_consultant_id_required check (role <> 'consultant' or consultant_id is not null)
);

create table public.schedules (
  consultant_id text primary key,
  weekly jsonb not null,
  breaks jsonb not null default '[]'::jsonb,
  formats text[] not null default array['online','in-person'],
  max_per_day int,
  buffer_min int not null default 10,
  created_at timestamptz not null default now()
);

create table public.schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  consultant_id text not null references public.schedules(consultant_id) on delete cascade,
  kind public.exception_kind not null,
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  constraint exception_dates_ordered check (ends_on >= starts_on)
);

-- Minute-granularity padding only, so marking it immutable is safe (generated columns require immutable).
create function public.booking_blocks_range(s timestamptz, e timestamptz)
returns tstzrange language sql immutable parallel safe
set search_path = ''
as $$ select tstzrange(s - interval '10 minutes', greatest(e, s) + interval '10 minutes', '[)') $$;

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  qr_token text not null unique,
  manage_token text not null unique,
  consultant_id text not null,
  branch_id text not null,
  format public.booking_format not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  tz text not null,
  price_amount int not null,
  price_currency text not null default 'EGP',
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  channel text not null,
  lang text not null,
  program text,
  note text,
  status public.booking_status not null default 'reserved',
  hold_expires_at timestamptz,
  reject_reason text,
  meeting_url text,
  checked_in_at timestamptz,
  ticket_sent_at timestamptz,
  ticket_sent_via text,
  created_at timestamptz not null default now(),
  blocks_range tstzrange generated always as (public.booking_blocks_range(starts_at, ends_at)) stored,
  constraint bookings_time_ordered check (ends_at > starts_at),
  constraint bookings_note_len check (note is null or char_length(note) <= 300),
  constraint bookings_channel_enum check (channel in ('email','whatsapp')),
  constraint bookings_lang_enum check (lang in ('ar','en')),
  constraint bookings_no_double_booking exclude using gist (
    consultant_id with =, blocks_range with &&
  ) where (status in ('reserved','on-hold','confirmed','checked-in','completed','wrong-amount','duplicate'))
);
create index bookings_consultant_starts_idx on public.bookings (consultant_id, starts_at);
create index bookings_status_idx on public.bookings (status);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  method text not null,
  txn_ref text not null,
  receipt_path text,
  submitted_at timestamptz not null default now(),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision text,
  created_at timestamptz not null default now()
);
create index payments_booking_idx on public.payments (booking_id);

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_user uuid,
  actor_kind text not null,
  booking_id uuid,
  action text not null,
  from_value text,
  to_value text,
  created_at timestamptz not null default now()
);
create index audit_log_booking_idx on public.audit_log (booking_id);

create table public.consultation_records (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  notes text,
  outcome text,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.staff_profiles enable row level security;
alter table public.schedules enable row level security;
alter table public.schedule_exceptions enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.audit_log enable row level security;
alter table public.consultation_records enable row level security;

revoke all on all tables in schema public from anon;
