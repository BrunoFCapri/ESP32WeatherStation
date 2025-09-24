import { serve } from 'https://deno.land/std/http/server.ts'

/**
 * Edge Function for historical data queries with granularity and statistics support
 * GET /functions/v1/historic?from=ISO8601&to=ISO8601&granularity=raw|1m|5m|15m|1h|1d&stats=mean,min,max
 * 
 * Requires InfluxDB credentials - no mock fallback
 * 
 * Parameters:
 *   from (ISO8601, required) - Start date/time
 *   to (ISO8601, required) - End date/time (must be > from)  
 *   granularity (optional) - Data aggregation level: raw|1m|5m|15m|1h|1d (default: raw)
 *   stats (optional) - Statistics to calculate: mean,min,max (default: mean, only applies if granularity != raw)
 *
 * Response formats:
 * - Raw data: [{ "ts": "ISO8601", "temperatura": number, "humedad": number }]
 * - Single stat: [{ "ts": "ISO8601", "temperatura": number, "humedad": number }]  
 * - Multiple stats: [{ "ts": "ISO8601", "stat": "mean|min|max", "temperatura": number, "humedad": number }]
 */

serve(async (req: Request) => {
  try {
    if (req.method !== "GET") {
      return json({ error: "Method not allowed" }, 405);
    }

    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const granularity = (url.searchParams.get("granularity") || "raw").toLowerCase();
    const statsParam = url.searchParams.get("stats") || "mean";

    if (!from || !to) {
      return json(
        {
          error: "Missing parameters",
          required: ["from", "to"],
          example: "/functions/v1/historic?from=2025-09-01T00:00:00Z&to=2025-09-02T00:00:00Z&granularity=1h&stats=mean,min,max",
        },
        400
      );
    }

    const g = normalizeGranularity(granularity);
    if (!g) {
      return json(
        {
          error: "Invalid granularity",
          allowed: ["raw", "1m", "5m", "15m", "1h", "1d"],
        },
        400
      );
    }

    // Date validation
    let startDate: Date;
    let endDate: Date;
    try {
      startDate = new Date(from);
      endDate = new Date(to);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error("Invalid date format");
      }
      if (startDate >= endDate) {
        return json(
          {
            error: "Invalid range",
            detail: "`from` must be strictly earlier than `to`",
          },
          400
        );
      }
    } catch (e) {
      return json({ error: "Invalid date(s)", detail: String(e) }, 400);
    }

    // Parse and validate stats (only if NOT raw)
    let stats: string[] = [];
    if (g.unit === "raw") {
      stats = []; // not used
    } else {
      stats = statsParam
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0);
      const allowed = new Set(["mean", "min", "max"]);
      if (stats.length === 0) {
        stats = ["mean"];
      }
      for (const st of stats) {
        if (!allowed.has(st)) {
          return json(
            {
              error: "Invalid stats parameter",
              invalid: st,
              allowed: ["mean", "min", "max"],
            },
            400
          );
        }
      }
      // Remove duplicates
      stats = Array.from(new Set(stats));
    }

    const samples = await fetchHistoricalData(from, to, g, stats);

    return json(samples, 200);
  } catch (e) {
    console.error("Unhandled error:", e);
    return json({ error: "Internal Server Error", detail: String(e) }, 500);
  }
});

// TypeScript type definitions
type Sample = { ts: string; temperatura: number; humedad: number };
type StatSample = Sample & { stat?: string };
type GranularityRaw = { unit: "raw" };
type GranularityAggregated = { unit: "minute" | "hour" | "day"; size: number };
type Granularity = GranularityRaw | GranularityAggregated;

// InfluxDB environment variables (required - no fallback)
const INFLUX_URL = Deno.env.get("INFLUX_URL");
const INFLUX_ORG = Deno.env.get("INFLUX_ORG");
const INFLUX_BUCKET = Deno.env.get("INFLUX_BUCKET");
const INFLUX_TOKEN = Deno.env.get("INFLUX_TOKEN");

/**
 * Creates a JSON response with proper headers
 */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * Normalizes granularity string into structured format
 */
function normalizeGranularity(input: string): Granularity | null {
  if (input === "raw") return { unit: "raw" };
  const map: Record<string, GranularityAggregated> = {
    "1m": { unit: "minute", size: 1 },
    "5m": { unit: "minute", size: 5 },
    "15m": { unit: "minute", size: 15 },
    "1h": { unit: "hour", size: 1 },
    "1d": { unit: "day", size: 1 },
  };
  return map[input] ?? null;
}

