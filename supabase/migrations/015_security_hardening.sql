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

NOTIFY pgrst, 'reload schema';
