import { GoogleGenerativeAI } from "npm:@google/generative-ai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SmartGradeResult = {
  score: number;
  scores: {
    specific: number;
    measurable: number;
    achievable: number;
    relevant: number;
    time_bound: number;
  };
  tips: {
    specific: string | null;
    measurable: string | null;
    achievable: string | null;
    relevant: string | null;
    time_bound: string | null;
  };
  degraded?: boolean;
};

const fallbackSmartGrade = (args: {
  goalText: string;
  proofTypes: string[];
  userProfile: { lifeAreas?: string[] | null; direction?: string | null; values?: string | null } | null;
  parsedFrequency: string | null;
}): SmartGradeResult => {
  const goalText = args.goalText.trim().toLowerCase();
  const hasProof = args.proofTypes.length > 0;
  const hasProfile = Boolean(args.userProfile?.lifeAreas?.length);
  const hasFrequency = Boolean(args.parsedFrequency?.trim());

  const specific = goalText.length > 90 ? 68 : goalText.length > 50 ? 58 : 45;
  const measurable = hasProof ? 46 : 22;
  const achievable = goalText.length > 35 ? 64 : 48;
  const relevant = hasProfile ? 64 : 25;
  const timeBound = hasFrequency ? 62 : 20;

  const score = Math.round((specific * 0.3) + (measurable * 0.2) + (achievable * 0.2) + (relevant * 0.2) + (timeBound * 0.1));

  return {
    score,
    scores: {
      specific,
      measurable,
      achievable,
      relevant,
      time_bound: timeBound,
    },
    tips: {
      specific: specific >= 75 ? null : "Clarify exactly what you will do and by when.",
      measurable: hasProof ? null : "Select a proof type to grade this.",
      achievable: achievable >= 75 ? null : "Narrow the commitment to something realistic first.",
      relevant: hasProfile ? null : "Complete onboarding to grade relevance.",
      time_bound: hasFrequency ? null : "Add a clear frequency like '3× a week'.",
    },
    degraded: true,
  };
};

const isQuotaError = (err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  const lowered = message.toLowerCase();
  const status = (err as { status?: number }).status ?? (err as { statusCode?: number }).statusCode;
  return status === 429
    || lowered.includes("429")
    || lowered.includes("too many requests")
    || lowered.includes("quota");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let body: {
    goalText?: unknown;
    proofTypes?: unknown;
    proofDescription?: unknown;
    userProfile?: { lifeAreas?: string[] | null; direction?: string | null; values?: string | null } | null;
    parsedFrequency?: unknown;
  } | null = null;

  try {
    const genAI = new GoogleGenerativeAI(Deno.env.get("AI_SDK_GEMINI_KEY")!);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    body = await req.json();
    const {
      goalText: rawGoalText,
      proofTypes = [],
      proofDescription = "",
      userProfile = null,
      parsedFrequency = null,
    } = body as {
      goalText?: string;
      proofTypes?: string[];
      proofDescription?: string;
      userProfile?: { lifeAreas?: string[] | null; direction?: string | null; values?: string | null } | null;
      parsedFrequency?: string | null;
    };
    const safeGoalText = typeof rawGoalText === "string" ? rawGoalText : "";
    const safeProofTypes = Array.isArray(proofTypes) ? proofTypes : [];
    const safeProofDescription = typeof proofDescription === "string" ? proofDescription : "";
    const safeUserProfile = userProfile && typeof userProfile === "object" ? userProfile : null;
    const safeParsedFrequency = parsedFrequency && typeof parsedFrequency === "string" ? parsedFrequency : null;

    if (!safeGoalText || safeGoalText.trim().length < 5) {
      return new Response(
        JSON.stringify({ score: 0, scores: { specific: 0, measurable: 0, achievable: 0, relevant: 0, time_bound: 0 }, tips: {} }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const proofContext = safeProofTypes.length > 0
      ? `Proof types selected: ${safeProofTypes.join(", ")}${safeProofDescription ? `. Description: "${safeProofDescription}"` : ""}`
      : "No proof type selected yet.";

    const profileContext = safeUserProfile
      ? `User profile: focuses on ${safeUserProfile.lifeAreas?.join(", ")}. Direction: ${safeUserProfile.direction}. Values: ${safeUserProfile.values}.`
      : "No user profile available.";

    const frequencyContext = safeParsedFrequency
      ? `Frequency extracted from goal: ${safeParsedFrequency}`
      : "No frequency or time commitment found in the goal text.";

    const result = await model.generateContent(
      `Evaluate this goal on all 5 SMART dimensions.

Goal: "${safeGoalText}"
${proofContext}
${profileContext}
${frequencyContext}

Scoring rules:
- S (Specific): How clearly defined is the action/outcome?
- M (Measurable): Score 0-30 if no proof type selected. Score based on how well the selected proof type + description actually proves the goal was done.
- A (Achievable): Is this realistic? Consider frequency if provided.
- R (Relevant): Score 0 and tip "Complete onboarding to grade this" if no user profile. Otherwise score how well the goal aligns with their life areas, direction, and values.
- T (Time-bound): Score 0-20 if no frequency extracted. Score based on how specific the time commitment is.

Respond with JSON only, no explanation:
{
  "score": <0-100 integer, weighted average>,
  "scores": {
    "specific": <0-100>,
    "measurable": <0-100>,
    "achievable": <0-100>,
    "relevant": <0-100>,
    "time_bound": <0-100>
  },
  "tips": {
    "specific": <null if score >= 75, else one short tip>,
    "measurable": <"Select a proof type to grade this" if no proof, null if score >= 75, else tip>,
    "achievable": <null if score >= 75, else tip>,
    "relevant": <"Complete onboarding to grade this" if no profile, null if score >= 75, else tip>,
    "time_bound": <"Add a frequency to your goal, e.g. '3× a week'" if nothing extracted, null if score >= 75, else tip>
  }}`
    );

    const raw = result.response.text();
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "");
    const parsed = JSON.parse(cleaned);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[smart-grade error]", err);
    if (isQuotaError(err)) {
      const fallback = body
        ? fallbackSmartGrade({
            goalText: typeof body.goalText === "string" ? body.goalText : "",
            proofTypes: Array.isArray((body as { proofTypes?: unknown }).proofTypes)
              ? ((body as { proofTypes?: string[] }).proofTypes || [])
              : [],
            userProfile: typeof body.userProfile === "object" && body.userProfile ? body.userProfile : null,
            parsedFrequency: typeof body.parsedFrequency === "string" ? body.parsedFrequency : null,
          })
        : {
            score: 50,
            scores: { specific: 50, measurable: 25, achievable: 55, relevant: 40, time_bound: 20 },
            tips: {
              specific: "Clarify your goal to improve scoring.",
              measurable: "Select a proof type to grade this.",
              achievable: "Keep this commitment realistic and time-bound.",
              relevant: "Complete onboarding to grade relevance.",
              time_bound: "Add a clear frequency like '3× a week'.",
            },
            degraded: true,
          };

      return new Response(
        JSON.stringify(fallback),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "grading failed", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
