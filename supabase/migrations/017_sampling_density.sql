-- Add spacing_ha column to store hectare-based density for sampling plans
ALTER TABLE field_sampling_plans
  ADD COLUMN spacing_ha DECIMAL(10,2) DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN field_sampling_plans.spacing_ha IS
  'When set, indicates the plan was generated using density mode (ha per sample point)';
