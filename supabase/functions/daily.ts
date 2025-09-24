import { serve } from 'https://deno.land/std/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0'

// Supabase setup
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Edge Function to get daily summary data from Supabase
 * GET /functions/v1/daily?fecha=YYYY-MM-DD
 * Returns consolidated data for a specific date from resumen_dia table
 */
serve(async (req) => {
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const fecha = url.searchParams.get("fecha");
  
  if (!fecha) {
    return new Response(
      JSON.stringify({ 
        error: "Missing fecha parameter", 
        example: "/functions/v1/daily?fecha=2025-01-15" 
      }), 
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return new Response(
      JSON.stringify({ 
        error: "Invalid date format", 
        expected: "YYYY-MM-DD" 
      }), 
      { status: 400, headers: { "content-type": "application/json" } }
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
        return new Response(
          JSON.stringify({ 
            error: "No data found for the specified date",
            date: fecha 
          }), 
          { status: 404, headers: { "content-type": "application/json" } }
        );
      }
      console.error("Supabase error:", error);
      return new Response(
        JSON.stringify({ error: "Database error" }), 
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(data), 
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal Server Error" }), 
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});
