-- Migration 015: Security Hardening
-- Fixes: C1 (RBAC-aware RLS), C2 (handle_new_user privilege escalation),
--        C3 (public storage buckets), H5 (custom_map_layers open RLS),
--        M5 (audit log table)

-- ============================================================
-- C2: Fix handle_new_user() — never trust user-supplied role
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'readonly'  -- Always default to readonly; admins promote via API
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ============================================================
-- C1: Rewrite RLS policies to enforce application roles
-- Helper: get_my_role() already exists from migration 007
-- ============================================================

-- ── clients ──
DROP POLICY IF EXISTS "Authenticated users full access" ON clients;
CREATE POLICY "Anyone authenticated can read clients"
  ON clients FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Upload+ can insert clients"
  ON clients FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));
CREATE POLICY "Admin can update clients"
  ON clients FOR UPDATE
  USING (auth.role() = 'authenticated' AND get_my_role() = 'admin');
CREATE POLICY "Admin can delete clients"
  ON clients FOR DELETE
  USING (auth.role() = 'authenticated' AND get_my_role() = 'admin');

-- ── trials ──
DROP POLICY IF EXISTS "Authenticated users full access" ON trials;
CREATE POLICY "Anyone authenticated can read trials"
  ON trials FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Upload+ can insert trials"
  ON trials FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));
CREATE POLICY "Upload+ can update trials"
  ON trials FOR UPDATE
  USING (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));
CREATE POLICY "Admin can delete trials"
  ON trials FOR DELETE
  USING (auth.role() = 'authenticated' AND get_my_role() = 'admin');

-- ── treatments ──
DROP POLICY IF EXISTS "Authenticated users full access" ON treatments;
CREATE POLICY "Anyone authenticated can read treatments"
  ON treatments FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Upload+ can insert treatments"
  ON treatments FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));
CREATE POLICY "Upload+ can update treatments"
  ON treatments FOR UPDATE
  USING (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));
CREATE POLICY "Upload+ can delete treatments"
  ON treatments FOR DELETE
  USING (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));

-- ── soil_health_samples ──
DROP POLICY IF EXISTS "Authenticated users full access" ON soil_health_samples;
CREATE POLICY "Anyone authenticated can read soil_health_samples"
  ON soil_health_samples FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Upload+ can insert soil_health_samples"
  ON soil_health_samples FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));
CREATE POLICY "Upload+ can update soil_health_samples"
  ON soil_health_samples FOR UPDATE
  USING (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));
CREATE POLICY "Admin can delete soil_health_samples"
  ON soil_health_samples FOR DELETE
  USING (auth.role() = 'authenticated' AND get_my_role() = 'admin');

-- ── soil_chemistry ──
DROP POLICY IF EXISTS "Authenticated users full access" ON soil_chemistry;
CREATE POLICY "Anyone authenticated can read soil_chemistry"
  ON soil_chemistry FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Upload+ can insert soil_chemistry"
  ON soil_chemistry FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));
CREATE POLICY "Upload+ can update soil_chemistry"
  ON soil_chemistry FOR UPDATE
  USING (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));
CREATE POLICY "Admin can delete soil_chemistry"
  ON soil_chemistry FOR DELETE
  USING (auth.role() = 'authenticated' AND get_my_role() = 'admin');

-- ── plot_data ──
DROP POLICY IF EXISTS "Authenticated users full access" ON plot_data;
CREATE POLICY "Anyone authenticated can read plot_data"
  ON plot_data FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Upload+ can insert plot_data"
  ON plot_data FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));
CREATE POLICY "Upload+ can update plot_data"
  ON plot_data FOR UPDATE
  USING (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));
CREATE POLICY "Admin can delete plot_data"
  ON plot_data FOR DELETE
  USING (auth.role() = 'authenticated' AND get_my_role() = 'admin');

-- ── tissue_chemistry ──
DROP POLICY IF EXISTS "Authenticated users full access" ON tissue_chemistry;
CREATE POLICY "Anyone authenticated can read tissue_chemistry"
  ON tissue_chemistry FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Upload+ can insert tissue_chemistry"
  ON tissue_chemistry FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));
