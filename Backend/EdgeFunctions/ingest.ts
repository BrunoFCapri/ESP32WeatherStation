import { serve } from 'https://deno.land/std/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

// Zona horaria de Argentina
const AR_TZ = 'America/Argentina/Buenos_Aires';

// Helpers de fecha/tiempo en zona horaria específica (sin dependencias externas)
function pad2(n: number | string) {
  return n.toString().padStart(2, '0');
}

function getZonedParts(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = dtf.formatToParts(date);
  const data: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') data[p.type] = p.value;
  }
  return {
    year: data.year,
    month: data.month,
    day: data.day,
    hour: data.hour,
    minute: data.minute,
    second: data.second
  };
}

// Devuelve el offset (en minutos) de la zona horaria para la fecha dada.
// Valor negativo para zonas "al oeste" (por ejemplo, Argentina ~ -180).
function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const { year, month, day, hour, minute, second } = getZonedParts(date, timeZone);
  // Construimos una fecha "como si" las partes zonales fueran UTC, para medir la diferencia
  const asUTC = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`);
  // Diferencia en minutos entre "pared" (zona) y UTC real del runtime
  const diffMinutes = (asUTC.getTime() - date.getTime()) / 60000;
  // Redondear para evitar fracciones de minuto por milisegundos
  return Math.round(diffMinutes);
}

function formatOffset(minutes: number) {
  // Asegurar minutos enteros
  const m = Math.round(minutes);
  const sign = m <= 0 ? '-' : '+';
  const abs = Math.abs(m);
  const hh = pad2(Math.floor(abs / 60));
  const mm = pad2(abs % 60);
  return `${sign}${hh}:${mm}`;
}

// YYYY-MM-DD en zona horaria dada
function formatYMDInTZ(date: Date, timeZone: string) {
  const { year, month, day } = getZonedParts(date, timeZone);
  return `${year}-${month}-${day}`;
}

// ISO 8601 con offset de la zona horaria dada (ej: 2025-10-16T12:34:56-03:00)
function toISOWithTZ(date: Date, timeZone: string) {
  const { year, month, day, hour, minute, second } = getZonedParts(date, timeZone);
  const offset = formatOffset(getTimeZoneOffsetMinutes(date, timeZone));
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`;
}

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
console.log("[Ingest] Zona horaria activa para cómputos diarios:", AR_TZ);

/**
 * Inserts sensor data into InfluxDB (time series database)
 * Requires all InfluxDB environment variables to be set
 */
async function insertTemporalDB(ts: string, temperatura: number, humedad: number) {
  const missingVars: string[] = [];
  if (!INFLUX_URL) missingVars.push("INFLUX_URL");
  if (!INFLUX_ORG) missingVars.push("INFLUX_ORG");
  if (!INFLUX_BUCKET) missingVars.push("INFLUX_BUCKET");
  if (!INFLUX_TOKEN) missingVars.push("INFLUX_TOKEN");
  if (missingVars.length > 0) {
    throw new Error(`Missing required InfluxDB environment variables: ${missingVars.join(", ")}`);
  }

  const parsed = Date.parse(ts);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid timestamp for InfluxDB: "${ts}"`);
  }

  const line = `readings temperatura=${temperatura},humedad=${humedad} ${parsed * 1_000_000}`;
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
 * Actualiza resumen diario en Supabase usando la zona horaria de Argentina
 * y almacena datos crudos en InfluxDB.
 */
serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" }
    });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch (_err) {
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

  if (!Number.isFinite(temperatura) || !Number.isFinite(humedad)) {
    return new Response(JSON.stringify({
      error: "Invalid payload values",
      detail: "temperatura y humedad deben ser números finitos"
    }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  // Fecha del "hoy" y timestamp por defecto en zona horaria de Argentina
  const now = new Date();
  const today = formatYMDInTZ(now, AR_TZ); // yyyy-mm-dd en AR
  const defaultTimestamp = toISOWithTZ(now, AR_TZ); // ISO con offset AR (ej: -03:00)

  // Si no nos pasan timestamp, usamos el de AR;
  // si lo pasan, lo usamos tal cual (se asume ISO válido)
  const finalTimestamp = timestamp || defaultTimestamp;

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
    console.log("[Ingest] Insertando lectura en InfluxDB", {
      finalTimestamp,
      temperatura,
      humedad
    });

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
      humedad,
      timezone: AR_TZ,
      fecha_resumen: today
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
