-- Generated column calls this function with the inserter's privileges; keep it executable for non-anon roles.
grant execute on function public.booking_blocks_range(timestamptz, timestamptz) to authenticated, service_role;
