-- Fix: Grant EXECUTE on RPC functions to the authenticated role and reload
-- the PostgREST schema cache.
--
-- Supabase revokes default EXECUTE from PUBLIC, so PostgREST excludes any
-- function lacking an explicit GRANT from its schema cache for authenticated
-- users, causing:
--   "Could not find the function public.<name>(...) in the schema cache"
--
-- Affected functions:
--   load_and_track  (created in 003, replaced in 005)
--   get_my_role     (created in 007_user_roles)

GRANT EXECUTE ON FUNCTION load_and_track(TEXT, TEXT, TEXT, TEXT, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_role() TO authenticated;

NOTIFY pgrst, 'reload schema';
