import { serve } from 'https://deno.land/std/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0'

// Supabase setup
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

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

function json(body: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders as Record<string, string>)) {
      headers.set(k, v);
    }
  }
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * Edge Function to get daily summary data from Supabase
 * GET /functions/v1/daily?fecha=YYYY-MM-DD
 * Returns consolidated data for a specific date from resumen_dia table
 */
serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: buildCorsHeaders(origin) });
  }

  if (req.method !== "GET") {
    return json({ error: "Method Not Allowed" }, 405, buildCorsHeaders(origin));
  }

  const url = new URL(req.url);
  const fecha = url.searchParams.get("fecha");
  
  if (!fecha) {
    return json(
      { 
        error: "Missing fecha parameter", 
        example: "/functions/v1/daily?fecha=2025-01-15" 
      },
      400,
      buildCorsHeaders(origin)
    );
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return json(
      { 
        error: "Invalid date format", 
        expected: "YYYY-MM-DD" 
      },
      400,
      buildCorsHeaders(origin)
    );
  }

  try {
    const { data, error } = await supabase
      .from("resumen_dia")
      .select("*")
      .eq("fecha", fecha)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No data found for this date
        return json(
          { 
            error: "No data found for the specified date",
            date: fecha 
          },
          404,
          buildCorsHeaders(origin)
        );
      }
      console.error("Supabase error:", error);
      return json({ error: "Database error" }, 500, buildCorsHeaders(origin));
    }

    return json(data, 200, buildCorsHeaders(origin));
  } catch (err) {
    console.error("Unexpected error:", err);
    return json({ error: "Internal Server Error" }, 500, buildCorsHeaders(origin));
  }
});
