-- Bug #10: Fix COALESCE NULL/'' collision in dedup indexes.
-- Previously, NULL and '' were treated as the same value, causing
-- silent overwrites between rows with NULL vs empty-string keys.
-- Use a sentinel value that won't collide with real data.

-- Bug #11: Widen soil_health_samples natural key to include property and block,
-- so multiple properties/blocks per sample per date don't overwrite each other.

-- Drop and recreate indexes with improved keys.

-- soil_health_samples: now includes property + block in the natural key
DROP INDEX IF EXISTS ux_soil_health_natural;
CREATE UNIQUE INDEX ux_soil_health_natural
  ON soil_health_samples (
    trial_id,
    COALESCE(sample_no, '__null__'),
    COALESCE(date::text, '__null__'),
    COALESCE(property, '__null__'),
    COALESCE(block, '__null__')
  );

-- soil_chemistry: fix sentinel value
DROP INDEX IF EXISTS ux_soil_chemistry_natural;
CREATE UNIQUE INDEX ux_soil_chemistry_natural
  ON soil_chemistry (
    trial_id,
    COALESCE(sample_no, '__null__'),
    COALESCE(date::text, '__null__'),
    COALESCE(metric, '__null__')
  );

-- plot_data: fix sentinel value
DROP INDEX IF EXISTS ux_plot_data_natural;
CREATE UNIQUE INDEX ux_plot_data_natural
  ON plot_data (
    trial_id,
    COALESCE(plot, '__null__'),
    COALESCE(trt_number::text, '__null__'),
    COALESCE(rep::text, '__null__')
  );

-- tissue_chemistry: fix sentinel value
DROP INDEX IF EXISTS ux_tissue_chemistry_natural;
CREATE UNIQUE INDEX ux_tissue_chemistry_natural
  ON tissue_chemistry (
    trial_id,
    COALESCE(sample_no, '__null__'),
    COALESCE(date::text, '__null__'),
    COALESCE(tissue_type, '__null__'),
    COALESCE(metric, '__null__')
  );

-- sample_metadata: fix sentinel value
DROP INDEX IF EXISTS ux_sample_metadata_natural;
CREATE UNIQUE INDEX ux_sample_metadata_natural
  ON sample_metadata (
    trial_id,
    COALESCE(assay_type, '__null__'),
    COALESCE(sample_no, '__null__'),
    COALESCE(metric, '__null__')
  );

-- Bug #13: Add foreign key to upload_log.trial_id (was TEXT with no FK).
-- Use SET NULL on delete so upload history is preserved even if a trial is removed.
-- First ensure any orphaned rows with invalid trial_ids are cleaned up.
DELETE FROM upload_log WHERE trial_id IS NOT NULL AND trial_id NOT IN (SELECT id FROM trials);

ALTER TABLE upload_log
  ALTER COLUMN trial_id TYPE TEXT;

ALTER TABLE upload_log
  ADD CONSTRAINT fk_upload_log_trial
  FOREIGN KEY (trial_id) REFERENCES trials(id) ON DELETE SET NULL;

