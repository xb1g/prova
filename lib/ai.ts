import { supabase } from "./supabase";
import { UserProfile } from "./auth";

// Normalize goal text for cache key comparison
function normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ");
}

type CacheEntry<T> = { result: T; ts: number; key: string };
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

const gradeCache = new Map<string, CacheEntry<SmartGradeResult>>();
const realityCache = new Map<string, CacheEntry<RealityCheckResult>>();

export type NameGoalResult = {
  shortName: string;
  emoji: string;
};

export type SmartGradeResult = {
  score: number;
  degraded?: boolean;
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
};

export type GoalParseResult = {
  frequencyCount: number | null;
  frequencyUnit: "day" | "week" | "month" | null;
  durationValue: string | null;
  humanReadable: string | null;
};

export type RealityCheckResult = {
  likelihood: number;
  pitfalls: string[];
  suggestions: string[];
};

export type OnboardingMessage = {
  topic: string;
  answer: string;
  followUpAnswer: string;
};

export type ExtractedProfile = {
  lifeAreas: string[];
  direction: string;
  values: string;
  blockers: string;
  weeklyHours: number;
};

export type OnboardingChatHistoryItem = {
  role: "user" | "model";
  text: string;
};

export type OnboardingChatResponse =
  | { type: "message"; text: string }
  | { type: "done"; text: string; profile: ExtractedProfile };

export type CreateGoalPayload = {
  goalText: string;
  proofTypes: string[];
  proofDescription: string;
  smartGrade: SmartGradeResult | null;
  parsedGoal: GoalParseResult | null;
  realityResult: RealityCheckResult | null;
  shortName?: string;
  emoji?: string;
};

export async function onboardingChat(
  history: OnboardingChatHistoryItem[],
  message: string
): Promise<OnboardingChatResponse> {
  const { data, error } = await supabase.functions.invoke("onboarding-chat", {
    body: { history, message },
  });
  if (error) throw error;
  return data as OnboardingChatResponse;
}

export async function gradeGoal(params: {
  goalText: string;
  proofTypes?: string[];
  proofDescription?: string;
  userProfile?: Pick<UserProfile, "life_areas" | "direction" | "values"> | null;
  parsedFrequency?: string | null;
}): Promise<SmartGradeResult> {
  const cacheKey = [
    normalizeText(params.goalText),
    (params.proofTypes ?? []).slice().sort().join(","),
    normalizeText(params.proofDescription ?? ""),
    params.parsedFrequency ?? "",
  ].join("|");

  const cached = gradeCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    console.log("[ai] gradeGoal cache hit", cacheKey);
    return cached.result;
  }

  const { data, error } = await supabase.functions.invoke("smart-grade", {
    body: {
      goalText: params.goalText,
      proofTypes: params.proofTypes ?? [],
      proofDescription: params.proofDescription ?? "",
      userProfile: params.userProfile
        ? {
            lifeAreas: params.userProfile.life_areas,
            direction: params.userProfile.direction,
            values: params.userProfile.values,
          }
        : null,
      parsedFrequency: params.parsedFrequency ?? null,
    },
  });
  if (error) throw error;
  const result = data as SmartGradeResult;
  console.log("[ai] gradeGoal result:", result);
  gradeCache.set(cacheKey, { result, ts: Date.now(), key: cacheKey });
  return result;
}

export async function parseGoal(goalText: string): Promise<GoalParseResult> {
  const { data, error } = await supabase.functions.invoke("goal-parse", {
    body: { goalText },
  });
  if (error) throw error;
  const result = data as GoalParseResult;
  console.log("[ai] parseGoal result:", result);
  return result;
}

export async function realityCheck(params: {
  goalText: string;
  proofTypes: string[];
  parsedFrequency: string | null;
}): Promise<RealityCheckResult> {
  const cacheKey = normalizeText(params.goalText) + "|" + (params.proofTypes).sort().join(",") + "|" + (params.parsedFrequency ?? "");

  const cached = realityCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    console.log("[ai] realityCheck cache hit", { cacheKey });
    return cached.result;
  }

  const { data, error } = await supabase.functions.invoke("reality-check", {
    body: params,
  });
  if (error) throw error;
  const result = data as RealityCheckResult;
  realityCache.set(cacheKey, { result, ts: Date.now(), key: cacheKey });
  console.log("[ai] realityCheck result:", result);
  return result;
}

export async function onboardingFollowUp(
  topic: string,
  answer: string
): Promise<string> {
  const { data, error } = await supabase.functions.invoke("onboarding-followup", {
    body: { topic, answer },
  });
  if (error) throw error;
  return (data as { followUp: string }).followUp;
}

export async function onboardingExtract(
  messages: OnboardingMessage[]
): Promise<ExtractedProfile> {
  const { data, error } = await supabase.functions.invoke("onboarding-extract", {
    body: { messages },
  });
  if (error) throw error;
  return data as ExtractedProfile;
}

export async function nameGoal(goalText: string): Promise<NameGoalResult> {
  const { data, error } = await supabase.functions.invoke("name-goal", {
    body: { goalText },
  });
  if (error) throw error;
  console.log("[ai] nameGoal result:", data);
  return data as NameGoalResult;
}

export async function createGoal(payload: CreateGoalPayload): Promise<{ id: string }> {
  const { data, error } = await supabase.functions.invoke("create-goal", {
    body: {
      goalText: payload.goalText,
      proofTypes: payload.proofTypes,
      proofDescription: payload.proofDescription,
      smartGrade: payload.smartGrade,
      parsedGoal: payload.parsedGoal,
      realityResult: payload.realityResult,
      shortName: payload.shortName,
      emoji: payload.emoji,
    },
  });
  if (error) throw error;
  return data as { id: string };
}
