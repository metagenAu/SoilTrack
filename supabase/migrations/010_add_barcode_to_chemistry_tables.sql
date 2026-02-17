-- Add barcode column to soil_chemistry, tissue_chemistry, and sample_metadata.
-- Barcode is the UID for each chemistry/tissue sample and is critical for
-- linking results across tables (e.g. associating multiple samples with
-- the same sample point at different timepoints).

ALTER TABLE soil_chemistry ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE tissue_chemistry ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE sample_metadata ADD COLUMN IF NOT EXISTS barcode TEXT;

-- Update dedup indexes to include barcode.
-- Barcode uniquely identifies a chemistry sample, so including it in the
-- natural key ensures different barcodes for the same sample_no+date are
-- preserved as separate rows.

DROP INDEX IF EXISTS ux_soil_chemistry_natural;
CREATE UNIQUE INDEX ux_soil_chemistry_natural
  ON soil_chemistry (
    trial_id,
    COALESCE(barcode, '__null__'),
    COALESCE(sample_no, '__null__'),
    COALESCE(date::text, '__null__'),
    COALESCE(metric, '__null__')
  );

DROP INDEX IF EXISTS ux_tissue_chemistry_natural;
CREATE UNIQUE INDEX ux_tissue_chemistry_natural
  ON tissue_chemistry (
    trial_id,
    COALESCE(barcode, '__null__'),
    COALESCE(sample_no, '__null__'),
    COALESCE(date::text, '__null__'),
    COALESCE(tissue_type, '__null__'),
    COALESCE(metric, '__null__')
  );

DROP INDEX IF EXISTS ux_sample_metadata_natural;
CREATE UNIQUE INDEX ux_sample_metadata_natural
  ON sample_metadata (
    trial_id,
    COALESCE(assay_type, '__null__'),
    COALESCE(barcode, '__null__'),
    COALESCE(sample_no, '__null__'),
    COALESCE(date::text, '__null__'),
    COALESCE(metric, '__null__')
  );

-- Update load_and_track RPC to store barcode in all chemistry tables
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
    INSERT INTO soil_chemistry (trial_id, sample_no, date, block, barcode, metric, value, unit, raw_data)
    SELECT
      p_trial_id,
      COALESCE(r->>'sample_no', ''),
      CASE WHEN r->>'date' IS NOT NULL AND r->>'date' != '' THEN (r->>'date')::date ELSE NULL END,
      COALESCE(r->>'block', ''),
      COALESCE(r->>'barcode', ''),
      COALESCE(r->>'metric', ''),
      CASE WHEN r->>'value' IS NOT NULL AND r->>'value' != '' THEN (r->>'value')::decimal ELSE NULL END,
      COALESCE(r->>'unit', ''),
      r->'raw_data'
    FROM jsonb_array_elements(p_rows) AS r
    ON CONFLICT (trial_id, COALESCE(barcode, '__null__'), COALESCE(sample_no, '__null__'), COALESCE(date::text, '__null__'), COALESCE(metric, '__null__'))
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
    INSERT INTO tissue_chemistry (trial_id, sample_no, date, tissue_type, barcode, metric, value, unit, raw_data)
    SELECT
      p_trial_id,
      COALESCE(r->>'sample_no', ''),
      CASE WHEN r->>'date' IS NOT NULL AND r->>'date' != '' THEN (r->>'date')::date ELSE NULL END,
      COALESCE(r->>'tissue_type', ''),
      COALESCE(r->>'barcode', ''),
      COALESCE(r->>'metric', ''),
      CASE WHEN r->>'value' IS NOT NULL AND r->>'value' != '' THEN (r->>'value')::decimal ELSE NULL END,
      COALESCE(r->>'unit', ''),
      r->'raw_data'
    FROM jsonb_array_elements(p_rows) AS r
    ON CONFLICT (trial_id, COALESCE(barcode, '__null__'), COALESCE(sample_no, '__null__'), COALESCE(date::text, '__null__'), COALESCE(tissue_type, '__null__'), COALESCE(metric, '__null__'))
    DO UPDATE SET
      value = EXCLUDED.value,
      unit = EXCLUDED.unit,
      raw_data = EXCLUDED.raw_data;
    GET DIAGNOSTICS v_count = ROW_COUNT;

  ELSIF p_table_name = 'sample_metadata' THEN
    INSERT INTO sample_metadata (trial_id, assay_type, sample_no, date, block, treatment, barcode, metric, value, unit, raw_data)
    SELECT
      p_trial_id,
      COALESCE(r->>'assay_type', 'general'),
      COALESCE(r->>'sample_no', ''),
      CASE WHEN r->>'date' IS NOT NULL AND r->>'date' != '' THEN (r->>'date')::date ELSE NULL END,
      COALESCE(r->>'block', ''),
      CASE WHEN r->>'treatment' IS NOT NULL AND r->>'treatment' != '' THEN (r->>'treatment')::int ELSE NULL END,
      COALESCE(r->>'barcode', ''),
      COALESCE(r->>'metric', ''),
      CASE WHEN r->>'value' IS NOT NULL AND r->>'value' != '' THEN (r->>'value')::decimal ELSE NULL END,
      COALESCE(r->>'unit', ''),
      r->'raw_data'
    FROM jsonb_array_elements(p_rows) AS r
    ON CONFLICT (trial_id, COALESCE(assay_type, '__null__'), COALESCE(barcode, '__null__'), COALESCE(sample_no, '__null__'), COALESCE(date::text, '__null__'), COALESCE(metric, '__null__'))
    DO UPDATE SET
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

-- Grant execute to authenticated role
GRANT EXECUTE ON FUNCTION load_and_track(TEXT, TEXT, TEXT, TEXT, JSONB, UUID) TO authenticated;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