CREATE POLICY "Upload+ can update tissue_chemistry"
  ON tissue_chemistry FOR UPDATE
  USING (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));
CREATE POLICY "Admin can delete tissue_chemistry"
  ON tissue_chemistry FOR DELETE
  USING (auth.role() = 'authenticated' AND get_my_role() = 'admin');

-- ── sample_metadata ──
DROP POLICY IF EXISTS "Authenticated users full access" ON sample_metadata;
CREATE POLICY "Anyone authenticated can read sample_metadata"
  ON sample_metadata FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Upload+ can insert sample_metadata"
  ON sample_metadata FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));
CREATE POLICY "Upload+ can update sample_metadata"
  ON sample_metadata FOR UPDATE
  USING (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));
CREATE POLICY "Admin can delete sample_metadata"
  ON sample_metadata FOR DELETE
  USING (auth.role() = 'authenticated' AND get_my_role() = 'admin');

-- ── management_log ──
DROP POLICY IF EXISTS "Authenticated users full access" ON management_log;
CREATE POLICY "Anyone authenticated can read management_log"
  ON management_log FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Upload+ can insert management_log"
  ON management_log FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));
CREATE POLICY "Admin can update management_log"
  ON management_log FOR UPDATE
  USING (auth.role() = 'authenticated' AND get_my_role() = 'admin');
CREATE POLICY "Admin can delete management_log"
  ON management_log FOR DELETE
  USING (auth.role() = 'authenticated' AND get_my_role() = 'admin');

-- ── upload_log ──
DROP POLICY IF EXISTS "Authenticated users full access" ON upload_log;
CREATE POLICY "Anyone authenticated can read upload_log"
  ON upload_log FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Upload+ can insert upload_log"
  ON upload_log FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));

-- ── trial_data_files ──
DROP POLICY IF EXISTS "Authenticated users full access" ON trial_data_files;
CREATE POLICY "Anyone authenticated can read trial_data_files"
  ON trial_data_files FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Upload+ can insert trial_data_files"
  ON trial_data_files FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));
CREATE POLICY "Upload+ can update trial_data_files"
  ON trial_data_files FOR UPDATE
  USING (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));

-- ── raw_uploads ──
DROP POLICY IF EXISTS "Authenticated users full access" ON raw_uploads;
CREATE POLICY "Anyone authenticated can read raw_uploads"
  ON raw_uploads FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Upload+ can insert raw_uploads"
  ON raw_uploads FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));
CREATE POLICY "Upload+ can update raw_uploads"
  ON raw_uploads FOR UPDATE
  USING (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));

-- ── trial_photos ──
DROP POLICY IF EXISTS "Authenticated users full access" ON trial_photos;
CREATE POLICY "Anyone authenticated can read trial_photos"
  ON trial_photos FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Upload+ can insert trial_photos"
  ON trial_photos FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));
CREATE POLICY "Admin can delete trial_photos"
  ON trial_photos FOR DELETE
  USING (auth.role() = 'authenticated' AND get_my_role() = 'admin');

-- ── trial_gis_layers ──
DROP POLICY IF EXISTS "Authenticated users full access" ON trial_gis_layers;
CREATE POLICY "Anyone authenticated can read trial_gis_layers"
  ON trial_gis_layers FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Upload+ can insert trial_gis_layers"
  ON trial_gis_layers FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));
CREATE POLICY "Admin can delete trial_gis_layers"
  ON trial_gis_layers FOR DELETE
  USING (auth.role() = 'authenticated' AND get_my_role() = 'admin');

-- ── fields ──
DROP POLICY IF EXISTS "Authenticated users full access" ON fields;
CREATE POLICY "Anyone authenticated can read fields"
  ON fields FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Upload+ can insert fields"
  ON fields FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));
CREATE POLICY "Upload+ can update fields"
  ON fields FOR UPDATE
  USING (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));
CREATE POLICY "Admin can delete fields"
  ON fields FOR DELETE
  USING (auth.role() = 'authenticated' AND get_my_role() = 'admin');

-- ── field_trials ──
DROP POLICY IF EXISTS "Authenticated users full access" ON field_trials;
CREATE POLICY "Anyone authenticated can read field_trials"
  ON field_trials FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Upload+ can insert field_trials"
  ON field_trials FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));
