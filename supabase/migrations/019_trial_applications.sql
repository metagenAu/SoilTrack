-- Trial Applications: spatial application zones linked to trials and treatments.
-- Each application stores a GeoJSON zone (imported from KML/Shapefile/GeoJSON or
-- drawn on the map) and optionally links to a treatment via trt_number.
CREATE TABLE trial_applications (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id        TEXT        NOT NULL REFERENCES trials(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  trt_number      INT,        -- optional link to treatments(trt_number) within the same trial
  application_type TEXT       CHECK (application_type IN ('fertiliser', 'herbicide', 'fungicide', 'insecticide', 'seed', 'lime', 'gypsum', 'other')),
  product         TEXT,
  rate            TEXT,
  date_applied    DATE,
  geojson         JSONB       NOT NULL,              -- GeoJSON FeatureCollection (application zone)
  geojson_source  TEXT        CHECK (geojson_source IN ('drawn', 'kml', 'shapefile', 'geojson')),
  feature_count   INT         DEFAULT 0,
  style           JSONB       DEFAULT '{"color": "#f59e0b", "weight": 2, "fillOpacity": 0.25}',
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_trial_applications_trial ON trial_applications(trial_id);
CREATE INDEX idx_trial_applications_trt ON trial_applications(trial_id, trt_number);

-- Enable RLS
ALTER TABLE trial_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users full access" ON trial_applications
  FOR ALL USING (auth.role() = 'authenticated');
