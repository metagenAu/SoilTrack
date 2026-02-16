-- Sample Metadata: flexible assay-specific metadata per sample
-- Stores key-value metadata associated with samples across different assay types
-- (e.g., soil health chemistry results, environmental conditions, lab results)
CREATE TABLE sample_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id TEXT REFERENCES trials(id) ON DELETE CASCADE,
  assay_type TEXT NOT NULL,          -- e.g. 'soilHealthChemistry', 'nutrientAnalysis', 'microbialAssay'
  sample_no TEXT,
  date DATE,
  block TEXT,
  treatment INT,                     -- links to trt_number in treatments table
  metric TEXT NOT NULL,
  value DECIMAL,
  unit TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient querying by trial + assay type
CREATE INDEX idx_sample_metadata_trial_assay ON sample_metadata(trial_id, assay_type);
CREATE INDEX idx_sample_metadata_metric ON sample_metadata(trial_id, metric);

-- Add 'sampleMetadata' as a valid file_type for trial_data_files
ALTER TABLE trial_data_files
  DROP CONSTRAINT IF EXISTS trial_data_files_file_type_check;

ALTER TABLE trial_data_files
  ADD CONSTRAINT trial_data_files_file_type_check
  CHECK (file_type IN ('soilHealth', 'soilChemistry', 'plotData', 'tissueChemistry', 'sampleMetadata'));

-- Enable RLS
ALTER TABLE sample_metadata ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON sample_metadata FOR ALL USING (auth.role() = 'authenticated');
