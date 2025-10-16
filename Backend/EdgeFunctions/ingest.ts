import { serve } from 'https://deno.land/std/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

// Supabase setup
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseKey);

// InfluxDB config (required - no mock fallback)
const INFLUX_URL = Deno.env.get("INFLUX_URL");
const INFLUX_ORG = Deno.env.get("INFLUX_ORG");
const INFLUX_BUCKET = Deno.env.get("INFLUX_BUCKET");
const INFLUX_TOKEN = Deno.env.get("INFLUX_TOKEN");

console.log("[Ingest] Estado configuración InfluxDB", {
  urlConfigurada: Boolean(INFLUX_URL),
  orgConfigurada: Boolean(INFLUX_ORG),
  bucketConfigurado: Boolean(INFLUX_BUCKET),
  tokenPresente: Boolean(INFLUX_TOKEN)
});

/**
 * Inserts sensor data into InfluxDB (time series database)
 * Requires all InfluxDB environment variables to be set
 */
async function insertTemporalDB(ts, temperatura, humedad) {
  const missingVars = [];
  if (!INFLUX_URL) missingVars.push("INFLUX_URL");
  if (!INFLUX_ORG) missingVars.push("INFLUX_ORG");
  if (!INFLUX_BUCKET) missingVars.push("INFLUX_BUCKET");
  if (!INFLUX_TOKEN) missingVars.push("INFLUX_TOKEN");
  if (missingVars.length > 0) {
    throw new Error(`Missing required InfluxDB environment variables: ${missingVars.join(", ")}`);
  }

  const line = `readings temperatura=${temperatura},humedad=${humedad} ${Date.parse(ts) * 1_000_000}`;
  const url = `${INFLUX_URL}/api/v2/write?org=${encodeURIComponent(INFLUX_ORG)}&bucket=${encodeURIComponent(INFLUX_BUCKET)}&precision=ns`;

  console.debug("[Ingest] Payload line protocol", { line });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Token ${INFLUX_TOKEN}`,
      "Content-Type": "text/plain"
    },
    body: line
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("Error writing to InfluxDB:", errorText);
    let reason = `InfluxDB insert failed: ${res.status} ${errorText}`;
    if (res.status === 401 || res.status === 403) {
      reason += " - Verifique que el token tenga permisos de escritura y que org/bucket sean correctos.";
    }
    throw new Error(reason);
  }

  console.debug("[Ingest] InfluxDB write OK", {
    status: res.status,
    statusText: res.statusText
  });
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
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" }
    });
  }

  let payload;
  try {
    payload = await req.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid JSON payload" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  console.log("[Ingest] Payload recibido:", payload);
  const { temperatura, humedad, timestamp } = payload;

  if (typeof temperatura !== "number" || typeof humedad !== "number") {
    return new Response(JSON.stringify({
      error: "Invalid payload",
      required: { temperatura: "number", humedad: "number" },
      optional: { timestamp: "string (ISO format)" }
    }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  const finalTimestamp = timestamp || new Date().toISOString();
  const today = new Date().toISOString().slice(0, 10); // yyyy-mm-dd

  try {
    // 1) Upsert SOLO de promedios: siempre se pisan con el último valor.
    //    No incluimos minimo_temperatura para no tocarlo en conflictos.
    console.log(`[Ingest] Upsert promedios para ${today}`);
    const { error: resumenUpsertError } = await supabase
      .from("resumen_dia")
      .upsert(
        {
          fecha: today,
          promedio_temperatura: temperatura,
          promedio_humedad: humedad
        },
        { onConflict: "fecha" }
      );

    if (resumenUpsertError) {
      console.error(`[Ingest] Error en upsert promedios para ${today}`, resumenUpsertError);
      throw resumenUpsertError;
    }

    // 2) Actualizar mínimo SOLO si es menor o si está NULL (condicional, evita SELECT previo).
    console.log(`[Ingest] Actualizando mínimo condicional para ${today}`);
    const { error: minimoUpdateError } = await supabase
      .from("resumen_dia")
      .update({ minimo_temperatura: temperatura })
      .eq("fecha", today)
      .or(`minimo_temperatura.is.null,minimo_temperatura.gt.${temperatura}`);

    if (minimoUpdateError) {
      console.error(`[Ingest] Error actualizando mínimo para ${today}`, minimoUpdateError);
      throw minimoUpdateError;
    }

    // 3) Insertar crudo en InfluxDB
    console.log("[Ingest] Insertando lectura en InfluxDB", { finalTimestamp, temperatura, humedad });
    try {
      await insertTemporalDB(finalTimestamp, temperatura, humedad);
      console.log("[Ingest] Inserción en InfluxDB completada");
    } catch (influxErr) {
      console.error("[Ingest] Error al insertar en InfluxDB", influxErr);
      throw influxErr;
    }

    return new Response(JSON.stringify({
      message: "Data ingested successfully",
      timestamp: finalTimestamp,
      temperatura,
      humedad
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch (err) {
    console.error("Ingestion error:", err);

    if (err instanceof Error && err.message.includes("Missing required InfluxDB")) {
      return new Response(JSON.stringify({
        error: "InfluxDB not configured",
        detail: err.message
      }), {
        status: 500,
        headers: { "content-type": "application/json" }
      });
    }

    return new Response(JSON.stringify({
      error: "Failed to ingest data",
      detail: err instanceof Error ? err.message : "Unknown error"
    }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
});
