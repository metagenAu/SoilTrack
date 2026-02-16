-- Clients (growers)
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  farm TEXT,
  region TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trials
CREATE TABLE trials (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  client_id UUID REFERENCES clients(id),
  grower TEXT,
  location TEXT,
  gps TEXT,
  crop TEXT,
  trial_type TEXT,
  contact TEXT,
  planting_date DATE,
  harvest_date DATE,
  num_treatments INT DEFAULT 0,
  reps INT DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Treatments (per trial)
CREATE TABLE treatments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id TEXT REFERENCES trials(id) ON DELETE CASCADE,
  trt_number INT NOT NULL,
  application TEXT,
  fertiliser TEXT,
  product TEXT,
  rate TEXT,
  timing TEXT,
  sort_order INT DEFAULT 0,
  UNIQUE(trial_id, trt_number)
);

-- Soil Health Samples
CREATE TABLE soil_health_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id TEXT REFERENCES trials(id) ON DELETE CASCADE,
  sample_no TEXT,
  date DATE,
  property TEXT,
  block TEXT,
  barcode TEXT,
  latitude DECIMAL(10,6),
  longitude DECIMAL(10,6),
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Soil Chemistry Results
CREATE TABLE soil_chemistry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id TEXT REFERENCES trials(id) ON DELETE CASCADE,
  sample_no TEXT,
  date DATE,
  block TEXT,
  metric TEXT,
  value DECIMAL,
  unit TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Plot Data (yield, plant counts)
CREATE TABLE plot_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id TEXT REFERENCES trials(id) ON DELETE CASCADE,
  plot TEXT,
  trt_number INT,
  rep INT,
  yield_t_ha DECIMAL(6,2),
  plant_count INT,
  vigour INT,
  disease_score INT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tissue Chemistry
CREATE TABLE tissue_chemistry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id TEXT REFERENCES trials(id) ON DELETE CASCADE,
  sample_no TEXT,
  date DATE,
  tissue_type TEXT,
  metric TEXT,
  value DECIMAL,
  unit TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Management Log (activity timeline per trial)
CREATE TABLE management_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id TEXT REFERENCES trials(id) ON DELETE CASCADE,
  entry TEXT NOT NULL,
  date DATE,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Upload Log
CREATE TABLE upload_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id TEXT,
  filename TEXT,
  file_type TEXT,
  status TEXT DEFAULT 'success',
  detail TEXT,
  records_imported INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Data Files tracking (which data types exist per trial)
CREATE TABLE trial_data_files (
  trial_id TEXT REFERENCES trials(id) ON DELETE CASCADE,
  file_type TEXT CHECK (file_type IN ('soilHealth', 'soilChemistry', 'plotData', 'tissueChemistry')),
  has_data BOOLEAN DEFAULT false,
  last_updated TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (trial_id, file_type)
);

-- Profiles
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  role TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE soil_health_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE soil_chemistry ENABLE ROW LEVEL SECURITY;
ALTER TABLE plot_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE tissue_chemistry ENABLE ROW LEVEL SECURITY;
ALTER TABLE management_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE trial_data_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow all authenticated users full access)
CREATE POLICY "Authenticated users full access" ON clients FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON trials FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON treatments FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON soil_health_samples FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON soil_chemistry FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON plot_data FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON tissue_chemistry FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON management_log FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON upload_log FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON trial_data_files FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON profiles FOR ALL USING (auth.uid() = id);
