import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type GoalCreateBody = {
  goalText: string;
  proofTypes?: string[];
  proofDescription?: string;
  smartGrade: {
    score: number;
    tips?: Record<string, string | null>;
  } | null;
  parsedGoal: {
    frequencyCount: number | null;
    frequencyUnit: "day" | "week" | "month" | null;
    durationValue: string | null;
  } | null;
  realityResult: {
    likelihood: number;
    pitfalls: string[];
    suggestions: string[];
  } | null;
};

const inferDurationType = (value: string | null | undefined) => {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.includes("to") || /\b(202\d|\d{4})\b/.test(trimmed) ? "date" : "count";
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
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid session", details: userError?.message }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body = (await req.json()) as GoalCreateBody;
    if (!body.goalText?.trim()) {
      return new Response(
        JSON.stringify({ error: "Goal text is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const proofTypes = Array.isArray(body.proofTypes) ? body.proofTypes : [];

    const goalPayload = {
      user_id: user.id,
      title: body.goalText.trim(),
      smart_score: body.smartGrade?.score ?? null,
      smart_tips: body.smartGrade?.tips ?? null,
      measurement_types: proofTypes,
      frequency_count: body.parsedGoal?.frequencyCount ?? null,
      frequency_unit: body.parsedGoal?.frequencyUnit ?? null,
      duration_type: inferDurationType(body.parsedGoal?.durationValue),
      duration_value: body.parsedGoal?.durationValue ?? null,
      ai_reality_check: body.realityResult ?? null,
      status: "pending",
    } as const;

    const { data: goalData, error: insertError } = await supabase
      .from("goals")
      .insert(goalPayload)
      .select("id")
      .maybeSingle();

    if (insertError) {
      console.error("[create-goal insert error]", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create goal", details: insertError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!goalData?.id) {
      return new Response(
        JSON.stringify({ error: "No goal id returned" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ id: goalData.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[create-goal error]", err);
    return new Response(
      JSON.stringify({ error: "Failed to create goal", details: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
