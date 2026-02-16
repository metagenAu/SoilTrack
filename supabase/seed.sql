-- Seed Clients
INSERT INTO clients (id, name, farm, region, email, phone, notes) VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Tim Ramsey', 'Bonshaw Farm', 'Northern NSW', 'tim@bonshawfarm.com.au', '0412 345 678', 'Cotton grower, long-term trial partner'),
  ('b2c3d4e5-f6a7-8901-bcde-f12345678901', 'Uri Park Almonds', 'Uri Park', 'Victoria', 'admin@uripark.com.au', '0423 456 789', 'Almond orchard, interested in Transit and CPD'),
  ('c3d4e5f6-a7b8-9012-cdef-123456789012', 'Dawson Ag', 'Dawson Station', 'Moree', 'chris@dawsonag.com.au', '0434 567 890', 'Chickpea and pulse focus');

-- Seed Trials
INSERT INTO trials (id, name, client_id, grower, location, gps, crop, trial_type, contact, planting_date, harvest_date, num_treatments, reps, status, notes) VALUES
  ('24#01', 'Cotton Digestor Trial - Bonshaw', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Tim Ramsey', 'Bonshaw', '-29.053776, 151.291796', 'Cotton', 'Paddock- 3 separate pivots', 'Prue', '2024-10-01', NULL, 5, 1, 'active', 'Testing Digestor effect on cotton yield across three pivot irrigation areas'),
  ('25#03', 'Almond Transit/Digestor/CPD Trial - Uri Park', 'b2c3d4e5-f6a7-8901-bcde-f12345678901', 'Uri Park Almonds', 'Uri Park', NULL, 'Almonds', 'Block comparison', 'Prue', '2025-02-15', NULL, 6, 1, 'active', 'Multi-product block comparison on mature almond orchard'),
  ('25#07', 'Chickpea Biostimulant Trial - Moree', 'c3d4e5f6-a7b8-9012-cdef-123456789012', 'Dawson Ag', 'Moree', '-29.465, 149.845', 'Chickpea', 'RCBD', 'Chris', '2025-05-01', '2025-11-15', 4, 4, 'completed', 'Randomised complete block design testing Digestor and Transit on chickpea');

-- Seed Treatments for Trial 24#01
INSERT INTO treatments (trial_id, trt_number, application, fertiliser, product, rate, timing, sort_order) VALUES
  ('24#01', 1, 'Echo 1 Treated', '400kg/ha', 'Digestor', '3L/ha', 'At planting', 1),
  ('24#01', 2, 'Echo 2 Treated', '200kg/ha', 'Digestor', '3L/ha', 'At planting', 2),
  ('24#01', 3, 'Echo 3 Treated', '400kg/ha', 'Digestor', '3L/ha', 'At planting', 3),
  ('24#01', 4, 'Echo 2 Untreated', '200kg/ha', 'Control', NULL, NULL, 4),
  ('24#01', 5, 'Echo 3 Untreated', '400kg/ha', 'Control', NULL, NULL, 5);

-- Seed Treatments for Trial 25#03
INSERT INTO treatments (trial_id, trt_number, application, fertiliser, product, rate, timing, sort_order) VALUES
  ('25#03', 1, 'Bl 1F Treated Transit', 'Standard', 'Transit', '2L/ha', 'Pre-bud', 1),
  ('25#03', 2, 'Bl 1F Control', 'Standard', 'Control', NULL, NULL, 2),
  ('25#03', 3, 'Bl 2F Treated Digestor', 'Standard', 'Digestor', '3L/ha', 'Pre-bud', 3),
  ('25#03', 4, 'Bl 2F Control', 'Standard', 'Control', NULL, NULL, 4),
  ('25#03', 5, 'Bl 3F Treated CPD', 'Standard', 'CPD', '2L/ha', 'Pre-bud', 5),
  ('25#03', 6, 'Bl 3F Control', 'Standard', 'Control', NULL, NULL, 6);

-- Seed Treatments for Trial 25#07
INSERT INTO treatments (trial_id, trt_number, application, fertiliser, product, rate, timing, sort_order) VALUES
  ('25#07', 1, 'Control', '150kg/ha DAP', 'Control', NULL, NULL, 1),
  ('25#07', 2, 'Digestor Low', '150kg/ha DAP', 'Digestor', '1.5L/ha', 'At planting', 2),
  ('25#07', 3, 'Digestor High', '150kg/ha DAP', 'Digestor', '3L/ha', 'At planting', 3),
  ('25#07', 4, 'Digestor + Transit', '150kg/ha DAP', 'Digestor + Transit', '3L/ha + 2L/ha', 'At planting', 4);

-- Seed Soil Health Samples for Trial 24#01
INSERT INTO soil_health_samples (trial_id, sample_no, date, property, block, barcode, latitude, longitude) VALUES
  ('24#01', '131004421', '2024-10-15', 'Bonshaw Cotton', 'Echo 1 Treated. Digestor.', 'BC-24-001', -29.053776, 151.291796),
  ('24#01', '131004422', '2024-10-15', 'Bonshaw Cotton', 'Echo 2 Treated. Digestor.', 'BC-24-002', -29.054100, 151.291900),
  ('24#01', '131004423', '2024-10-15', 'Bonshaw Cotton', 'Echo 3 Treated. Digestor.', 'BC-24-003', -29.054400, 151.292100),
  ('24#01', '131004424', '2024-10-15', 'Bonshaw Cotton', 'Echo 2 Untreated. Control.', 'BC-24-004', -29.054700, 151.292300),
  ('24#01', '131004425', '2024-10-15', 'Bonshaw Cotton', 'Echo 3 Untreated. Control.', 'BC-24-005', -29.055000, 151.292500);

-- Seed Soil Health Samples for Trial 25#03
INSERT INTO soil_health_samples (trial_id, sample_no, date, property, block, barcode, latitude, longitude) VALUES
  ('25#03', '131005001', '2025-03-01', 'Uri Park. Almonds.', 'Bl 1F. Treated. Transit.', 'UP-25-001', -36.100000, 145.200000),
  ('25#03', '131005002', '2025-03-01', 'Uri Park. Almonds.', 'Bl 1F. Control.', 'UP-25-002', -36.100100, 145.200100),
  ('25#03', '131005003', '2025-03-01', 'Uri Park. Almonds.', 'Bl 2F. Treated. Digestor.', 'UP-25-003', -36.100200, 145.200200),
  ('25#03', '131005004', '2025-03-01', 'Uri Park. Almonds.', 'Bl 2F. Control.', 'UP-25-004', -36.100300, 145.200300),
  ('25#03', '131005005', '2025-03-01', 'Uri Park. Almonds.', 'Bl 3F. Treated. CPD.', 'UP-25-005', -36.100400, 145.200400),
  ('25#03', '131005006', '2025-03-01', 'Uri Park. Almonds.', 'Bl 3F. Control.', 'UP-25-006', -36.100500, 145.200500);

-- Seed Soil Health Samples for Trial 25#07
INSERT INTO soil_health_samples (trial_id, sample_no, date, property, block, barcode, latitude, longitude) VALUES
  ('25#07', '131006001', '2025-05-15', 'Dawson Station. Chickpea.', 'Control Rep 1', 'DA-25-001', -29.465000, 149.845000),
  ('25#07', '131006002', '2025-05-15', 'Dawson Station. Chickpea.', 'Digestor Low Rep 1', 'DA-25-002', -29.465100, 149.845100),
  ('25#07', '131006003', '2025-05-15', 'Dawson Station. Chickpea.', 'Digestor High Rep 1', 'DA-25-003', -29.465200, 149.845200),
  ('25#07', '131006004', '2025-05-15', 'Dawson Station. Chickpea.', 'Digestor + Transit Rep 1', 'DA-25-004', -29.465300, 149.845300);

-- Seed Soil Chemistry for Trial 24#01
INSERT INTO soil_chemistry (trial_id, sample_no, date, block, metric, value, unit) VALUES
  ('24#01', '131004421', '2024-10-15', 'Echo 1 Treated', 'pH', 7.2, 'pH'),
  ('24#01', '131004421', '2024-10-15', 'Echo 1 Treated', 'EC', 0.45, 'dS/m'),
  ('24#01', '131004421', '2024-10-15', 'Echo 1 Treated', 'OC', 1.8, '%'),
  ('24#01', '131004422', '2024-10-15', 'Echo 2 Treated', 'pH', 7.1, 'pH'),
  ('24#01', '131004422', '2024-10-15', 'Echo 2 Treated', 'EC', 0.42, 'dS/m'),
  ('24#01', '131004422', '2024-10-15', 'Echo 2 Treated', 'OC', 1.6, '%');

-- Seed Soil Chemistry for Trial 25#03
INSERT INTO soil_chemistry (trial_id, sample_no, date, block, metric, value, unit) VALUES
  ('25#03', '131005001', '2025-03-01', 'Bl 1F Treated Transit', 'pH', 6.8, 'pH'),
  ('25#03', '131005001', '2025-03-01', 'Bl 1F Treated Transit', 'EC', 0.38, 'dS/m'),
  ('25#03', '131005001', '2025-03-01', 'Bl 1F Treated Transit', 'OC', 2.1, '%'),
  ('25#03', '131005003', '2025-03-01', 'Bl 2F Treated Digestor', 'pH', 6.9, 'pH'),
  ('25#03', '131005003', '2025-03-01', 'Bl 2F Treated Digestor', 'EC', 0.41, 'dS/m'),
  ('25#03', '131005005', '2025-03-01', 'Bl 3F Treated CPD', 'pH', 7.0, 'pH');

-- Seed Soil Chemistry for Trial 25#07
INSERT INTO soil_chemistry (trial_id, sample_no, date, block, metric, value, unit) VALUES
  ('25#07', '131006001', '2025-05-15', 'Control', 'pH', 7.4, 'pH'),
  ('25#07', '131006001', '2025-05-15', 'Control', 'EC', 0.52, 'dS/m'),
  ('25#07', '131006001', '2025-05-15', 'Control', 'OC', 1.4, '%'),
  ('25#07', '131006002', '2025-05-15', 'Digestor Low', 'pH', 7.3, 'pH'),
  ('25#07', '131006002', '2025-05-15', 'Digestor Low', 'EC', 0.55, 'dS/m'),
  ('25#07', '131006003', '2025-05-15', 'Digestor High', 'pH', 7.1, 'pH'),
  ('25#07', '131006003', '2025-05-15', 'Digestor High', 'EC', 0.58, 'dS/m'),
  ('25#07', '131006004', '2025-05-15', 'Digestor + Transit', 'pH', 7.0, 'pH'),
  ('25#07', '131006004', '2025-05-15', 'Digestor + Transit', 'EC', 0.61, 'dS/m');

-- Seed Plot Data for Trial 25#07
INSERT INTO plot_data (trial_id, plot, trt_number, rep, yield_t_ha, plant_count, vigour) VALUES
  ('25#07', '001', 1, 1, 2.10, 42, 6),
  ('25#07', '002', 2, 1, 2.45, 45, 7),
  ('25#07', '003', 3, 1, 2.80, 48, 8),
  ('25#07', '004', 4, 1, 2.95, 47, 8),
  ('25#07', '005', 1, 2, 2.15, 40, 6),
  ('25#07', '006', 2, 2, 2.50, 44, 7),
  ('25#07', '007', 3, 2, 2.75, 46, 7),
  ('25#07', '008', 4, 2, 3.00, 49, 8),
  ('25#07', '009', 1, 3, 2.05, 41, 6),
  ('25#07', '010', 2, 3, 2.55, 43, 7),
  ('25#07', '011', 3, 3, 2.85, 47, 8),
  ('25#07', '012', 4, 3, 2.90, 48, 8),
  ('25#07', '013', 1, 4, 2.20, 43, 6),
  ('25#07', '014', 2, 4, 2.40, 44, 7),
  ('25#07', '015', 3, 4, 2.70, 46, 7),
  ('25#07', '016', 4, 4, 3.05, 50, 9);

-- Seed Tissue Chemistry for Trial 25#03
INSERT INTO tissue_chemistry (trial_id, sample_no, date, tissue_type, metric, value, unit) VALUES
  ('25#03', 'TC-25-001', '2025-04-01', 'Leaf', 'N', 2.8, '%'),
  ('25#03', 'TC-25-001', '2025-04-01', 'Leaf', 'P', 0.18, '%'),
  ('25#03', 'TC-25-001', '2025-04-01', 'Leaf', 'K', 1.5, '%'),
  ('25#03', 'TC-25-002', '2025-04-01', 'Leaf', 'N', 2.6, '%'),
  ('25#03', 'TC-25-002', '2025-04-01', 'Leaf', 'P', 0.16, '%');

-- Seed Tissue Chemistry for Trial 25#07
INSERT INTO tissue_chemistry (trial_id, sample_no, date, tissue_type, metric, value, unit) VALUES
  ('25#07', 'TC-25-010', '2025-07-01', 'Leaf', 'N', 3.2, '%'),
  ('25#07', 'TC-25-010', '2025-07-01', 'Leaf', 'P', 0.22, '%'),
  ('25#07', 'TC-25-011', '2025-07-01', 'Leaf', 'N', 3.5, '%'),
  ('25#07', 'TC-25-011', '2025-07-01', 'Leaf', 'P', 0.25, '%');

-- Seed Trial Data Files
INSERT INTO trial_data_files (trial_id, file_type, has_data) VALUES
  ('24#01', 'soilHealth', true),
  ('24#01', 'soilChemistry', true),
  ('24#01', 'plotData', false),
  ('24#01', 'tissueChemistry', false),
  ('25#03', 'soilHealth', true),
  ('25#03', 'soilChemistry', true),
  ('25#03', 'plotData', false),
  ('25#03', 'tissueChemistry', true),
  ('25#07', 'soilHealth', true),
  ('25#07', 'soilChemistry', true),
  ('25#07', 'plotData', true),
  ('25#07', 'tissueChemistry', true);

-- Seed Management Log
INSERT INTO management_log (trial_id, entry, date, created_by) VALUES
  ('24#01', 'Trial established. Soil samples collected pre-planting.', '2024-10-01', 'Prue'),
  ('24#01', 'Digestor applied at 3L/ha to treated plots at planting.', '2024-10-01', 'Prue'),
  ('24#01', 'First irrigation cycle completed across all pivots.', '2024-10-20', 'Tim Ramsey'),
  ('24#01', 'Post-emergence soil samples collected for DNA analysis.', '2024-11-15', 'Prue'),
  ('25#03', 'Pre-bud soil samples collected across all blocks.', '2025-03-01', 'Prue'),
  ('25#03', 'Transit, Digestor, and CPD applied to respective blocks.', '2025-03-15', 'Prue'),
  ('25#03', 'Tissue samples collected - leaf analysis.', '2025-04-01', 'Prue'),
  ('25#07', 'Trial site established. RCBD layout marked.', '2025-05-01', 'Chris'),
  ('25#07', 'Planting completed. Digestor and Transit applied.', '2025-05-01', 'Chris'),
  ('25#07', 'Emergence counts completed across all plots.', '2025-05-20', 'Chris'),
  ('25#07', 'Mid-season tissue sampling completed.', '2025-07-01', 'Chris'),
  ('25#07', 'Harvest completed. Yield data recorded.', '2025-11-15', 'Chris');
