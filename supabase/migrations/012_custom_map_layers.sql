-- Custom map layers: arbitrary user-uploaded data mapped to GPS points
CREATE TABLE custom_map_layers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id    TEXT        NOT NULL REFERENCES trials(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  metric_columns TEXT[]   NOT NULL DEFAULT '{}',
  points      JSONB       NOT NULL DEFAULT '[]',
  point_count INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_custom_map_layers_trial ON custom_map_layers(trial_id);

-- RLS
ALTER TABLE custom_map_layers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view custom_map_layers" ON custom_map_layers
  FOR SELECT USING (true);

CREATE POLICY "Users can insert custom_map_layers" ON custom_map_layers
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can delete custom_map_layers" ON custom_map_layers
  FOR DELETE USING (true);