CREATE POLICY "Admin can delete field_trials"
  ON field_trials FOR DELETE
  USING (auth.role() = 'authenticated' AND get_my_role() = 'admin');

-- ── field_annotations ──
DROP POLICY IF EXISTS "Authenticated users full access" ON field_annotations;
CREATE POLICY "Anyone authenticated can read field_annotations"
  ON field_annotations FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Upload+ can insert field_annotations"
  ON field_annotations FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));
CREATE POLICY "Admin can delete field_annotations"
  ON field_annotations FOR DELETE
  USING (auth.role() = 'authenticated' AND get_my_role() = 'admin');

-- ── field_sampling_plans ──
DROP POLICY IF EXISTS "Authenticated users full access" ON field_sampling_plans;
CREATE POLICY "Anyone authenticated can read field_sampling_plans"
  ON field_sampling_plans FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Upload+ can insert field_sampling_plans"
  ON field_sampling_plans FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));
CREATE POLICY "Admin can delete field_sampling_plans"
  ON field_sampling_plans FOR DELETE
  USING (auth.role() = 'authenticated' AND get_my_role() = 'admin');

-- ── field_gis_layers ──
DROP POLICY IF EXISTS "Authenticated users full access" ON field_gis_layers;
CREATE POLICY "Anyone authenticated can read field_gis_layers"
  ON field_gis_layers FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Upload+ can insert field_gis_layers"
  ON field_gis_layers FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));
CREATE POLICY "Upload+ can update field_gis_layers"
  ON field_gis_layers FOR UPDATE
  USING (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));
CREATE POLICY "Admin can delete field_gis_layers"
  ON field_gis_layers FOR DELETE
  USING (auth.role() = 'authenticated' AND get_my_role() = 'admin');

-- ============================================================
-- H5: Fix custom_map_layers — require authentication
-- ============================================================
DROP POLICY IF EXISTS "Users can view custom_map_layers" ON custom_map_layers;
DROP POLICY IF EXISTS "Users can insert custom_map_layers" ON custom_map_layers;
DROP POLICY IF EXISTS "Users can delete custom_map_layers" ON custom_map_layers;

CREATE POLICY "Anyone authenticated can read custom_map_layers"
  ON custom_map_layers FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Upload+ can insert custom_map_layers"
  ON custom_map_layers FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));
CREATE POLICY "Admin can delete custom_map_layers"
  ON custom_map_layers FOR DELETE
  USING (auth.role() = 'authenticated' AND get_my_role() = 'admin');

-- ============================================================
-- C3: Make storage buckets private
-- ============================================================
UPDATE storage.buckets SET public = false WHERE id = 'trial-photos';
UPDATE storage.buckets SET public = false WHERE id = 'trial-gis';

-- Replace open SELECT policies with authenticated-only
DROP POLICY IF EXISTS "Anyone can view trial photos" ON storage.objects;
CREATE POLICY "Authenticated users can view photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'trial-photos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Anyone can view gis files" ON storage.objects;
CREATE POLICY "Authenticated users can view gis files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'trial-gis' AND auth.role() = 'authenticated');

-- ============================================================
-- M5: Audit log table for data modifications
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  action      TEXT        NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  table_name  TEXT        NOT NULL,
  record_id   TEXT,
  old_values  JSONB,
  new_values  JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_log_table ON audit_log(table_name);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit logs; insert via SECURITY DEFINER trigger
