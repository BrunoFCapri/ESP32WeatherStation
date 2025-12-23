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

// CORS configuration
const ALLOWED_ORIGIN = "https://clima-zero.vercel.app";

function buildCorsHeaders(origin: string): HeadersInit {
  const headers: Record<string, string> = {
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Max-Age": "86400",
  };
  if (origin === ALLOWED_ORIGIN) {
    headers["Access-Control-Allow-Origin"] = ALLOWED_ORIGIN;
  }
  return headers;
}

serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const requestId = crypto.randomUUID();
  
  try {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(origin),
      });
    }

    if (req.method !== "GET") {
      logError("Method not allowed", undefined, { requestId, method: req.method });
      return json({ error: "Method not allowed" }, 405, buildCorsHeaders(origin));
    }

    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const granularity = (url.searchParams.get("granularity") || "raw").toLowerCase();
    const statsParam = url.searchParams.get("stats") || "mean";
    
    logInfo("Request received", {
      requestId,
      from,
      to,
      granularity,
      stats: statsParam
    });

    if (!from || !to) {
      logError("Missing required parameters", undefined, {
        requestId,
        from: !!from,
        to: !!to
      });
      return json(
        {
          error: "Missing parameters",
          required: ["from", "to"],
          example: "/functions/v1/historic?from=2025-09-01T00:00:00Z&to=2025-09-02T00:00:00Z&granularity=1h&stats=mean,min,max",
        },
        400,
        buildCorsHeaders(origin)
      );
    }

    const g = normalizeGranularity(granularity);
    if (!g) {
      logError("Invalid granularity parameter", undefined, {
        requestId,
        granularity,
        allowed: ["raw", "1m", "5m", "15m", "1h", "1d"]
      });
      return json(
        {
          error: "Invalid granularity",
          allowed: ["raw", "1m", "5m", "15m", "1h", "1d"],
        },
        400,
        buildCorsHeaders(origin)
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
        logError("Invalid date range", undefined, {
          requestId,
          from,
          to,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        });
        return json(
          {
            error: "Invalid range",
            detail: "`from` must be strictly earlier than `to`",
          },
          400,
          buildCorsHeaders(origin)
        );
      }
    } catch (e) {
      logError("Date validation failed", e, {
        requestId,
        from,
        to
      });
      return json({ error: "Invalid date(s)", detail: String(e) }, 400, buildCorsHeaders(origin));
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
          logError("Invalid stats parameter", undefined, {
            requestId,
            invalidStat: st,
            providedStats: stats,
            allowed: ["mean", "min", "max"]
          });
          return json(
            {
              error: "Invalid stats parameter",
              invalid: st,
              allowed: ["mean", "min", "max"],
            },
            400,
            buildCorsHeaders(origin)
          );
        }
      }
      // Remove duplicates
      stats = Array.from(new Set(stats));
    }

    const samples = await fetchHistoricalData(from, to, g, stats, requestId);
    
    logInfo("Request completed successfully", {
      requestId,
      sampleCount: samples.length,
      granularity,
      stats: stats.length > 0 ? stats : undefined
    });

    return json(samples, 200, buildCorsHeaders(origin));
  } catch (e) {
    logError("Unhandled error in request handler", e, { requestId });
    return json({ error: "Internal Server Error", detail: String(e) }, 500, buildCorsHeaders(origin));
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
 * Structured logging utility for consistent log formatting
 */
function logInfo(message: string, context?: Record<string, unknown>): void {
  console.log(`[Historic] ${message}`, context || {});
}

function logError(message: string, error?: unknown, context?: Record<string, unknown>): void {
  console.error(`[Historic] ${message}`, {
    ...context,
    error: error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      name: error.name
    } : String(error)
  });
}

/**
 * Creates a JSON response with proper headers
 */
function json(body: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders as Record<string, string>)) {
      headers.set(k, v);
    }
  }
  return new Response(JSON.stringify(body), {
    status,
    headers,
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
  stats: string[],
  requestId: string
): Promise<StatSample[]> {
  const missingEnv: string[] = [];
  if (!INFLUX_URL) missingEnv.push("INFLUX_URL");
  if (!INFLUX_ORG) missingEnv.push("INFLUX_ORG");
  if (!INFLUX_BUCKET) missingEnv.push("INFLUX_BUCKET");
  if (!INFLUX_TOKEN) missingEnv.push("INFLUX_TOKEN");

  if (missingEnv.length > 0) {
    logError("Missing InfluxDB configuration", undefined, {
      requestId,
      missingVariables: missingEnv
    });
    throw new Error(
      "Missing InfluxDB environment variables: " + missingEnv.join(", ") + 
      ". This function requires InfluxDB to be properly configured."
    );
  }

  return await fetchFromInflux(from, to, g, stats, requestId);
}

/**
 * Executes Flux query against InfluxDB and processes results
 */
async function fetchFromInflux(
  from: string,
  to: string,
  g: Granularity,
  stats: string[],
  requestId: string
): Promise<StatSample[]> {
  const start = toRFC3339Z(from);
  const stop = toRFC3339Z(to);
  const every = granularityToFluxEvery(g);
  
  logInfo("Preparing InfluxDB query", {
    requestId,
    start,
    stop,
    granularity: g,
    stats: stats.length > 0 ? stats : undefined
  });

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
    logError("InfluxDB query failed", undefined, {
      requestId,
      status: resp.status,
      statusText: resp.statusText,
      url: url.replace(/org=[^&]*/, "org=***"),
      responseBody: text.substring(0, 500) // Limit response body size in logs
    });
    throw new Error(`InfluxDB query failed: ${resp.status} ${resp.statusText} - ${text}`);
  }

  logInfo("InfluxDB query successful", {
    requestId,
    status: resp.status
  });

  const csv = await resp.text();
  const samples = parseInfluxCSV(csv, g.unit !== "raw" && stats.length > 1);
  
  logInfo("CSV parsing completed", {
    requestId,
    sampleCount: samples.length
  });
  
  return samples;
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