/**
 * Converts date string to RFC3339 format (ISO with Z)
 */
function toRFC3339Z(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) throw new Error("Invalid date: " + s);
  return d.toISOString();
}

/**
 * Converts granularity to Flux aggregation period
 */
function granularityToFluxEvery(g: Granularity): string | null {
  if (g.unit === "raw") return null;
  if (g.unit === "minute") return `${g.size}m`;
  if (g.unit === "hour") return `${g.size}h`;
  if (g.unit === "day") return `${g.size}d`;
  return null;
}

/**
 * Main function to fetch historical data from InfluxDB
 */
async function fetchHistoricalData(
  from: string,
  to: string,
  g: Granularity,
  stats: string[]
): Promise<StatSample[]> {
  const missingEnv: string[] = [];
  if (!INFLUX_URL) missingEnv.push("INFLUX_URL");
  if (!INFLUX_ORG) missingEnv.push("INFLUX_ORG");
  if (!INFLUX_BUCKET) missingEnv.push("INFLUX_BUCKET");
  if (!INFLUX_TOKEN) missingEnv.push("INFLUX_TOKEN");

  if (missingEnv.length > 0) {
    throw new Error(
      "Missing InfluxDB environment variables: " + missingEnv.join(", ") + 
      ". This function requires InfluxDB to be properly configured."
    );
  }

  return await fetchFromInflux(from, to, g, stats);
}

/**
 * Executes Flux query against InfluxDB and processes results
 */
async function fetchFromInflux(
  from: string,
  to: string,
  g: Granularity,
  stats: string[]
): Promise<StatSample[]> {
  const start = toRFC3339Z(from);
  const stop = toRFC3339Z(to);
  const every = granularityToFluxEvery(g);

  let flux: string;

  if (g.unit === "raw") {
    // Raw data query (no aggregation)
    flux = `from(bucket: "${INFLUX_BUCKET}")
  |> range(start: time(v: "${start}"), stop: time(v: "${stop}"))
  |> filter(fn: (r) => r._measurement == "readings")
  |> filter(fn: (r) => r._field == "temperatura" or r._field == "humedad")
  |> keep(columns: ["_time","_field","_value"])
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> sort(columns: ["_time"])`;
  } else {
    // Aggregated data query with statistics
    const pipelines = stats.map((st) => {
      const fnMap: Record<string, string> = {
        mean: "mean",
        min: "min",
        max: "max",
      };
      const fn = fnMap[st];
      return `
  data
    |> aggregateWindow(every: ${every}, fn: ${fn}, createEmpty: false)
    |> set(key: "_stat", value: "${st}")
    |> keep(columns: ["_time","_field","_value","_stat"])`;
    });

    flux = `data = from(bucket: "${INFLUX_BUCKET}")
  |> range(start: time(v: "${start}"), stop: time(v: "${stop}"))
  |> filter(fn: (r) => r._measurement == "readings")
  |> filter(fn: (r) => r._field == "temperatura" or r._field == "humedad")
  
union(tables: [${pipelines.join(",")}])
  |> pivot(rowKey: ["_time","_stat"], columnKey: ["_field"], valueColumn: "_value")
  |> sort(columns: ["_time","_stat"])`;
  }

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
  return parseInfluxCSV(csv, g.unit !== "raw" && stats.length > 1);
}

/**
 * Parses CSV response from InfluxDB into structured data
 */
function parseInfluxCSV(csv: string, hasStat: boolean): StatSample[] {
  const lines = csv
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0 && !l.startsWith("#"));
  if (lines.length === 0) return [];
  
  const header = lines[0].split(",");
  const idxTime = header.indexOf("_time");
  const idxTemp = header.indexOf("temperatura");
  const idxHum = header.indexOf("humedad");
  const idxStat = header.indexOf("_stat");

  if (idxTime === -1) return [];

  const out: StatSample[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < header.length) continue;
    
    const ts = cols[idxTime];
    const tStr = idxTemp >= 0 ? cols[idxTemp] : "";
    const hStr = idxHum >= 0 ? cols[idxHum] : "";
    const temperatura = tStr ? Number(tStr) : NaN;
    const humedad = hStr ? Number(hStr) : NaN;
    
    if (!isNaN(temperatura) && !isNaN(humedad)) {
      if (hasStat && idxStat >= 0) {
        out.push({
          ts,
          stat: cols[idxStat], // Include stat field when multiple statistics requested
          temperatura,
          humedad,
        });
      } else {
        out.push({ ts, temperatura, humedad });
      }
    }
  }
  return out;
}
