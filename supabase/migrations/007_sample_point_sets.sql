-- Sample Point Sets: named collections of GPS points per trial
-- Supports manual placement, GPS imports, grid/transect generation
-- Designed for future NDVI and external data source integrations

-- Named point sets (e.g. "Pre-plant soil sampling", "Mid-season NDVI points")
CREATE TABLE sample_point_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id TEXT NOT NULL REFERENCES trials(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'csv_import', 'gps_import', 'grid', 'transect', 'existing_samples')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'in_progress', 'completed')),
  parameters JSONB,          -- generation params (grid spacing, transect length, etc.)
  style JSONB DEFAULT '{"color": "#3b82f6", "radius": 7}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sample_point_sets_trial ON sample_point_sets(trial_id);

ALTER TABLE sample_point_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON sample_point_sets
  FOR ALL USING (auth.role() = 'authenticated');

-- Individual GPS points within a set
CREATE TABLE sample_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id UUID NOT NULL REFERENCES sample_point_sets(id) ON DELETE CASCADE,
  label TEXT NOT NULL,        -- e.g. "SP-001", "Grid-A1"
  latitude DECIMAL(10,6) NOT NULL,
  longitude DECIMAL(10,6) NOT NULL,
  notes TEXT,
  properties JSONB DEFAULT '{}',  -- extensible key-value store for point attributes
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sample_points_set ON sample_points(set_id);
CREATE UNIQUE INDEX idx_sample_points_label ON sample_points(set_id, label);

ALTER TABLE sample_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON sample_points
  FOR ALL USING (auth.role() = 'authenticated');

-- Data layers: named datasets attached to a point set
-- Each layer holds a metric/measurement per point (e.g. pH, EC, NDVI)
-- Designed for future NDVI integrations and other data sources
CREATE TABLE point_data_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id UUID NOT NULL REFERENCES sample_point_sets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,           -- e.g. "pH", "EC", "NDVI 2025-01"
  unit TEXT,                    -- e.g. "pH units", "dS/m", "index"
  source TEXT DEFAULT 'manual'
    CHECK (source IN ('manual', 'csv_import', 'ndvi', 'satellite', 'sensor', 'lab_result', 'other')),
  source_metadata JSONB,        -- e.g. { "satellite": "Sentinel-2", "date": "2025-06-01", "band": "NDVI" }
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_point_data_layers_set ON point_data_layers(set_id);

ALTER TABLE point_data_layers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON point_data_layers
  FOR ALL USING (auth.role() = 'authenticated');

-- Data values: the actual measurement for each point in a layer
CREATE TABLE point_data_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_id UUID NOT NULL REFERENCES point_data_layers(id) ON DELETE CASCADE,
  point_id UUID NOT NULL REFERENCES sample_points(id) ON DELETE CASCADE,
  value DECIMAL,
  text_value TEXT,             -- for non-numeric data (e.g. soil type, category)
  raw_data JSONB,
  UNIQUE(layer_id, point_id)
);

CREATE INDEX idx_point_data_values_layer ON point_data_values(layer_id);
CREATE INDEX idx_point_data_values_point ON point_data_values(point_id);

ALTER TABLE point_data_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON point_data_values
  FOR ALL USING (auth.role() = 'authenticated');

-- Update trial_data_files constraint to include 'samplePoints'
ALTER TABLE trial_data_files
  DROP CONSTRAINT IF EXISTS trial_data_files_file_type_check;

ALTER TABLE trial_data_files
  ADD CONSTRAINT trial_data_files_file_type_check
  CHECK (file_type IN ('soilHealth', 'soilChemistry', 'plotData', 'tissueChemistry', 'sampleMetadata', 'photo', 'gis', 'samplePoints'));
