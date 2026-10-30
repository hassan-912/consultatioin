-- 0003: a schema-scoped default-privilege revoke cannot remove the global implicit "EXECUTE to PUBLIC" default.
-- Revoke it globally for functions created by postgres (customer RPCs get explicit grants in later tasks).
alter default privileges for role postgres revoke execute on functions from public;
revoke execute on all functions in schema public from public;
