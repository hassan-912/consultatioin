-- 0043_readiness: a client who isn't ready for their program doesn't pay. The booking form checks the answers
-- against the admin's rules; when the client isn't ready it files a request here instead of reserving a time, and
-- tells the client customer service will call within 24 hours. The sales manager (an admin-chosen staff account,
-- Shady to start with) and the admin see the requests and mark them contacted or closed.

-- Who is a sales manager --------------------------------------------------------------------------------------
alter table public.staff_profiles add column sales_manager boolean not null default false;
update public.staff_profiles set sales_manager = true where role = 'sales' and active and btrim(display_name) ilike 'shady';

create function public.is_sales_manager()
returns boolean language sql stable security definer
set search_path = ''
as $$
  select coalesce((select p.sales_manager from public.staff_profiles p where p.user_id = auth.uid() and p.active), false)
$$;
revoke execute on function public.is_sales_manager() from public, anon;
grant execute on function public.is_sales_manager() to authenticated;

-- Admin: turn the sales manager switch on or off for a staff account.
create function public.admin_set_sales_manager(p_user_id uuid, p_on boolean)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_name text;
begin
  perform public.require_admin();
  if p_on is null then raise exception 'INVALID_INPUT'; end if;
  update public.staff_profiles set sales_manager = p_on where user_id = p_user_id returning display_name into v_name;
  if not found then raise exception 'NOT_FOUND'; end if;
  insert into public.audit_log(actor_user, actor_kind, action, from_value, to_value)
  values (auth.uid(), 'admin', case when p_on then 'sales-manager-on' else 'sales-manager-off' end, null, v_name);
end $$;
revoke execute on function public.admin_set_sales_manager(uuid, boolean) from public, anon;
grant execute on function public.admin_set_sales_manager(uuid, boolean) to authenticated;

-- The admin's rules --------------------------------------------------------------------------------------------
create table public.readiness_settings (
  id int primary key default 1 check (id = 1),
  rules jsonb not null default '{}'::jsonb check (jsonb_typeof(rules) = 'object' and pg_column_size(rules) < 2000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.readiness_settings enable row level security;
revoke all on public.readiness_settings from public, anon, authenticated;
insert into public.readiness_settings (id) values (1);

-- Everyone (the booking form) reads the rules; the app fills in defaults for anything missing.
create function public.public_readiness_rules()
returns jsonb language sql stable security definer
set search_path = ''
as $$ select rules from public.readiness_settings where id = 1 $$;
revoke execute on function public.public_readiness_rules() from public;
grant execute on function public.public_readiness_rules() to anon, authenticated;

create function public.admin_save_readiness_rules(p_rules jsonb)
returns void language plpgsql security definer
set search_path = ''
as $$
declare k text;
begin
  perform public.require_admin();
  if p_rules is null or jsonb_typeof(p_rules) <> 'object' then raise exception 'INVALID_INPUT'; end if;
  for k in select jsonb_object_keys(p_rules) loop
    if k in ('tourismNoBank','tourismLowBank','tourismOverstay','jobSeekerFunds') then
      if jsonb_typeof(p_rules->k) <> 'boolean' then raise exception 'INVALID_INPUT' using detail = k; end if;
    elsif k in ('tourismMinScore','australiaMinPoints','canadaMinCrs','jobSeekerMaxIssues') then
      if jsonb_typeof(p_rules->k) <> 'number' or (p_rules->>k)::numeric <> trunc((p_rules->>k)::numeric)
         or (p_rules->>k)::numeric < 0 or (p_rules->>k)::numeric > 1200 then
        raise exception 'INVALID_INPUT' using detail = k;
      end if;
    else
      raise exception 'INVALID_INPUT' using detail = k;
    end if;
  end loop;
  update public.readiness_settings set rules = p_rules, updated_at = now(), updated_by = auth.uid() where id = 1;
  insert into public.audit_log(actor_user, actor_kind, action, to_value) values (auth.uid(), 'admin', 'readiness-rules', p_rules::text);
end $$;
revoke execute on function public.admin_save_readiness_rules(jsonb) from public, anon;
grant execute on function public.admin_save_readiness_rules(jsonb) to authenticated;

-- Requests from clients who aren't ready -----------------------------------------------------------------------
create table public.readiness_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  customer_name text not null check (char_length(customer_name) between 1 and 100),
  customer_phone text not null check (customer_phone ~ '^\+\d{8,15}$'),
  customer_email text check (customer_email is null or char_length(customer_email) <= 254),
  lang text not null check (lang in ('ar','en')),
  program text not null check (program in ('tourism','immigration','job-seeking')),
  destination text check (destination is null or char_length(destination) <= 40),
  consultant_id text references public.consultant_branches(consultant_id) on delete set null,
  format text check (format is null or format in ('online','in-person')),
  wanted_at timestamptz,
  score numeric,
  score_max numeric,
  reasons jsonb not null check (jsonb_typeof(reasons) = 'array' and pg_column_size(reasons) < 8000),
  answers jsonb not null check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) < 16000),
  status text not null default 'open' check (status in ('open','contacted','closed')),
  handled_by uuid references auth.users(id),
  handled_at timestamptz
);
create index readiness_requests_status_idx on public.readiness_requests (status, created_at desc);
alter table public.readiness_requests enable row level security;
revoke all on public.readiness_requests from public, anon, authenticated;

