-- Fix: geojson_source CHECK constraint was missing 'kmz', causing KMZ file
-- uploads for application zones to fail with "An internal error occurred".
-- This is the same issue fixed in 016 for fields.boundary_source.
ALTER TABLE trial_applications
  DROP CONSTRAINT IF EXISTS trial_applications_geojson_source_check;

ALTER TABLE trial_applications
  ADD CONSTRAINT trial_applications_geojson_source_check
  CHECK (geojson_source IN ('drawn', 'kml', 'kmz', 'shapefile', 'geojson'));
