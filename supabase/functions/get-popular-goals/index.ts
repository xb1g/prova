import postgres from "npm:postgres";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const sql = postgres(Deno.env.get("SUPABASE_DB_URL") || "", {
      prepare: false,
    });

    const rows = await sql<{ title_lower: string; title: string; count: string }[]>`
      SELECT lower(title) as title_lower, title, COUNT(*) as count
      FROM goals
      GROUP BY lower(title), title
      ORDER BY count DESC
      LIMIT 20
    `;

    await sql.end();

    // Deduplicate by lower(title), keeping the canonical title with highest count
    const seen = new Map<string, { title: string; count: number }>();
    for (const row of rows) {
      const key = row.title_lower;
      const count = Number(row.count);
      if (!seen.has(key) || count > seen.get(key)!.count) {
        seen.set(key, { title: row.title, count });
      }
    }

    const result = Array.from(seen.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)
      .map(({ title, count }) => ({ title, count }));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[get-popular-goals error]", err);
    return new Response(
      JSON.stringify({ error: "Failed to fetch popular goals", details: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
