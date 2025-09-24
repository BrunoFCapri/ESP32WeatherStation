import { serve } from 'https://deno.land/std/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0'

// Supabase setup
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// InfluxDB config (required - no mock fallback)
const INFLUX_URL = Deno.env.get("INFLUX_URL");
const INFLUX_ORG = Deno.env.get("INFLUX_ORG");
const INFLUX_BUCKET = Deno.env.get("INFLUX_BUCKET");
const INFLUX_TOKEN = Deno.env.get("INFLUX_TOKEN");

/**
 * Inserts sensor data into InfluxDB (time series database)
 * Requires all InfluxDB environment variables to be set
 */
async function insertTemporalDB(ts: string, temperatura: number, humedad: number) {
  // Check for required environment variables
  const missingVars: string[] = [];
  if (!INFLUX_URL) missingVars.push("INFLUX_URL");
  if (!INFLUX_ORG) missingVars.push("INFLUX_ORG");
  if (!INFLUX_BUCKET) missingVars.push("INFLUX_BUCKET");
  if (!INFLUX_TOKEN) missingVars.push("INFLUX_TOKEN");

  if (missingVars.length > 0) {
    throw new Error(`Missing required InfluxDB environment variables: ${missingVars.join(", ")}`);
  }

  // Insert data into InfluxDB using line protocol
  const line = `readings temperatura=${temperatura},humedad=${humedad} ${Date.parse(ts) * 1_000_000}`; // timestamp in nanoseconds
  const url = `${INFLUX_URL}/api/v2/write?org=${encodeURIComponent(INFLUX_ORG!)}&bucket=${encodeURIComponent(INFLUX_BUCKET!)}&precision=ns`;
  
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Token ${INFLUX_TOKEN}`,
      "Content-Type": "text/plain",
    },
    body: line,
  });
  
  if (!res.ok) {
    const errorText = await res.text();
    console.error("Error writing to InfluxDB:", errorText);
    throw new Error(`InfluxDB insert failed: ${res.status} ${errorText}`);
  }
}

/**
 * Edge Function to ingest sensor data from ESP32
 * POST /functions/v1/ingest
 * Body: { temperatura: number, humedad: number, timestamp?: string }
 * 
 * Updates daily summary in Supabase and stores raw data in InfluxDB
 */
serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method Not Allowed" }), 
      { status: 405, headers: { "content-type": "application/json" } }
    );
  }

  let payload;
  try {
    payload = await req.json();
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Invalid JSON payload" }), 
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  const { temperatura, humedad, timestamp } = payload;

  // Validate required fields
  if (typeof temperatura !== "number" || typeof humedad !== "number") {
    return new Response(
      JSON.stringify({ 
        error: "Invalid payload", 
        required: { temperatura: "number", humedad: "number" },
        optional: { timestamp: "string (ISO format)" }
      }), 
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  // Use provided timestamp or current time
  const finalTimestamp = timestamp || new Date().toISOString();
  const today = new Date().toISOString().slice(0, 10); // yyyy-mm-dd

  try {
    // 1. Upsert daily summary in Supabase
    await supabase
      .from("resumen_dia")
      .upsert({
        fecha: today,
        promedio_temperatura: temperatura,  // temporary value until end-of-day processing
        promedio_humedad: humedad,
        minimo_temperatura: temperatura // initialize if doesn't exist
      })
      .eq("fecha", today);

    // 2. Update minimum temperature if current value is lower
    const { data: existing } = await supabase
      .from("resumen_dia")
      .select("minimo_temperatura")
      .eq("fecha", today)
      .single();

    if (existing && temperatura < existing.minimo_temperatura) {
      await supabase
        .from("resumen_dia")
        .update({ minimo_temperatura: temperatura })
        .eq("fecha", today);
    }

    // 3. Insert raw data into time series database (InfluxDB)
    await insertTemporalDB(finalTimestamp, temperatura, humedad);

    return new Response(
      JSON.stringify({ 
        message: "Data ingested successfully",
        timestamp: finalTimestamp,
        temperatura,
        humedad
      }), 
      { status: 200, headers: { "content-type": "application/json" } }
    );

  } catch (err) {
    console.error("Ingestion error:", err);
    
    // Check if it's an InfluxDB configuration error
    if (err instanceof Error && err.message.includes("Missing required InfluxDB")) {
      return new Response(
        JSON.stringify({ 
          error: "InfluxDB not configured", 
          detail: err.message 
        }), 
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }
    
    return new Response(
      JSON.stringify({ 
        error: "Failed to ingest data", 
        detail: err instanceof Error ? err.message : "Unknown error" 
      }), 
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});
