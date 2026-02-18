-- Fields: canonical field boundaries linked to clients / growers
CREATE TABLE fields (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  client_id   UUID        REFERENCES clients(id) ON DELETE SET NULL,
  region      TEXT,
  farm        TEXT,
  area_ha     DECIMAL(10,2),
  boundary    JSONB,              -- GeoJSON FeatureCollection (canonical polygon)
  boundary_source TEXT CHECK (boundary_source IN ('drawn', 'kml', 'shapefile', 'geojson')),
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_fields_client ON fields(client_id);

-- Many-to-many link between fields and trials
CREATE TABLE field_trials (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id    UUID        NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  trial_id    TEXT        NOT NULL REFERENCES trials(id) ON DELETE CASCADE,
  season      TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(field_id, trial_id)
);

CREATE INDEX idx_field_trials_field ON field_trials(field_id);
CREATE INDEX idx_field_trials_trial ON field_trials(trial_id);

-- Annotations: user-drawn polygons / markers with labels on a field map
CREATE TABLE field_annotations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id    UUID        NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  label       TEXT        NOT NULL DEFAULT '',
  annotation_type TEXT    NOT NULL CHECK (annotation_type IN ('polygon', 'marker', 'polyline')),
  geojson     JSONB       NOT NULL,         -- single GeoJSON Feature
  style       JSONB       DEFAULT '{"color": "#ef4444", "weight": 2, "fillOpacity": 0.2}',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_field_annotations_field ON field_annotations(field_id);

-- Sampling plans: randomised point grids within a field boundary
CREATE TABLE field_sampling_plans (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id    UUID        NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  strategy    TEXT        NOT NULL CHECK (strategy IN ('random', 'grid', 'stratified')),
  num_points  INT         NOT NULL DEFAULT 10,
  points      JSONB       NOT NULL DEFAULT '[]',   -- array of {lat, lng, label}
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_field_sampling_plans_field ON field_sampling_plans(field_id);

-- GIS layers attached directly to a field (reusable across trials)
CREATE TABLE field_gis_layers (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id      UUID        NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  file_type     TEXT        NOT NULL CHECK (file_type IN ('shapefile', 'kml', 'kmz', 'geojson')),
  geojson       JSONB       NOT NULL,
  feature_count INT         DEFAULT 0,
  style         JSONB       DEFAULT '{"color": "#3b82f6", "weight": 2, "fillOpacity": 0.15}',
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_field_gis_layers_field ON field_gis_layers(field_id);

-- Enable RLS
ALTER TABLE fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_sampling_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_gis_layers ENABLE ROW LEVEL SECURITY;

-- RLS Policies (match existing pattern: authenticated users get full access)
CREATE POLICY "Authenticated users full access" ON fields
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON field_trials
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON field_annotations
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON field_sampling_plans
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON field_gis_layers
  FOR ALL USING (auth.role() = 'authenticated');
