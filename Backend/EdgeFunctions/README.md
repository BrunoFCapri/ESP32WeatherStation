# Edge Functions Documentation

This directory contains Supabase Edge Functions for the ESP32 Weather Station project. These functions provide a centralized API layer between the ESP32 sensors and the web interface.

## Functions Overview

### 1. `ingest.ts` - Data Ingestion
**Endpoint:** `POST /functions/v1/ingest`

Receives sensor data from ESP32 devices and:
- Validates the payload
- Updates daily summary in Supabase
- Stores raw data in InfluxDB time series database

**Request Body:**
```json
{
  "temperatura": 25.5,
  "humedad": 60.2,
  "timestamp": "2025-01-15T10:30:00Z" // optional, defaults to current time
}
```

**Response:**
```json
{
  "message": "Data ingested successfully",
  "timestamp": "2025-01-15T10:30:00Z",
  "temperatura": 25.5,
  "humedad": 60.2
}
```

### 2. `daily.ts` - Daily Summary Data
**Endpoint:** `GET /functions/v1/daily?fecha=YYYY-MM-DD`

Returns consolidated daily data from Supabase's `resumen_dia` table.

**Parameters:**
- `fecha` (required): Date in YYYY-MM-DD format

**Response:**
```json
{
  "fecha": "2025-01-15",
  "promedio_temperatura": 24.8,
  "minimo_temperatura": 18.2,
  "promedio_humedad": 62.5
}
```

### 3. `historic.ts` - Historical Data
**Endpoint:** `GET /functions/v1/historic`

Returns historical data from InfluxDB with support for aggregation and statistics.

**Parameters:**
- `from` (required): Start date/time in ISO 8601 format
- `to` (required): End date/time in ISO 8601 format  
- `granularity` (optional): Data aggregation level
  - Values: `raw` (default), `1m`, `5m`, `15m`, `1h`, `1d`
- `stats` (optional): Statistics to calculate when granularity ≠ raw
  - Values: `mean` (default), `min`, `max` (comma-separated)

**Examples:**
```bash
# Raw data
GET /functions/v1/historic?from=2025-01-15T00:00:00Z&to=2025-01-16T00:00:00Z

# Hourly averages
GET /functions/v1/historic?from=2025-01-15T00:00:00Z&to=2025-01-16T00:00:00Z&granularity=1h

# Daily min/max/mean
GET /functions/v1/historic?from=2025-01-01T00:00:00Z&to=2025-01-08T00:00:00Z&granularity=1d&stats=min,max,mean
```

**Response Formats:**

Single statistic or raw data:
```json
[
  { "ts": "2025-01-15T00:00:00Z", "temperatura": 22.3, "humedad": 49.8 }
]
```

Multiple statistics:
```json
[
  { "ts": "2025-01-15T00:00:00Z", "stat": "mean", "temperatura": 22.3, "humedad": 49.8 },
  { "ts": "2025-01-15T00:00:00Z", "stat": "min", "temperatura": 21.9, "humedad": 48.7 },
  { "ts": "2025-01-15T00:00:00Z", "stat": "max", "temperatura": 22.9, "humedad": 50.4 }
]
```

## Environment Variables Required

All functions require these Supabase environment variables:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The `ingest` and `historic` functions also require these InfluxDB variables:
- `INFLUX_URL`
- `INFLUX_ORG`  
- `INFLUX_BUCKET`
- `INFLUX_TOKEN`

## Error Handling

All functions return JSON error responses with appropriate HTTP status codes:

- `400 Bad Request`: Invalid parameters or payload
- `404 Not Found`: Resource not found (daily function)
- `405 Method Not Allowed`: Wrong HTTP method
- `500 Internal Server Error`: Database or processing errors

Example error response:
```json
{
  "error": "Missing parameters",
  "required": ["from", "to"],
  "example": "/functions/v1/historic?from=2025-01-01T00:00:00Z&to=2025-01-02T00:00:00Z"
}
```

## Deployment

These functions are designed to be deployed as Supabase Edge Functions. Set the required environment variables using:

```bash
supabase secrets set SUPABASE_URL="https://your-project.supabase.co"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
supabase secrets set INFLUX_URL="https://your-influx-host"
supabase secrets set INFLUX_ORG="your_org"
supabase secrets set INFLUX_BUCKET="weather"
supabase secrets set INFLUX_TOKEN="your_token"
```

Then deploy with:
```bash
supabase functions deploy ingest
supabase functions deploy daily
supabase functions deploy historic
```