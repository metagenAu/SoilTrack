-- GIS Layers: spatial data files per trial (shapefiles, KML, GeoJSON)
CREATE TABLE trial_gis_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id TEXT NOT NULL REFERENCES trials(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('shapefile', 'kml', 'kmz', 'geojson')),
  storage_path TEXT NOT NULL,
  geojson JSONB NOT NULL,
  feature_count INT DEFAULT 0,
  style JSONB DEFAULT '{"color": "#3b82f6", "weight": 2, "fillOpacity": 0.15}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_trial_gis_layers_trial ON trial_gis_layers(trial_id);

ALTER TABLE trial_gis_layers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON trial_gis_layers
  FOR ALL USING (auth.role() = 'authenticated');

-- Update trial_data_files constraint to include 'gis'
ALTER TABLE trial_data_files
  DROP CONSTRAINT IF EXISTS trial_data_files_file_type_check;

ALTER TABLE trial_data_files
  ADD CONSTRAINT trial_data_files_file_type_check
  CHECK (file_type IN ('soilHealth', 'soilChemistry', 'plotData', 'tissueChemistry', 'sampleMetadata', 'photo', 'gis'));

-- Storage bucket for GIS files
INSERT INTO storage.buckets (id, name, public)
VALUES ('trial-gis', 'trial-gis', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload gis"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'trial-gis' AND auth.role() = 'authenticated');

CREATE POLICY "Anyone can view gis files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'trial-gis');

CREATE POLICY "Authenticated users can delete gis"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'trial-gis' AND auth.role() = 'authenticated');
