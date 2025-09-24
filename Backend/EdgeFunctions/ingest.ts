import { serve } from 'https://deno.land/std/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0'

// Supabase setup
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// InfluxDB config (si están presentes)
const INFLUX_URL = Deno.env.get("INFLUX_URL");
const INFLUX_ORG = Deno.env.get("INFLUX_ORG");
const INFLUX_BUCKET = Deno.env.get("INFLUX_BUCKET");
const INFLUX_TOKEN = Deno.env.get("INFLUX_TOKEN");

// Inserta en InfluxDB (o mock si no hay credenciales)
async function insertTemporalDB(ts: string, temperatura: number, humedad: number) {
  if (INFLUX_URL && INFLUX_ORG && INFLUX_BUCKET && INFLUX_TOKEN) {
    // Inserción real en InfluxDB usando su API
    const line = `readings temperatura=${temperatura},humedad=${humedad} ${Date.parse(ts) * 1_000_000}`; // timestamp en nanosegundos
    const url = `${INFLUX_URL}/api/v2/write?org=${encodeURIComponent(INFLUX_ORG)}&bucket=${encodeURIComponent(INFLUX_BUCKET)}&precision=ns`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Token ${INFLUX_TOKEN}`,
        "Content-Type": "text/plain",
      },
      body: line,
    });
    if (!res.ok) {
      console.error("Error writing to InfluxDB:", await res.text());
      throw new Error("InfluxDB insert failed");
    }
  } else {
    // MOCK: solo loguea
    console.log("Mock insert en serie temporal:", { ts, temperatura, humedad });
  }
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const { temperatura, humedad, timestamp } = await req.json();

  if (typeof temperatura !== "number" || typeof humedad !== "number") {
    return new Response("Invalid payload", { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10); // yyyy-mm-dd

  // 1. Upsert en tabla diaria
  await supabase
    .from("resumen_dia")
    .upsert({
      fecha: today,
      promedio_temperatura: temperatura,  // temporalmente último valor
      promedio_humedad: humedad,
      minimo_temperatura: temperatura // inicializa si no existe
    })
    .eq("fecha", today);

  // 2. Actualizar mínimo si es menor (en caso de que ya exista)
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

  // 3. Insertar en DB serie temporal (Influx o mock)
  try {
    await insertTemporalDB(timestamp, temperatura, humedad);
  } catch (err) {
    return new Response("Error writing to InfluxDB", { status: 500 });
  }

  return new Response("Data ingested", { status: 200 });
});
