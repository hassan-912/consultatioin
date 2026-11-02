-- 0021_sales_role: new staff role for sales people. On its own so the new enum value is committed before
-- 0022 uses it in policies and functions.
alter type public.staff_role add value if not exists 'sales';
