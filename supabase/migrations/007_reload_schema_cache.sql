-- Fix: Grant execute on load_and_track to authenticated role and reload schema cache.
--
-- Migrations 003 and 005 created/replaced load_and_track() but never granted
-- EXECUTE to the authenticated role.  Supabase revokes default EXECUTE from
-- PUBLIC, so PostgREST excludes the function from its schema cache for
-- authenticated users, causing:
--   "Could not find the function public.load_and_track(...) in the schema cache"
--
-- This migration grants the missing permission and reloads the cache for
-- deployments where 003/005 have already been applied.

GRANT EXECUTE ON FUNCTION load_and_track(TEXT, TEXT, TEXT, TEXT, JSONB, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
