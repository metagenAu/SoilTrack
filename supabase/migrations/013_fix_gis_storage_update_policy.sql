-- Fix: add missing UPDATE policy on storage.objects for the trial-gis bucket.
-- The client uploads with upsert:true which requires UPDATE permission.
-- Without this policy, uploads fail with "new row violates row-level security policy".

CREATE POLICY "Authenticated users can update gis"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'trial-gis' AND auth.role() = 'authenticated')
  WITH CHECK (bucket_id = 'trial-gis' AND auth.role() = 'authenticated');
