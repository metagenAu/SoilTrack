-- Fix: "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" when uploading Soil Health data.
--
-- Root cause: the load_and_track function (last updated in migration 010)
-- uses a 5-column ON CONFLICT target for soil_health_samples:
--   (trial_id, sample_no, date, property, block)
-- but the matching unique index ux_soil_health_natural may be missing or
-- still carry the old 3-column definition from migration 003 if migration 005
-- did not fully apply.
--
-- This migration idempotently ensures the correct index exists.

DROP INDEX IF EXISTS ux_soil_health_natural;
CREATE UNIQUE INDEX ux_soil_health_natural
  ON soil_health_samples (
    trial_id,
    COALESCE(sample_no, '__null__'),
    COALESCE(date, '1900-01-01'::date),
    COALESCE(property, '__null__'),
    COALESCE(block, '__null__')
  );
