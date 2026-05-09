ALTER TABLE course_config
ADD COLUMN IF NOT EXISTS course_reminder_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE course_config
ADD COLUMN IF NOT EXISTS course_reminder_hours_before integer NOT NULL DEFAULT 1;

ALTER TABLE course_config
ADD COLUMN IF NOT EXISTS course_reminder_flow jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE course_scheduling_insights
ADD COLUMN IF NOT EXISTS scheduled_date varchar(10);

ALTER TABLE course_scheduling_insights
ADD COLUMN IF NOT EXISTS scheduled_time varchar(5);

ALTER TABLE course_scheduling_insights
ADD COLUMN IF NOT EXISTS reminder_times_sent jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE course_scheduling_insights
ADD COLUMN IF NOT EXISTS reminder_sent boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_course_scheduling_insights_schedule
  ON course_scheduling_insights(user_id, status, scheduled_date, scheduled_time);
