-- Fix: boundary_source CHECK constraint was missing 'kmz', causing KMZ file
-- boundary uploads to fail silently (boundary renders on map but DB update
-- is rejected, so it disappears on refresh).
ALTER TABLE fields
  DROP CONSTRAINT IF EXISTS fields_boundary_source_check;

ALTER TABLE fields
  ADD CONSTRAINT fields_boundary_source_check
  CHECK (boundary_source IN ('drawn', 'kml', 'kmz', 'shapefile', 'geojson'));
