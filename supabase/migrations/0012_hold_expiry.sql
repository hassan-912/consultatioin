-- Internal minute job: preserve bookings and expire only unpaid reserved holds.
-- Row locks serialize against payment/staff transitions; concurrent expiry workers
-- skip claimed rows and a later invocation picks up any still-due holds.
create function public.expire_due_holds()
returns integer language plpgsql
set search_path = ''
as $$
declare
  due_id uuid;
  expired_count integer := 0;
begin
  for due_id in
    select b.id from public.bookings b
    where b.status = 'reserved' and b.hold_expires_at <= now()
    order by b.id
    for update skip locked
  loop
    perform public.apply_transition(due_id, 'expire', 'system', null, null);
    expired_count := expired_count + 1;
  end loop;
  return expired_count;
end $$;

-- Run with the migration/job owner's privileges, never through an API role.
revoke execute on function public.expire_due_holds() from public, anon, authenticated, service_role;

-- pg_cron updates a job with the same name for its owner; no unschedule or purge.
select cron.schedule('expire-holds', '* * * * *', 'select public.expire_due_holds();');
