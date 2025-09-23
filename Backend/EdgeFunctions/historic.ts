// Nota: este archivo es un mock para una Edge Function.
// Implementa soporte de granularidad para resultados agregados.

// deno-lint-ignore no-explicit-any
serve(async (req: any) => {
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const granularity = (url.searchParams.get("granularity") || "raw").toLowerCase();

  if (!from || !to) return new Response("Missing parameters", { status: 400 });

  const g = normalizeGranularity(granularity);
  if (!g) {
    return new Response(
      `Invalid granularity. Use one of: raw, 1m, 5m, 15m, 1h, 1d`,
      { status: 400 }
    );
  }

  // En una implementación real, aquí se consultaría el TSDB/S3
  const raw = await fetchHistoricalDataFromS3(from, to);
  const result = g.unit === "raw" ? raw : aggregateByGranularity(raw, g);
  return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
});

type Sample = { ts: string; temperatura: number; humedad: number };

function normalizeGranularity(input: string):
  | { unit: "raw" }
  | { unit: "minute" | "hour" | "day"; size: number } | null {
  if (input === "raw") return { unit: "raw" } as const;
  const map: Record<string, { unit: "minute" | "hour" | "day"; size: number }> = {
    "1m": { unit: "minute", size: 1 },
    "5m": { unit: "minute", size: 5 },
    "15m": { unit: "minute", size: 15 },
    "1h": { unit: "hour", size: 1 },
    "1d": { unit: "day", size: 1 },
  };
  return map[input] ?? null;
}

function floorDateToBucket(d: Date, unit: "minute" | "hour" | "day", size: number): Date {
  const t = new Date(d); // copy
  t.setUTCSeconds(0, 0);
  if (unit === "minute") {
    const m = t.getUTCMinutes();
    t.setUTCMinutes(m - (m % size));
  } else if (unit === "hour") {
    t.setUTCMinutes(0);
    const h = t.getUTCHours();
    t.setUTCHours(h - (h % size));
  } else if (unit === "day") {
    t.setUTCHours(0, 0, 0, 0);
  }
  return t;
}

function isoUTC(d: Date): string {
  return new Date(d).toISOString();
}

function aggregateByGranularity(data: Sample[], g: { unit: "minute" | "hour" | "day"; size: number }): Sample[] {
  const buckets = new Map<string, { sumT: number; sumH: number; n: number }>();
  for (const s of data) {
    const dt = new Date(s.ts);
    const bucket = floorDateToBucket(dt, g.unit, g.size);
    const key = isoUTC(bucket);
    const acc = buckets.get(key) || { sumT: 0, sumH: 0, n: 0 };
    acc.sumT += s.temperatura;
    acc.sumH += s.humedad;
    acc.n += 1;
    buckets.set(key, acc);
  }
  const out: Sample[] = [];
  for (const [key, acc] of buckets) {
    out.push({ ts: key, temperatura: acc.sumT / acc.n, humedad: acc.sumH / acc.n });
  }
  // Ordenar por ts ascendente
  out.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  return out;
}

// Función mock de ejemplo: devuelve datos crudos cada 5 minutos dentro del rango solicitado
async function fetchHistoricalDataFromS3(from: string, to: string): Promise<Sample[]> {
  const start = new Date(from);
  const end = new Date(to);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error("Invalid date range");
  }
  const out: Sample[] = [];
  const stepMs = 5 * 60 * 1000; // 5 minutos
  for (let t = start.getTime(); t <= end.getTime(); t += stepMs) {
    // Valores simulados con pequeñas variaciones
    const baseT = 22;
    const baseH = 50;
    const noiseT = Math.sin(t / 3.6e6) * 0.5 + (Math.random() - 0.5) * 0.2;
    const noiseH = Math.cos(t / 3.6e6) * 1.0 + (Math.random() - 0.5) * 0.5;
    out.push({ ts: new Date(t).toISOString(), temperatura: baseT + noiseT, humedad: baseH + noiseH });
  }
  return out;
}