CREATE POLICY "Admins can read audit_log"
  ON audit_log FOR SELECT
  USING (auth.role() = 'authenticated' AND get_my_role() = 'admin');

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (user_id, action, table_name, record_id, new_values)
    VALUES (auth.uid(), 'INSERT', TG_TABLE_NAME, NEW.id::text, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (user_id, action, table_name, record_id, old_values, new_values)
    VALUES (auth.uid(), 'UPDATE', TG_TABLE_NAME, NEW.id::text, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (user_id, action, table_name, record_id, old_values)
    VALUES (auth.uid(), 'DELETE', TG_TABLE_NAME, OLD.id::text, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Attach audit triggers to critical tables
CREATE TRIGGER audit_trials
  AFTER INSERT OR UPDATE OR DELETE ON trials
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_treatments
  AFTER INSERT OR UPDATE OR DELETE ON treatments
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_fields
  AFTER INSERT OR UPDATE OR DELETE ON fields
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Grant insert on audit_log to the trigger function (SECURITY DEFINER handles this)
-- but ensure authenticated users cannot directly write
CREATE POLICY "No direct insert to audit_log"
  ON audit_log FOR INSERT
  WITH CHECK (false);

-- ============================================================
-- Issue #2: Add role check to load_and_track RPC
-- The function is SECURITY DEFINER (bypasses RLS), so a readonly
-- user could call it directly to insert data. Add a guard.
-- ============================================================
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
  -- Role guard: only upload+ can call this function
  IF get_my_role() NOT IN ('admin', 'upload') THEN
    RAISE EXCEPTION 'Insufficient permissions: upload role required';
  END IF;

  -- Validate table name to prevent injection
  IF p_table_name NOT IN (
    'soil_health_samples', 'soil_chemistry', 'plot_data',
    'tissue_chemistry', 'sample_metadata'
  ) THEN
    RAISE EXCEPTION 'Invalid table name: %', p_table_name;
  END IF;

  -- Insert rows with ON CONFLICT DO UPDATE (upsert) based on the natural key.
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
    ON CONFLICT (trial_id, COALESCE(sample_no, ''), COALESCE(date, '1900-01-01'::date))
    DO UPDATE SET
      property = EXCLUDED.property,
      block = EXCLUDED.block,
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
    ON CONFLICT (trial_id, COALESCE(sample_no, ''), COALESCE(date, '1900-01-01'::date), COALESCE(metric, ''))
    DO UPDATE SET
      block = EXCLUDED.block,
      barcode = EXCLUDED.barcode,
      value = EXCLUDED.value,
      unit = EXCLUDED.unit,
      raw_data = EXCLUDED.raw_data;
    GET DIAGNOSTICS v_count = ROW_COUNT;

  ELSIF p_table_name = 'plot_data' THEN
    INSERT INTO plot_data (trial_id, plot, trt_number, rep, block, yield_t_ha, plant_count, vigour, disease_score, raw_data)
    SELECT
      p_trial_id,
      COALESCE(r->>'plot', ''),
      CASE WHEN r->>'trt_number' IS NOT NULL AND r->>'trt_number' != '' THEN (r->>'trt_number')::int ELSE NULL END,
      CASE WHEN r->>'rep' IS NOT NULL AND r->>'rep' != '' THEN (r->>'rep')::int ELSE NULL END,
      COALESCE(r->>'block', ''),
      CASE WHEN r->>'yield_t_ha' IS NOT NULL AND r->>'yield_t_ha' != '' THEN (r->>'yield_t_ha')::decimal ELSE NULL END,
      CASE WHEN r->>'plant_count' IS NOT NULL AND r->>'plant_count' != '' THEN (r->>'plant_count')::int ELSE NULL END,
      CASE WHEN r->>'vigour' IS NOT NULL AND r->>'vigour' != '' THEN (r->>'vigour')::decimal ELSE NULL END,
      CASE WHEN r->>'disease_score' IS NOT NULL AND r->>'disease_score' != '' THEN (r->>'disease_score')::decimal ELSE NULL END,
      r->'raw_data'
    FROM jsonb_array_elements(p_rows) AS r
    ON CONFLICT (trial_id, COALESCE(plot, ''), COALESCE(trt_number::text, ''), COALESCE(rep::text, ''))
    DO UPDATE SET
      block = EXCLUDED.block,
      yield_t_ha = EXCLUDED.yield_t_ha,
      plant_count = EXCLUDED.plant_count,
      vigour = EXCLUDED.vigour,
      disease_score = EXCLUDED.disease_score,
      raw_data = EXCLUDED.raw_data;
    GET DIAGNOSTICS v_count = ROW_COUNT;

  ELSIF p_table_name = 'tissue_chemistry' THEN
    INSERT INTO tissue_chemistry (trial_id, sample_no, date, tissue_type, block, barcode, metric, value, unit, raw_data)
    SELECT
      p_trial_id,
      COALESCE(r->>'sample_no', ''),
      CASE WHEN r->>'date' IS NOT NULL AND r->>'date' != '' THEN (r->>'date')::date ELSE NULL END,
      COALESCE(r->>'tissue_type', ''),
      COALESCE(r->>'block', ''),
      COALESCE(r->>'barcode', ''),
      COALESCE(r->>'metric', ''),
      CASE WHEN r->>'value' IS NOT NULL AND r->>'value' != '' THEN (r->>'value')::decimal ELSE NULL END,
      COALESCE(r->>'unit', ''),
      r->'raw_data'
    FROM jsonb_array_elements(p_rows) AS r
    ON CONFLICT (trial_id, COALESCE(sample_no, ''), COALESCE(date, '1900-01-01'::date), COALESCE(tissue_type, ''), COALESCE(metric, ''))
    DO UPDATE SET
      block = EXCLUDED.block,
      barcode = EXCLUDED.barcode,
      value = EXCLUDED.value,
      unit = EXCLUDED.unit,
      raw_data = EXCLUDED.raw_data;
    GET DIAGNOSTICS v_count = ROW_COUNT;

  ELSIF p_table_name = 'sample_metadata' THEN
    INSERT INTO sample_metadata (trial_id, assay_type, sample_no, date, block, treatment, metric, value, unit, raw_data)
    SELECT
      p_trial_id,
      COALESCE(r->>'assay_type', ''),
      COALESCE(r->>'sample_no', ''),
      CASE WHEN r->>'date' IS NOT NULL AND r->>'date' != '' THEN (r->>'date')::date ELSE NULL END,
      COALESCE(r->>'block', ''),
      CASE WHEN r->>'treatment' IS NOT NULL AND r->>'treatment' != '' THEN (r->>'treatment')::int ELSE NULL END,
      COALESCE(r->>'metric', ''),
      CASE WHEN r->>'value' IS NOT NULL AND r->>'value' != '' THEN (r->>'value')::decimal ELSE NULL END,
      COALESCE(r->>'unit', ''),
      r->'raw_data'
    FROM jsonb_array_elements(p_rows) AS r
    ON CONFLICT (trial_id, COALESCE(assay_type, ''), COALESCE(sample_no, ''), COALESCE(metric, ''))
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
  ON CONFLICT (trial_id, file_type)
  DO UPDATE SET has_data = true, last_updated = now();

  -- Mark raw_upload as loaded (if one was provided)
  IF p_raw_upload_id IS NOT NULL THEN
    UPDATE raw_uploads
    SET status = 'loaded', records_loaded = v_count
    WHERE id = p_raw_upload_id;
  END IF;

  v_result := jsonb_build_object('status', 'success', 'records', v_count);
  RETURN v_result;
END;
$$;

-- ============================================================
-- Issue #3: Restrict storage INSERT/UPDATE/DELETE to upload+ role
-- ============================================================
-- trial-photos INSERT
DROP POLICY IF EXISTS "Authenticated users can upload trial photos" ON storage.objects;
CREATE POLICY "Upload+ can upload trial photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'trial-photos' AND auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));

-- trial-photos DELETE
DROP POLICY IF EXISTS "Authenticated users can delete trial photos" ON storage.objects;
CREATE POLICY "Admin can delete trial photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'trial-photos' AND auth.role() = 'authenticated' AND get_my_role() = 'admin');

-- trial-gis INSERT
DROP POLICY IF EXISTS "Authenticated users can upload gis" ON storage.objects;
CREATE POLICY "Upload+ can upload gis"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'trial-gis' AND auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));

-- trial-gis UPDATE
DROP POLICY IF EXISTS "Authenticated users can update gis" ON storage.objects;
CREATE POLICY "Upload+ can update gis"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'trial-gis' AND auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'))
  WITH CHECK (bucket_id = 'trial-gis' AND auth.role() = 'authenticated' AND get_my_role() IN ('admin', 'upload'));

NOTIFY pgrst, 'reload schema';
