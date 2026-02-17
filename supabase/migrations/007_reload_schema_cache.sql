-- Fix: Reload PostgREST schema cache so the load_and_track function is discoverable.
--
-- Migrations 003 and 005 created/replaced load_and_track() but did not notify
-- PostgREST to refresh its in-memory schema cache.  Without this, PostgREST
-- cannot find the function and returns:
--   "Could not find the function public.load_and_track(...) in the schema cache"
--
-- This migration ensures the cache is reloaded for deployments where 003/005
-- have already been applied.

NOTIFY pgrst, 'reload schema';
