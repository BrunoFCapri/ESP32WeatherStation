# 🚀 Deployment Guide - Daily Summary Cron Job

## Quick Start

This guide walks you through deploying the daily summary cron job that automatically calculates daily averages from InfluxDB and updates the `resumen_dia` table.

## Prerequisites

- Supabase CLI installed and configured
- InfluxDB instance with weather data
- Supabase project with proper credentials

## Step 1: Setup Project Structure

The repository now includes a proper Supabase project structure:

```
supabase/
├── config.toml                 # Supabase configuration
├── functions/                  # Edge Functions
│   ├── daily-summary-cron.ts   # New cron job function
│   ├── daily.ts                # Existing daily summary endpoint  
│   ├── historic.ts             # Existing historical data endpoint
│   └── ingest.ts               # Existing data ingestion endpoint
├── migrations/                 # Database migrations
│   └── 20240924204500_setup_daily_summary_cron.sql
├── CRON_JOB_README.md          # Detailed documentation
└── test-cron-function.sh       # Test script
```

## Step 2: Configure Environment Variables

Set up the required environment variables in your Supabase project:

```bash
# Navigate to project root (where supabase/config.toml is located)
cd /path/to/your/project

# Set InfluxDB credentials
supabase secrets set INFLUX_URL="https://your-influxdb-instance.com"
supabase secrets set INFLUX_ORG="your-organization"
supabase secrets set INFLUX_BUCKET="weather"
supabase secrets set INFLUX_TOKEN="your-influxdb-token"

# Set Supabase credentials (if not already set)
supabase secrets set SUPABASE_URL="https://your-project.supabase.co"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

## Step 3: Apply Database Migration

Apply the migration to set up the cron job:

```bash
# Link to your Supabase project
supabase link --project-ref your-project-ref

# Push the migration to your database
supabase db push
```

This will:
- Enable the `pg_cron` extension
- Create the `call_daily_summary_cron()` function
- Schedule the cron job to run daily at 23:59 UTC
- Ensure the `resumen_dia` table structure exists

## Step 4: Deploy Edge Functions

Deploy all Edge Functions, including the new cron job:

```bash
# Deploy all functions
supabase functions deploy

# Or deploy just the cron job function
supabase functions deploy daily-summary-cron
```

## Step 5: Verify Deployment

### Check Cron Job Status

Connect to your database and verify the cron job is scheduled:

```sql
-- Check if cron job is scheduled
SELECT * FROM cron.job WHERE jobname = 'daily-summary-update';

-- Should show:
-- jobid | schedule   | command                        | nodename | nodeport | database | username | active | jobname
-- 1     | 59 23 * * *| SELECT call_daily_summary_cron();| localhost| 5432     | postgres | postgres | t      | daily-summary-update
```

### Test the Function Manually

```bash
# Run the test script
./supabase/test-cron-function.sh

# Or test manually with curl
curl -X POST https://your-project.supabase.co/functions/v1/daily-summary-cron \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"date": "2024-09-23"}'
```

### Verify Database Updates

Check that the `resumen_dia` table is being updated:

```sql
-- Check recent updates to resumen_dia
SELECT * FROM resumen_dia 
ORDER BY fecha DESC 
LIMIT 10;

-- Check the updated_at timestamps to see when records were last updated
SELECT fecha, updated_at, promedio_temperatura, promedio_humedad 
FROM resumen_dia 
WHERE updated_at > NOW() - INTERVAL '7 days'
ORDER BY fecha DESC;
```

## Step 6: Monitor and Troubleshoot

### View Cron Job History

```sql
-- Check recent cron job runs
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'daily-summary-update')
ORDER BY start_time DESC 
LIMIT 20;

-- Check for failed runs
SELECT * FROM cron.job_run_details 
WHERE status = 'failed' 
ORDER BY start_time DESC;
```

### Check Edge Function Logs

Go to your Supabase dashboard → Edge Functions → daily-summary-cron → Logs to see execution details.

## Success Indicators

✅ **Cron job scheduled**: Query `cron.job` shows the scheduled job
✅ **Function deploys successfully**: No errors during `supabase functions deploy`
✅ **Manual test passes**: Test script or manual curl request returns success
✅ **Database updates**: `resumen_dia` table shows updated records with recent `updated_at` timestamps
✅ **Automated execution**: Cron job runs daily and updates data automatically

## Common Issues and Solutions

### 1. Missing InfluxDB Credentials
**Error**: "Missing required InfluxDB environment variables"
**Solution**: Ensure all InfluxDB secrets are set properly

### 2. Cron Job Not Scheduled
**Error**: No entries in `cron.job` table
**Solution**: Re-run the database migration: `supabase db push`

### 3. Function Deployment Fails
**Error**: TypeScript compilation errors
**Solution**: Check function syntax and Deno imports

### 4. No Data Found in InfluxDB
**Error**: "No data found in InfluxDB for the specified date"
**Solution**: Verify InfluxDB has data for the queried date range

## Support

For detailed troubleshooting and advanced configuration, see:
- `/supabase/CRON_JOB_README.md` - Complete documentation
- `/Backend/README.md` - Updated API documentation

## Next Steps

Once deployed successfully, the system will:
1. **Automatically run** every day at 23:59 UTC
2. **Query InfluxDB** for the previous day's temperature and humidity averages
3. **Update Supabase** `resumen_dia` table with real calculated averages
4. **Replace temporary values** with accurate daily statistics

Your weather station now has fully automated daily summary processing! 🎉