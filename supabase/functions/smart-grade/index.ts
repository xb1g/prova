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

type DimensionResult = { score: number; tip: string | null };

const gradeDimension = async (
  model: ReturnType<InstanceType<typeof GoogleGenerativeAI>["getGenerativeModel"]>,
  dimension: "specific" | "measurable" | "achievable" | "relevant" | "time_bound",
  goalText: string,
  proofContext: string,
  profileContext: string,
  frequencyContext: string,
): Promise<DimensionResult> => {
  const prompts: Record<string, string> = {
    specific: `Score how SPECIFIC this goal is (0-100).
Goal: "${goalText}"
A specific goal clearly defines WHAT will be done, WHERE, and sometimes HOW.
Score 90-100: crystal clear action with clear outcome.
Score 60-89: mostly clear but missing some specificity.
Score 30-59: vague, could mean many things.
Score 0-29: very vague or unclear.
Respond JSON only: {"score": <0-100>, "tip": <null if score>=75, else one actionable tip under 15 words>}`,

    measurable: `Score how MEASURABLE this goal is (0-100).
Goal: "${goalText}"
Proof type selected: ${proofContext}
If no proof type: cap score at 25.
A measurable goal has clear success criteria you can verify.
Does the proof type actually prove this goal was completed?
Respond JSON only: {"score": <0-100>, "tip": <null if score>=75, else tip>}`,

    achievable: `Score how ACHIEVABLE this goal is (0-100).
Goal: "${goalText}"
Frequency: ${frequencyContext}
Consider: Is the commitment realistic for a busy person? Too easy scores lower.
Score 90-100: challenging but clearly doable.
Score 60-89: probably doable with effort.
Score 30-59: might be too hard or too vague to assess.
Score 0-29: unrealistic for most people.
Respond JSON only: {"score": <0-100>, "tip": <null if score>=75, else tip>}`,

    relevant: `Score how RELEVANT this goal is to the user's life (0-100).
Goal: "${goalText}"
${profileContext}
If no user profile: return {"score": 0, "tip": "Complete onboarding to grade relevance"}
Otherwise: does this goal align with their stated life areas, direction, and values?
Respond JSON only: {"score": <0-100>, "tip": <null if score>=75, else tip>}`,

    time_bound: `Score how TIME-BOUND this goal is (0-100).
Goal: "${goalText}"
Extracted frequency: ${frequencyContext}
A time-bound goal has a clear frequency (e.g. "3x per week") and/or an end date.
If no frequency extracted: cap at 25.
Score 90-100: clear frequency AND deadline.
Score 60-89: clear frequency but no deadline.
Score 25-59: vague timing.
Score 0-24: no time commitment.
Respond JSON only: {"score": <0-100>, "tip": <null if score>=75, else tip>}`,
  };

  try {
    const result = await model.generateContent(prompts[dimension]);
    const raw = result.response.text();
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "");
    return JSON.parse(cleaned) as DimensionResult;
  } catch {
    return { score: 50, tip: "Could not grade this dimension" };
  }
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

    const [specific, measurable, achievable, relevant, timeBound] = await Promise.all([
      gradeDimension(model, "specific", safeGoalText, proofContext, profileContext, frequencyContext),
      gradeDimension(model, "measurable", safeGoalText, proofContext, profileContext, frequencyContext),
      gradeDimension(model, "achievable", safeGoalText, proofContext, profileContext, frequencyContext),
      gradeDimension(model, "relevant", safeGoalText, proofContext, profileContext, frequencyContext),
      gradeDimension(model, "time_bound", safeGoalText, proofContext, profileContext, frequencyContext),
    ]);

    console.log("[smart-grade] S:", specific);
    console.log("[smart-grade] M:", measurable);
    console.log("[smart-grade] A:", achievable);
    console.log("[smart-grade] R:", relevant);
    console.log("[smart-grade] T:", timeBound);

    const score = Math.round(
      specific.score * 0.25 +
      measurable.score * 0.25 +
      achievable.score * 0.20 +
      relevant.score * 0.15 +
      timeBound.score * 0.15
    );

    const parsed: SmartGradeResult = {
      score,
      scores: {
        specific: specific.score,
        measurable: measurable.score,
        achievable: achievable.score,
        relevant: relevant.score,
        time_bound: timeBound.score,
      },
      tips: {
        specific: specific.tip,
        measurable: measurable.tip,
        achievable: achievable.tip,
        relevant: relevant.tip,
        time_bound: timeBound.tip,
      },
    };

    console.log("[smart-grade] final:", { score, scores: parsed.scores, tips: parsed.tips });

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