-- Customer: file the request. Same limits as a reservation, so it can't be used to flood the list.
create function public.submit_readiness_request(p jsonb)
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p->>'name', ''));
  v_phone text := public.clean_phone(coalesce(p->>'phone', ''));
  v_email text := nullif(btrim(coalesce(p->>'email', '')), '');
  v_lang text := coalesce(p->>'lang', 'ar');
  v_program text := p->>'program';
  v_consultant text := nullif(p->>'consultantId', '');
  v_format text := nullif(p->>'format', '');
  v_wanted timestamptz;
begin
  perform public.assert_customer_access();
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'INVALID_INPUT'; end if;
  if v_name = '' or char_length(v_name) > 100 then raise exception 'INVALID_INPUT' using detail = 'name'; end if;
  if v_phone !~ '^\+\d{8,15}$' then raise exception 'INVALID_INPUT' using detail = 'phone'; end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$') then
    raise exception 'INVALID_INPUT' using detail = 'email';
  end if;
  if v_lang not in ('ar','en') then raise exception 'INVALID_INPUT' using detail = 'lang'; end if;
  if v_program is null or v_program not in ('tourism','immigration','job-seeking') then raise exception 'INVALID_INPUT' using detail = 'program'; end if;
  if v_consultant is not null and not exists (select 1 from public.consultant_branches where consultant_id = v_consultant) then
    raise exception 'INVALID_INPUT' using detail = 'consultant';
  end if;
  if v_format is not null and v_format not in ('online','in-person') then raise exception 'INVALID_INPUT' using detail = 'format'; end if;
  begin v_wanted := nullif(p->>'wantedAt', '')::timestamptz;
  exception when others then raise exception 'INVALID_INPUT' using detail = 'wanted_at'; end;
  if jsonb_typeof(coalesce(p->'reasons', 'null')) <> 'array' or jsonb_array_length(p->'reasons') = 0
     or jsonb_typeof(coalesce(p->'answers', 'null')) <> 'object' then
    raise exception 'INVALID_INPUT' using detail = 'assessment';
  end if;

  perform public.hit_rate_limit('readiness:' || v_phone, 5, interval '10 minutes');
  if public.request_ip() is not null then
    perform public.hit_rate_limit('readiness-ip:' || public.request_ip(), 15, interval '10 minutes');
  end if;

  insert into public.readiness_requests (customer_name, customer_phone, customer_email, lang, program, destination, consultant_id,
    format, wanted_at, score, score_max, reasons, answers)
  values (v_name, v_phone, v_email, v_lang, v_program, nullif(left(btrim(coalesce(p->>'destination', '')), 40), ''), v_consultant,
    v_format, v_wanted,
    case when jsonb_typeof(p->'score') = 'number' then (p->>'score')::numeric end,
    case when jsonb_typeof(p->'scoreMax') = 'number' then (p->>'scoreMax')::numeric end,
    p->'reasons', p->'answers');
  insert into public.audit_log(actor_kind, action, to_value) values ('customer', 'readiness-request', v_program);
end $$;
revoke execute on function public.submit_readiness_request(jsonb) from public;
grant execute on function public.submit_readiness_request(jsonb) to anon, authenticated;

-- Sales manager or admin: the list.
create function public.readiness_request_list()
returns setof public.readiness_requests language plpgsql stable security definer
set search_path = ''
as $$
begin
  if public.current_staff_role() is distinct from 'admin' and not public.is_sales_manager() then raise exception 'FORBIDDEN'; end if;
  return query select * from public.readiness_requests order by (status = 'open') desc, created_at desc limit 500;
end $$;
revoke execute on function public.readiness_request_list() from public, anon;
grant execute on function public.readiness_request_list() to authenticated;

-- Sales manager or admin: mark a request contacted, closed, or open again.
create function public.set_readiness_status(p_id uuid, p_status text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare r public.staff_role := public.current_staff_role();
begin
  if r is distinct from 'admin' and not public.is_sales_manager() then raise exception 'FORBIDDEN'; end if;
  if p_status is null or p_status not in ('open','contacted','closed') then raise exception 'INVALID_INPUT'; end if;
  update public.readiness_requests
  set status = p_status,
      handled_by = case when p_status = 'open' then null else auth.uid() end,
      handled_at = case when p_status = 'open' then null else now() end
  where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  insert into public.audit_log(actor_user, actor_kind, action, to_value) values (auth.uid(), r::text, 'readiness-' || p_status, p_id::text);
end $$;
revoke execute on function public.set_readiness_status(uuid, text) from public, anon;
grant execute on function public.set_readiness_status(uuid, text) to authenticated;
