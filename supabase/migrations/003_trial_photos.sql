-- Trial Photos: store photo metadata per trial
CREATE TABLE trial_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id TEXT REFERENCES trials(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  caption TEXT,
  taken_at DATE,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_trial_photos_trial ON trial_photos(trial_id);

-- Enable RLS
ALTER TABLE trial_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON trial_photos FOR ALL USING (auth.role() = 'authenticated');

-- Update trial_data_files constraint to include 'photo' as a valid file_type
ALTER TABLE trial_data_files
  DROP CONSTRAINT IF EXISTS trial_data_files_file_type_check;

ALTER TABLE trial_data_files
  ADD CONSTRAINT trial_data_files_file_type_check
  CHECK (file_type IN ('soilHealth', 'soilChemistry', 'plotData', 'tissueChemistry', 'sampleMetadata', 'photo'));

-- Create storage bucket for trial photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('trial-photos', 'trial-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: authenticated users can upload/read/delete
CREATE POLICY "Authenticated users can upload photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'trial-photos' AND auth.role() = 'authenticated');

CREATE POLICY "Anyone can view trial photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'trial-photos');

CREATE POLICY "Authenticated users can delete photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'trial-photos' AND auth.role() = 'authenticated');
