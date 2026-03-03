import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type VoteBody = {
  proof_id: string;
  vote: "approve" | "dispute";
};

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

    const body = (await req.json()) as VoteBody;
    if (!body.proof_id || !["approve", "dispute"].includes(body.vote)) {
      return new Response(
        JSON.stringify({ error: "proof_id and vote ('approve' | 'dispute') are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Upsert vote
    const { error: voteError } = await supabase
      .from("proof_votes")
      .upsert(
        { proof_id: body.proof_id, voter_id: user.id, vote: body.vote },
        { onConflict: "proof_id,voter_id" }
      );
    if (voteError) {
      console.error("[vote-proof upsert error]", voteError);
      return new Response(
        JSON.stringify({ error: "Failed to record vote", details: voteError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Fetch proof to get goal_id
    const { data: proof, error: proofError } = await supabase
      .from("proofs")
      .select("id, goal_id, status")
      .eq("id", body.proof_id)
      .maybeSingle();
    if (proofError || !proof) {
      return new Response(
        JSON.stringify({ error: "Proof not found", details: proofError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Find challenge for this goal
    const { data: challenge, error: challengeError } = await supabase
      .from("challenges")
      .select("id")
      .eq("creator_goal_id", proof.goal_id)
      .maybeSingle();
    if (challengeError) {
      console.error("[vote-proof challenge lookup error]", challengeError);
    }

    // 4. Count total partners in challenge
    let total_partners = 1; // default: at least the submitter counts as 1 voter baseline
    if (challenge?.id) {
      const { count } = await supabase
        .from("challenge_participants")
        .select("*", { count: "exact", head: true })
        .eq("challenge_id", challenge.id);
      if (typeof count === "number" && count > 0) {
        total_partners = count;
      }
    }

    // 5. Count approve and dispute votes for this proof
    const { data: voteCounts } = await supabase
      .from("proof_votes")
      .select("vote")
      .eq("proof_id", body.proof_id);

    const approve_count = voteCounts?.filter((v) => v.vote === "approve").length ?? 0;
    const dispute_count = voteCounts?.filter((v) => v.vote === "dispute").length ?? 0;

    // 6. Majority calculation
    const threshold = Math.ceil(total_partners / 2);
    let updated_status: string = proof.status ?? "pending";

    if (approve_count >= threshold && approve_count > dispute_count) {
      updated_status = "approved";
    } else if (dispute_count >= threshold && dispute_count >= approve_count) {
      updated_status = "disputed";
    } else {
      updated_status = "pending";
    }

    // 7. Update proof status if changed
    if (updated_status !== proof.status) {
      const { error: updateError } = await supabase
        .from("proofs")
        .update({ status: updated_status })
        .eq("id", body.proof_id);
      if (updateError) {
        console.error("[vote-proof status update error]", updateError);
      }
    }

    return new Response(
      JSON.stringify({ proof_id: body.proof_id, status: updated_status, approve_count, dispute_count }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[vote-proof error]", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
