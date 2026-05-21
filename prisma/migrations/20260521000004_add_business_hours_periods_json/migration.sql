-- Add periodsJson to business_hours for multiple time periods per day (lunch + dinner splits)
ALTER TABLE "business_hours" ADD COLUMN IF NOT EXISTS "periodsJson" JSONB;
