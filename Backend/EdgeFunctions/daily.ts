serve(async (req) => {
  const url = new URL(req.url);
  const fecha = url.searchParams.get("fecha");
  if (!fecha) return new Response("Missing fecha", { status: 400 });

  const { data, error } = await supabase
    .from("resumen_dia")
    .select("*")
    .eq("fecha", fecha)
    .single();

  if (error) return new Response(error.message, { status: 500 });
  return new Response(JSON.stringify(data), { status: 200 });
});