-- Update load_and_track RPC to match new wider natural key for soil_health_samples
CREATE OR REPLACE FUNCTION load_and_track(
  p_table_name TEXT,
  p_trial_id TEXT,
  p_file_type TEXT,
  p_filename TEXT,
  p_rows JSONB,
  p_raw_upload_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
  v_result JSONB;
BEGIN
  -- Validate table name to prevent injection
  IF p_table_name NOT IN (
    'soil_health_samples', 'soil_chemistry', 'plot_data',
    'tissue_chemistry', 'sample_metadata'
  ) THEN
    RAISE EXCEPTION 'Invalid table name: %', p_table_name;
  END IF;

  IF p_table_name = 'soil_health_samples' THEN
    INSERT INTO soil_health_samples (trial_id, sample_no, date, property, block, barcode, latitude, longitude, raw_data)
    SELECT
      p_trial_id,
      COALESCE(r->>'sample_no', ''),
      CASE WHEN r->>'date' IS NOT NULL AND r->>'date' != '' THEN (r->>'date')::date ELSE NULL END,
      COALESCE(r->>'property', ''),
      COALESCE(r->>'block', ''),
      COALESCE(r->>'barcode', ''),
      CASE WHEN r->>'latitude' IS NOT NULL AND r->>'latitude' != '' THEN (r->>'latitude')::decimal ELSE NULL END,
      CASE WHEN r->>'longitude' IS NOT NULL AND r->>'longitude' != '' THEN (r->>'longitude')::decimal ELSE NULL END,
      r->'raw_data'
    FROM jsonb_array_elements(p_rows) AS r
    ON CONFLICT (trial_id, COALESCE(sample_no, '__null__'), COALESCE(date::text, '__null__'), COALESCE(property, '__null__'), COALESCE(block, '__null__'))
    DO UPDATE SET
      barcode = EXCLUDED.barcode,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      raw_data = EXCLUDED.raw_data;
    GET DIAGNOSTICS v_count = ROW_COUNT;

  ELSIF p_table_name = 'soil_chemistry' THEN
    INSERT INTO soil_chemistry (trial_id, sample_no, date, block, metric, value, unit, raw_data)
    SELECT
      p_trial_id,
      COALESCE(r->>'sample_no', ''),
      CASE WHEN r->>'date' IS NOT NULL AND r->>'date' != '' THEN (r->>'date')::date ELSE NULL END,
      COALESCE(r->>'block', ''),
      COALESCE(r->>'metric', ''),
      CASE WHEN r->>'value' IS NOT NULL AND r->>'value' != '' THEN (r->>'value')::decimal ELSE NULL END,
      COALESCE(r->>'unit', ''),
      r->'raw_data'
    FROM jsonb_array_elements(p_rows) AS r
    ON CONFLICT (trial_id, COALESCE(sample_no, '__null__'), COALESCE(date::text, '__null__'), COALESCE(metric, '__null__'))
    DO UPDATE SET
      block = EXCLUDED.block,
      value = EXCLUDED.value,
      unit = EXCLUDED.unit,
      raw_data = EXCLUDED.raw_data;
    GET DIAGNOSTICS v_count = ROW_COUNT;

  ELSIF p_table_name = 'plot_data' THEN
    INSERT INTO plot_data (trial_id, plot, trt_number, rep, yield_t_ha, plant_count, vigour, disease_score, raw_data)
    SELECT
      p_trial_id,
      COALESCE(r->>'plot', ''),
      CASE WHEN r->>'trt_number' IS NOT NULL AND r->>'trt_number' != '' THEN (r->>'trt_number')::int ELSE NULL END,
      CASE WHEN r->>'rep' IS NOT NULL AND r->>'rep' != '' THEN (r->>'rep')::int ELSE NULL END,
      CASE WHEN r->>'yield_t_ha' IS NOT NULL AND r->>'yield_t_ha' != '' THEN (r->>'yield_t_ha')::decimal ELSE NULL END,
      CASE WHEN r->>'plant_count' IS NOT NULL AND r->>'plant_count' != '' THEN (r->>'plant_count')::int ELSE NULL END,
      CASE WHEN r->>'vigour' IS NOT NULL AND r->>'vigour' != '' THEN (r->>'vigour')::int ELSE NULL END,
      CASE WHEN r->>'disease_score' IS NOT NULL AND r->>'disease_score' != '' THEN (r->>'disease_score')::int ELSE NULL END,
      r->'raw_data'
    FROM jsonb_array_elements(p_rows) AS r
    ON CONFLICT (trial_id, COALESCE(plot, '__null__'), COALESCE(trt_number::text, '__null__'), COALESCE(rep::text, '__null__'))
    DO UPDATE SET
      yield_t_ha = EXCLUDED.yield_t_ha,
      plant_count = EXCLUDED.plant_count,
      vigour = EXCLUDED.vigour,
      disease_score = EXCLUDED.disease_score,
      raw_data = EXCLUDED.raw_data;
    GET DIAGNOSTICS v_count = ROW_COUNT;

  ELSIF p_table_name = 'tissue_chemistry' THEN
    INSERT INTO tissue_chemistry (trial_id, sample_no, date, tissue_type, metric, value, unit, raw_data)
    SELECT
      p_trial_id,
      COALESCE(r->>'sample_no', ''),
      CASE WHEN r->>'date' IS NOT NULL AND r->>'date' != '' THEN (r->>'date')::date ELSE NULL END,
      COALESCE(r->>'tissue_type', ''),
      COALESCE(r->>'metric', ''),
      CASE WHEN r->>'value' IS NOT NULL AND r->>'value' != '' THEN (r->>'value')::decimal ELSE NULL END,
      COALESCE(r->>'unit', ''),
      r->'raw_data'
    FROM jsonb_array_elements(p_rows) AS r
    ON CONFLICT (trial_id, COALESCE(sample_no, '__null__'), COALESCE(date::text, '__null__'), COALESCE(tissue_type, '__null__'), COALESCE(metric, '__null__'))
    DO UPDATE SET
      value = EXCLUDED.value,
      unit = EXCLUDED.unit,
      raw_data = EXCLUDED.raw_data;
    GET DIAGNOSTICS v_count = ROW_COUNT;

  ELSIF p_table_name = 'sample_metadata' THEN
    INSERT INTO sample_metadata (trial_id, assay_type, sample_no, date, block, treatment, metric, value, unit, raw_data)
    SELECT
      p_trial_id,
      COALESCE(r->>'assay_type', 'general'),
      COALESCE(r->>'sample_no', ''),
      CASE WHEN r->>'date' IS NOT NULL AND r->>'date' != '' THEN (r->>'date')::date ELSE NULL END,
      COALESCE(r->>'block', ''),
      CASE WHEN r->>'treatment' IS NOT NULL AND r->>'treatment' != '' THEN (r->>'treatment')::int ELSE NULL END,
      COALESCE(r->>'metric', ''),
      CASE WHEN r->>'value' IS NOT NULL AND r->>'value' != '' THEN (r->>'value')::decimal ELSE NULL END,
      COALESCE(r->>'unit', ''),
      r->'raw_data'
    FROM jsonb_array_elements(p_rows) AS r
    ON CONFLICT (trial_id, COALESCE(assay_type, '__null__'), COALESCE(sample_no, '__null__'), COALESCE(metric, '__null__'))
    DO UPDATE SET
      date = EXCLUDED.date,
      block = EXCLUDED.block,
      treatment = EXCLUDED.treatment,
      value = EXCLUDED.value,
      unit = EXCLUDED.unit,
      raw_data = EXCLUDED.raw_data;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  -- Update trial_data_files tracking
  INSERT INTO trial_data_files (trial_id, file_type, has_data, last_updated)
  VALUES (p_trial_id, p_file_type, true, now())
  ON CONFLICT (trial_id, file_type) DO UPDATE SET
    has_data = true,
    last_updated = now();

  -- Log the upload
  INSERT INTO upload_log (trial_id, filename, file_type, status, detail, records_imported)
  VALUES (
    p_trial_id,
    p_filename,
    p_file_type,
    'success',
    format('Upserted %s records', v_count),
    v_count
  );

  -- Mark raw_upload as loaded if applicable
  IF p_raw_upload_id IS NOT NULL THEN
    UPDATE raw_uploads
    SET status = 'loaded', records_loaded = v_count
    WHERE id = p_raw_upload_id;
  END IF;

  v_result := jsonb_build_object(
    'status', 'success',
    'records', v_count
  );
  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  -- Log the error
  INSERT INTO upload_log (trial_id, filename, file_type, status, detail, records_imported)
  VALUES (p_trial_id, p_filename, p_file_type, 'error', SQLERRM, 0);

  -- Mark raw_upload as error if applicable
  IF p_raw_upload_id IS NOT NULL THEN
    UPDATE raw_uploads
    SET status = 'error', error_detail = SQLERRM
    WHERE id = p_raw_upload_id;
  END IF;

  RETURN jsonb_build_object(
    'status', 'error',
    'detail', SQLERRM
  );
END;
$$;
