# 📅 Daily Summary Cron Job Documentation

## Overview

This cron job automatically calculates daily averages for temperature and humidity from InfluxDB and updates the `resumen_dia` table in Supabase. It runs every day at 23:59 UTC to process the completed day's data.

## Components

### 1. Edge Function: `daily-summary-cron.ts`

**Location**: `/supabase/functions/daily-summary-cron.ts`

**Purpose**: 
- Queries InfluxDB for daily averages of the previous day
- Updates the `resumen_dia` table with calculated real averages
- Replaces temporary values with actual statistical data

**Usage**:
```bash
# Manual execution via curl
curl -X POST https://your-project.supabase.co/functions/v1/daily-summary-cron \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"date": "2024-09-23"}'  # Optional: specify date, defaults to previous day
```

### 2. Database Migration: `setup_daily_summary_cron.sql`

**Location**: `/supabase/migrations/20240924204500_setup_daily_summary_cron.sql`

**Purpose**:
- Enables `pg_cron` extension
- Creates the `call_daily_summary_cron()` function
- Schedules the cron job to run daily at 23:59 UTC
- Ensures `resumen_dia` table structure exists

## Setup Instructions

### 1. Deploy Edge Function

```bash
# Deploy the daily-summary-cron function
supabase functions deploy daily-summary-cron

# Verify deployment
supabase functions list
```

### 2. Run Database Migration

```bash
# Apply the migration to set up cron job
supabase db push

# Or manually run the migration
supabase db diff --file=setup_daily_summary_cron
```

### 3. Configure Environment Variables

Ensure these environment variables are set in your Supabase project:

```bash
# Set required secrets
supabase secrets set INFLUX_URL="https://your-influxdb-instance"
supabase secrets set INFLUX_ORG="your-org"  
supabase secrets set INFLUX_BUCKET="weather"
supabase secrets set INFLUX_TOKEN="your-influxdb-token"
supabase secrets set SUPABASE_URL="https://your-project.supabase.co"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

### 4. Verify Cron Job Setup

```sql
-- Check if cron job is scheduled
SELECT * FROM cron.job WHERE jobname = 'daily-summary-update';

-- Check cron job run history
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'daily-summary-update')
ORDER BY start_time DESC 
LIMIT 10;
```

## How It Works

### Data Flow

1. **23:59 UTC Daily**: pg_cron triggers `call_daily_summary_cron()`
2. **Function Call**: Database function calls the Edge Function
3. **InfluxDB Query**: Edge Function queries InfluxDB for previous day's averages
4. **Database Update**: Updates `resumen_dia` table with real calculated averages

### InfluxDB Query

The function queries InfluxDB using this Flux pattern:

```flux
from(bucket: "weather")
|> range(start: 2024-09-23T00:00:00Z, stop: 2024-09-23T23:59:59Z)
|> filter(fn: (r) => r._measurement == "readings")
|> filter(fn: (r) => r._field == "temperatura" or r._field == "humedad")
|> aggregateWindow(every: 1d, fn: mean, createEmpty: false)
|> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
```

### Database Update

Updates the `resumen_dia` table:

```sql
UPDATE resumen_dia 
SET 
  promedio_temperatura = <calculated_avg_temp>,
  promedio_humedad = <calculated_avg_humidity>,
  updated_at = NOW()
WHERE fecha = '<target_date>';
```

## Manual Testing

### Test the Edge Function

```bash
# Test with specific date
curl -X POST http://localhost:54321/functions/v1/daily-summary-cron \
  -H "Authorization: Bearer $(supabase status | grep 'service_role key' | awk '{print $3}')" \
  -H "Content-Type: application/json" \
  -d '{"date": "2024-09-23"}'
```

### Test the Database Function

```sql
-- Test the database function directly
SELECT call_daily_summary_cron();
```

### Run Cron Job Manually

```sql
-- Manually trigger the cron job (useful for testing)
SELECT cron.schedule('test-daily-summary', '* * * * *', 'SELECT call_daily_summary_cron();');

-- Remove test job after testing
SELECT cron.unschedule('test-daily-summary');
```

## Troubleshooting

### Check Cron Job Status

```sql
-- View all scheduled jobs
SELECT * FROM cron.job;

-- View recent job runs
SELECT * FROM cron.job_run_details 
ORDER BY start_time DESC 
LIMIT 20;

-- View failed runs only
SELECT * FROM cron.job_run_details 
WHERE status = 'failed'
ORDER BY start_time DESC;
```

### Common Issues

1. **Missing Environment Variables**: Check that all InfluxDB credentials are set
2. **Network Issues**: Ensure InfluxDB is accessible from Supabase
3. **Permission Issues**: Verify service role key has necessary permissions
4. **Time Zone Issues**: All times are in UTC - ensure data exists for the queried day

### Enable Detailed Logging

```sql
-- Enable more detailed cron logging (if available)
ALTER SYSTEM SET log_statement = 'all';
SELECT pg_reload_conf();
```

## Monitoring

### Key Metrics to Monitor

1. **Cron Job Success Rate**: Check `cron.job_run_details` for failures
2. **Data Completeness**: Verify `resumen_dia` is updated daily
3. **Function Performance**: Monitor Edge Function execution time
4. **InfluxDB Connectivity**: Ensure queries complete successfully

### Alerts Setup

Consider setting up alerts for:
- Cron job failures
- Missing daily data in `resumen_dia`
- InfluxDB connection issues
- Edge Function errors

## Migration and Rollback

### Disable Cron Job

```sql
-- Temporarily disable the cron job
SELECT cron.unschedule('daily-summary-update');
```

### Re-enable Cron Job

```sql
-- Re-enable the cron job
SELECT cron.schedule(
  'daily-summary-update',
  '59 23 * * *',
  'SELECT call_daily_summary_cron();'
);
```

### Complete Removal

```sql
-- Remove cron job and function
SELECT cron.unschedule('daily-summary-update');
DROP FUNCTION IF EXISTS call_daily_summary_cron();
```

## Performance Considerations

- **InfluxDB Query Optimization**: Uses daily aggregation for efficiency
- **Minimal Database Impact**: Only updates existing rows, doesn't insert new ones
- **Error Handling**: Comprehensive error handling prevents job crashes
- **Timezone Consistency**: All operations use UTC to avoid DST issues

## Security

- Uses service role key for authentication
- Database function runs with SECURITY DEFINER
- All secrets stored in Supabase secrets manager
- No sensitive data logged or exposed