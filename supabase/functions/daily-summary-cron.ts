import { serve } from 'https://deno.land/std/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0'

/**
 * Daily Summary Cron Job Edge Function
 * 
 * This function is designed to be run at the end of each day to:
 * 1. Query InfluxDB for the real daily averages of temperatura and humedad
 * 2. Update the resumen_dia table with the calculated averages
 * 
 * Should be scheduled to run daily at 23:59 UTC via Supabase cron job
 * 
 * Accepts POST requests with optional 'date' parameter in body (YYYY-MM-DD format)
 * If no date provided, processes the previous day (relative to UTC)
 */

// Supabase setup
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// InfluxDB config (required - no mock fallback)
const INFLUX_URL = Deno.env.get("INFLUX_URL");
const INFLUX_ORG = Deno.env.get("INFLUX_ORG");
const INFLUX_BUCKET = Deno.env.get("INFLUX_BUCKET");
const INFLUX_TOKEN = Deno.env.get("INFLUX_TOKEN");

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method Not Allowed. Use POST." }), 
        { status: 405, headers: { "content-type": "application/json" } }
      );
    }

    // Check for required InfluxDB environment variables
    const missingVars: string[] = [];
    if (!INFLUX_URL) missingVars.push("INFLUX_URL");
    if (!INFLUX_ORG) missingVars.push("INFLUX_ORG");
    if (!INFLUX_BUCKET) missingVars.push("INFLUX_BUCKET");
    if (!INFLUX_TOKEN) missingVars.push("INFLUX_TOKEN");

    if (missingVars.length > 0) {
      return new Response(
        JSON.stringify({ 
          error: "Missing required InfluxDB environment variables", 
          missing: missingVars 
        }), 
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    // Parse request body to get optional date parameter
    let targetDate: string;
    try {
      const body = await req.json();
      targetDate = body.date || getPreviousDay();
    } catch {
      // If no body or invalid JSON, use previous day
      targetDate = getPreviousDay();
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      return new Response(
        JSON.stringify({ 
          error: "Invalid date format", 
          expected: "YYYY-MM-DD",
          provided: targetDate
        }), 
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    console.log(`Processing daily summary for date: ${targetDate}`);

    // Query InfluxDB for daily averages
    const dailyAverages = await getDailyAveragesFromInfluxDB(targetDate);
    
    if (!dailyAverages) {
      return new Response(
        JSON.stringify({ 
          error: "No data found in InfluxDB for the specified date",
          date: targetDate
        }), 
        { status: 404, headers: { "content-type": "application/json" } }
      );
    }

    // Update Supabase resumen_dia table with real averages
    const { error: updateError } = await supabase
      .from("resumen_dia")
      .update({
        promedio_temperatura: dailyAverages.promedio_temperatura,
        promedio_humedad: dailyAverages.promedio_humedad
      })
      .eq("fecha", targetDate);

    if (updateError) {
      console.error("Error updating resumen_dia:", updateError);
      return new Response(
        JSON.stringify({ 
          error: "Failed to update daily summary",
          details: updateError.message
        }), 
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        message: "Daily summary updated successfully",
        date: targetDate,
        averages: dailyAverages
      }), 
      { status: 200, headers: { "content-type": "application/json" } }
    );

  } catch (err) {
    console.error("Unexpected error in daily summary cron:", err);
    return new Response(
      JSON.stringify({ 
        error: "Internal Server Error",
        details: err instanceof Error ? err.message : String(err)
      }), 
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});

/**
 * Gets the previous day in YYYY-MM-DD format (UTC)
 */
function getPreviousDay(): string {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday.toISOString().slice(0, 10);
}

/**
 * Queries InfluxDB for daily averages of temperatura and humedad
 */
async function getDailyAveragesFromInfluxDB(date: string): Promise<{ promedio_temperatura: number, promedio_humedad: number } | null> {
  // Construct the time range for the full day (UTC)
  const startTime = `${date}T00:00:00Z`;
  const endTime = `${date}T23:59:59Z`;

  // Build Flux query for daily averages
  const flux = `from(bucket: "${INFLUX_BUCKET}")
  |> range(start: time(v: "${startTime}"), stop: time(v: "${endTime}"))
  |> filter(fn: (r) => r._measurement == "readings")
  |> filter(fn: (r) => r._field == "temperatura" or r._field == "humedad")
  |> aggregateWindow(every: 1d, fn: mean, createEmpty: false)
  |> keep(columns: ["_time","_field","_value"])
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")`;

  const url = `${INFLUX_URL!.replace(/\/$/, "")}/api/v2/query?org=${encodeURIComponent(
    INFLUX_ORG!
  )}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${INFLUX_TOKEN}`,
      "Content-Type": "application/vnd.flux",
      Accept: "application/csv",
    },
    body: flux,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`InfluxDB query failed: ${resp.status} ${resp.statusText} - ${text}`);
  }

  const csv = await resp.text();
  console.log(`InfluxDB response for ${date}:`, csv);
  
  // Parse CSV response
  const lines = csv
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0 && !l.startsWith("#"));
  
  if (lines.length < 2) {
    // No data found
    return null;
  }
  
  const header = lines[0].split(",");
  const idxTemp = header.indexOf("temperatura");
  const idxHum = header.indexOf("humedad");

  if (idxTemp === -1 || idxHum === -1) {
    return null;
  }

  // Get the first data line (should be only one for daily aggregation)
  const cols = lines[1].split(",");
  if (cols.length < header.length) {
    return null;
  }

  const tStr = cols[idxTemp];
  const hStr = cols[idxHum];
  const promedio_temperatura = tStr ? Number(tStr) : NaN;
  const promedio_humedad = hStr ? Number(hStr) : NaN;

  if (isNaN(promedio_temperatura) || isNaN(promedio_humedad)) {
    return null;
  }

  return {
    promedio_temperatura,
    promedio_humedad
  };
}