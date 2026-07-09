ALTER TABLE course_config
ADD COLUMN IF NOT EXISTS scheduling_tracker_enabled boolean NOT NULL DEFAULT false;
