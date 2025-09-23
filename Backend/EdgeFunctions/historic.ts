// Nota: Edge Function con soporte de granularidad.
// Integra InfluxDB (S4R) vía API Flux si hay credenciales; si no, usa mock.

// Declaraciones para evitar errores de tipos en entornos sin Deno typings.
// Estas APIs existen en tiempo de ejecución dentro de Supabase Edge / Deno.
// deno-lint-ignore no-explicit-any
declare const Deno: any;
// deno-lint-ignore no-explicit-any
declare const serve: any;

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

  const raw = await fetchHistoricalData(from, to, g);
  const result = g.unit === "raw" || (Array.isArray(raw) && isAggregated(raw, g))
    ? raw
    : aggregateByGranularity(raw as Sample[], g);
  return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
});

type Sample = { ts: string; temperatura: number; humedad: number };

// Env de InfluxDB (S4R)
const INFLUX_URL = Deno.env.get("INFLUX_URL"); // ej: https://influx.example.com
const INFLUX_ORG = Deno.env.get("INFLUX_ORG");
const INFLUX_BUCKET = Deno.env.get("INFLUX_BUCKET");
const INFLUX_TOKEN = Deno.env.get("INFLUX_TOKEN");

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

// Orquestador: intenta Influx; si no hay config, usa mock
async function fetchHistoricalData(from: string, to: string, g: { unit: "raw" } | { unit: "minute" | "hour" | "day"; size: number }): Promise<Sample[]> {
  const hasInflux = !!(INFLUX_URL && INFLUX_ORG && INFLUX_BUCKET && INFLUX_TOKEN);
  if (hasInflux) {
    try {
      const influx = await fetchFromInflux(from, to, g);
      return influx;
    } catch (e) {
      console.error("Influx query failed, falling back to mock:", e);
      return fetchMockData(from, to);
    }
  }
  return fetchMockData(from, to);
}

function isAggregated(_data: Sample[] | unknown, g: { unit: "raw" } | { unit: "minute" | "hour" | "day"; size: number }): boolean {
  // Si viene de Influx con aggregateWindow ya aplicado, no re-agregamos.
  // Este mock asume que Influx ya aplica la agregación cuando g != raw.
  return g.unit !== "raw";
}

function toRFC3339Z(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) throw new Error("Invalid date: " + s);
  return d.toISOString();
}

function granularityToFluxEvery(g: { unit: "raw" } | { unit: "minute" | "hour" | "day"; size: number }): string | null {
  if ((g as any).unit === "raw") return null;
  const gg = g as { unit: "minute" | "hour" | "day"; size: number };
  if (gg.unit === "minute") return `${gg.size}m`;
  if (gg.unit === "hour") return `${gg.size}h`;
  if (gg.unit === "day") return `${gg.size}d`;
  return null;
}

async function fetchFromInflux(from: string, to: string, g: { unit: "raw" } | { unit: "minute" | "hour" | "day"; size: number }): Promise<Sample[]> {
  const start = toRFC3339Z(from);
  const stop = toRFC3339Z(to);
  const every = granularityToFluxEvery(g);

  // Construimos una consulta Flux que devuelve columnas pivotadas: _time, temperatura, humedad
  // Measurement: "readings" con fields: temperatura, humedad
  const aggregate = every
    ? `|> aggregateWindow(every: ${every}, fn: mean, createEmpty: false)`
    : "";

  const flux = `from(bucket: "${INFLUX_BUCKET}")
  |> range(start: time(v: "${start}"), stop: time(v: "${stop}"))
  |> filter(fn: (r) => r._measurement == "readings")
  |> filter(fn: (r) => r._field == "temperatura" or r._field == "humedad")
  ${aggregate}
  |> keep(columns: ["_time","_field","_value"]) 
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> sort(columns: ["_time"])`;

  const url = `${INFLUX_URL!.replace(/\/$/, "")}/api/v2/query?org=${encodeURIComponent(INFLUX_ORG!)}`;
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
    throw new Error(`Influx error ${resp.status}: ${text}`);
  }
  const csv = await resp.text();
  return parseInfluxCSV(csv);
}

function parseInfluxCSV(csv: string): Sample[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0 && !l.startsWith("#"));
  if (lines.length === 0) return [];
  const header = lines[0].split(",");
  const idxTime = header.indexOf("_time");
  const idxTemp = header.indexOf("temperatura");
  const idxHum = header.indexOf("humedad");
  if (idxTime === -1) return [];

  const out: Sample[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < header.length) continue;
    const ts = cols[idxTime];
    const tStr = idxTemp >= 0 ? cols[idxTemp] : "";
    const hStr = idxHum >= 0 ? cols[idxHum] : "";
    const temperatura = tStr ? Number(tStr) : NaN;
    const humedad = hStr ? Number(hStr) : NaN;
    if (!isNaN(temperatura) && !isNaN(humedad)) {
      out.push({ ts, temperatura, humedad });
    }
  }
  return out;
}

// Función mock: genera datos crudos cada 5 minutos dentro del rango solicitado
async function fetchMockData(from: string, to: string): Promise<Sample[]> {
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
