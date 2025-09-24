-- Enable the pg_cron extension to schedule cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a function that will call the Edge Function
CREATE OR REPLACE FUNCTION call_daily_summary_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  response_data jsonb;
BEGIN
  -- Call the Edge Function using http extension
  -- Note: In production, replace the URL with your actual Supabase project URL
  SELECT 
    net.http_post(
      url := current_setting('app.supabase_url', true) || '/functions/v1/daily-summary-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) INTO response_data;
  
  -- Log the result (optional)
  RAISE NOTICE 'Daily summary cron job completed with response: %', response_data;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Daily summary cron job failed: %', SQLERRM;
END;
$$;

-- Create the daily summary cron job that runs every day at 23:59 UTC
-- This will call our Edge Function via the database function
SELECT cron.schedule(
  'daily-summary-update',  -- job name
  '59 23 * * *',          -- cron expression: run at 23:59 every day (UTC)
  'SELECT call_daily_summary_cron();'
);

-- Add a comment to document this cron job
COMMENT ON FUNCTION call_daily_summary_cron IS 'Calls the daily-summary-cron Edge Function to update resumen_dia table with real averages from InfluxDB';

-- Create or recreate the resumen_dia table structure (if it doesn't exist)
CREATE TABLE IF NOT EXISTS resumen_dia (
  fecha DATE PRIMARY KEY,
  promedio_temperatura FLOAT NOT NULL,
  promedio_humedad FLOAT NOT NULL,
  minimo_temperatura FLOAT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create an updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create the trigger for updating updated_at on resumen_dia
DROP TRIGGER IF EXISTS update_resumen_dia_updated_at ON resumen_dia;
CREATE TRIGGER update_resumen_dia_updated_at
    BEFORE UPDATE ON resumen_dia
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant necessary permissions for the cron job to work
-- Note: In production, you would set up proper RLS policies
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT SELECT ON cron.job TO postgres;