-- 0052_payment_test_always_open: the 5 EGP payment-test consultant can be booked at any hour, every day.
-- Every day runs 00:00-24:00 (hourly 45-minute slots), with no lunch break, no daily cap and no days off.
-- Normal booking rules still apply: no past times, and no two bookings in the same hour.
update public.schedules
set weekly = (select jsonb_object_agg(d::text, '[{"start":0,"end":1440}]'::jsonb) from generate_series(0, 6) d),
    breaks = '[]'::jsonb,
    max_per_day = null
where consultant_id = 'test-ek-q7m4x9';

delete from public.schedule_exceptions where consultant_id = 'test-ek-q7m4x9';
delete from public.slot_blocks where consultant_id = 'test-ek-q7m4x9';
