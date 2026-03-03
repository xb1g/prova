import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type InviteBody = {
  goal_id: string;
  identifier: string; // email or username
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // --- Auth ---
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

    // --- Validate body ---
    const body = (await req.json()) as InviteBody;
    if (!body.goal_id?.trim() || !body.identifier?.trim()) {
      return new Response(
        JSON.stringify({ error: "goal_id and identifier are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Verify caller owns the goal ---
    const { data: goal, error: goalError } = await supabase
      .from("goals")
      .select("id")
      .eq("id", body.goal_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (goalError || !goal) {
      return new Response(
        JSON.stringify({ error: "Goal not found or access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Look up invitee ---
    // 1. Try username match in user_profiles (future-proof; no username col yet — skipped gracefully)
    let inviteeId: string | null = null;

    const { data: profileMatch } = await supabase
      .from("user_profiles")
      .select("user_id")
      .eq("username" as never, body.identifier)
      .maybeSingle();

    if (profileMatch?.user_id) {
      inviteeId = profileMatch.user_id;
    }

    // 2. Fallback: email lookup via auth admin
    if (!inviteeId) {
      const { data: userList } = await supabase.auth.admin.listUsers();
      const match = userList?.users?.find(
        (u) => u.email?.toLowerCase() === body.identifier.toLowerCase()
      );
      if (match) inviteeId = match.id;
    }

    if (!inviteeId) {
      return new Response(
        JSON.stringify({ error: "User not found for the given identifier" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prevent self-invite
    if (inviteeId === user.id) {
      return new Response(
        JSON.stringify({ error: "Cannot invite yourself" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Find or create challenge ---
    let challengeId: string;

    const { data: existingChallenge } = await supabase
      .from("challenges")
      .select("id")
      .eq("creator_goal_id", body.goal_id)
      .maybeSingle();

    if (existingChallenge?.id) {
      challengeId = existingChallenge.id;
    } else {
      const { data: newChallenge, error: challengeError } = await supabase
        .from("challenges")
        .insert({ creator_goal_id: body.goal_id, status: "waiting" })
        .select("id")
        .single();

      if (challengeError || !newChallenge) {
        console.error("[invite-to-goal] create challenge error", challengeError);
        return new Response(
          JSON.stringify({ error: "Failed to create challenge", details: challengeError?.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      challengeId = newChallenge.id;
    }

    // --- Insert participant (ignore duplicate) ---
    const { error: participantError } = await supabase
      .from("challenge_participants")
      .upsert(
        { challenge_id: challengeId, user_id: inviteeId, status: "invited" },
        { onConflict: "challenge_id,user_id", ignoreDuplicates: true }
      );

    if (participantError) {
      console.error("[invite-to-goal] participant insert error", participantError);
      return new Response(
        JSON.stringify({ error: "Failed to add participant", details: participantError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Push notification (best-effort) ---
    const { data: pushRow } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("user_id", inviteeId)
      .maybeSingle();

    if (pushRow?.token) {
      try {
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: pushRow.token,
            title: "You've been invited! 🎯",
            body: "Someone invited you to join a challenge on Prova.",
            data: { challenge_id: challengeId },
          }),
        });
      } catch (pushErr) {
        console.warn("[invite-to-goal] push notification failed", pushErr);
      }
    }

    return new Response(
      JSON.stringify({ success: true, invited_user_id: inviteeId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[invite-to-goal] unexpected error", err);
    return new Response(
      JSON.stringify({ error: "Unexpected error", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
