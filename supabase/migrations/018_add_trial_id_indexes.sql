-- Add indexes on trial_id foreign keys for tables frequently queried by trial
-- These speed up the most common page loads (trial detail, dashboard, analytics)

CREATE INDEX IF NOT EXISTS idx_soil_chemistry_trial_id ON soil_chemistry(trial_id);
CREATE INDEX IF NOT EXISTS idx_soil_health_samples_trial_id ON soil_health_samples(trial_id);
CREATE INDEX IF NOT EXISTS idx_plot_data_trial_id ON plot_data(trial_id);
CREATE INDEX IF NOT EXISTS idx_treatments_trial_id ON treatments(trial_id);
CREATE INDEX IF NOT EXISTS idx_tissue_chemistry_trial_id ON tissue_chemistry(trial_id);
CREATE INDEX IF NOT EXISTS idx_management_log_trial_id ON management_log(trial_id);
CREATE INDEX IF NOT EXISTS idx_sample_metadata_trial_id ON sample_metadata(trial_id);
CREATE INDEX IF NOT EXISTS idx_trial_data_files_trial_id ON trial_data_files(trial_id);
CREATE INDEX IF NOT EXISTS idx_trial_photos_trial_id ON trial_photos(trial_id);
CREATE INDEX IF NOT EXISTS idx_custom_map_layers_trial_id ON custom_map_layers(trial_id);
