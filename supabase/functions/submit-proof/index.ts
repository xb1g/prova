import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ProofSubmitBody = {
  goal_id: string;
  media_url: string;
  media_type: "photo" | "video" | "text" | "voice";
  caption?: string;
};

function deriveStreakPeriod(frequencyUnit: string | null): string {
  const now = new Date();
  if (frequencyUnit === "day") {
    return now.toISOString().slice(0, 10); // YYYY-MM-DD
  }
  if (frequencyUnit === "week") {
    // ISO week: find Thursday of current week to determine year, then compute week number
    const date = new Date(now);
    date.setUTCHours(0, 0, 0, 0);
    // Set to nearest Thursday (ISO week starts Monday, Thursday determines the year)
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil(
      ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
    );
    const year = date.getUTCFullYear();
    const week = String(weekNum).padStart(2, "0");
    return `${year}-W${week}`;
  }
  if (frequencyUnit === "month") {
    return now.toISOString().slice(0, 7); // YYYY-MM
  }
  return now.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || null;
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid session", details: userError?.message }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = (await req.json()) as ProofSubmitBody;
    if (!body.goal_id || !body.media_url || !body.media_type) {
      return new Response(
        JSON.stringify({ error: "goal_id, media_url, and media_type are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate goal exists and belongs to the user
    const { data: goal, error: goalError } = await supabase
      .from("goals")
      .select("id, frequency_unit")
      .eq("id", body.goal_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (goalError || !goal) {
      return new Response(
        JSON.stringify({ error: "Goal not found or access denied" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const streak_period = deriveStreakPeriod(goal.frequency_unit);

    // Insert proof
    const { data: proof, error: proofError } = await supabase
      .from("proofs")
      .insert({
        goal_id: body.goal_id,
        user_id: user.id,
        media_url: body.media_url,
        media_type: body.media_type,
        caption: body.caption ?? null,
        status: "pending",
        streak_period,
      })
      .select("id")
      .maybeSingle();

    if (proofError || !proof) {
      console.error("[submit-proof insert error]", proofError);
      return new Response(
        JSON.stringify({ error: "Failed to insert proof", details: proofError?.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find challenge linked to this goal
    const { data: challenge } = await supabase
      .from("challenges")
      .select("id")
      .eq("creator_goal_id", body.goal_id)
      .maybeSingle();

    if (challenge) {
      // Fetch participants excluding the submitter
      const { data: participants } = await supabase
        .from("challenge_participants")
        .select("user_id")
        .eq("challenge_id", challenge.id)
        .neq("user_id", user.id);

      if (participants && participants.length > 0) {
        const participantIds = participants.map((p: { user_id: string }) => p.user_id);

        // Fetch push tokens for those participants
        const { data: pushTokenRows } = await supabase
          .from("push_tokens")
          .select("token")
          .in("user_id", participantIds);

        if (pushTokenRows && pushTokenRows.length > 0) {
          const messages = pushTokenRows.map((row: { token: string }) => ({
            to: row.token,
            title: "New proof submitted!",
            body: "Review your friend's proof",
          }));

          await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(messages),
          });
        }
      }
    }

    return new Response(
      JSON.stringify({ id: proof.id, streak_period }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[submit-proof error]", err);
    return new Response(
      JSON.stringify({ error: "Failed to submit proof", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
