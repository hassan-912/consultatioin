-- 0040_payment_test_public: the 5 EGP payment-test consultant is listed at Nasr City and anyone can book it
-- (no admin test key needed). Price stays 5 EGP (consultant_branches.price_amount).
update public.consultant_branches set admin_only = false where consultant_id = 'test-ek-q7m4x9';
