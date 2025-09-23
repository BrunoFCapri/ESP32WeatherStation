import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Función simulada para insertar en la DB serie temporal (S3 compatible)
async function insertTemporalDB(ts: string, temperatura: number, humedad: number) {
  // Ejemplo pseudo-código, depende de tu TSDB o bucket S3
  console.log("Insertar en serie temporal:", { ts, temperatura, humedad });
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

  // 3. Insertar en DB serie temporal (S3)
  await insertTemporalDB(timestamp, temperatura, humedad);

  return new Response("Data ingested", { status: 200 });
});
