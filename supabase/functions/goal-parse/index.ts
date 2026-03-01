import { GoogleGenerativeAI } from "npm:@google/generative-ai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type FrequencyUnit = "day" | "week" | "month" | null;

const WORD_TO_NUMBER: Record<string, number> = {
  once: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twice: 2,
};

const normalizeUnit = (raw: string | null | undefined): FrequencyUnit => {
  if (!raw) return null;
  const value = raw.toLowerCase().trim();
  if (value === "day" || value === "days" || value === "daily" || value === "d" || value === "perday") return "day";
  if (value === "week" || value === "weeks" || value === "weekly" || value === "wk" || value === "w") return "week";
  if (value === "month" || value === "months" || value === "monthly" || value === "mo" || value === "m") return "month";
  return null;
};

const parseFrequencyHeuristic = (goalText: string) => {
  const text = goalText.toLowerCase();
  const matches: Array<{ count: number; unit: "day" | "week" | "month" }> = [];

  const addMatch = (countRaw: string, unitRaw: string) => {
    const count = Number(countRaw);
    const parsedCount = Number.isNaN(count) ? WORD_TO_NUMBER[countRaw.toLowerCase()] : count;
    const unit = normalizeUnit(unitRaw);
    if (!parsedCount || !unit) return;
    if (parsedCount < 1 || parsedCount > 30) return;
    matches.push({ count: parsedCount, unit });
  };

  const patterns: Array<RegExp> = [
    /\b(\d{1,2})\s*(?:x|×)\s*(?:per\s*|a\s*|each\s*)?(day|week|month|wk|month|daily|weekly|monthly|day|week|d|w|m)\b/gi,
    /\b(\d{1,2})\s*\/\s*(day|week|month|wk|mo|d|w|m)\b/gi,
    /\b(\d{1,2})\s*(?:times|time)\s*(?:per|a|each)\s*(day|week|month|wk|month|d|w|m)\b/gi,
    /\b(once|twice|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:times?)?\s*(?:per|a|each)\s*(day|week|month|wk|month|d|w|m)\b/gi,
    /\b(?:every|each)\s+(day|week|month|wk|d|w|m)\b/gi,
    /\b(daily|weekly|monthly)\b/gi,
  ];

  for (const regex of patterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const [countRaw, unitRaw] = match.slice(1);
      if (!countRaw || !unitRaw) continue;
      let countValueNormalized = countRaw;
      if (Number.isNaN(Number(countRaw)) && WORD_TO_NUMBER[countRaw.toLowerCase()] != null) {
        countValueNormalized = String(WORD_TO_NUMBER[countRaw.toLowerCase()]);
      }
      addMatch(countValueNormalized, unitRaw);
    }
  }

  if (!matches.length) return null;
  return matches.reduce((best, current) => (current.count > best.count ? current : best), matches[0]);
}

const normalizeParse = (parsed: {
  frequencyCount: unknown;
  frequencyUnit: unknown;
  durationValue: unknown;
  humanReadable: unknown;
}, goalText: string) => {
  const rawCount = Number(parsed.frequencyCount);
  const rawUnit = normalizeUnit(typeof parsed.frequencyUnit === "string" ? parsed.frequencyUnit : null);
  const heuristic = parseFrequencyHeuristic(goalText);

  const frequencyCount = Number.isInteger(rawCount) && rawCount > 0 ? rawCount : null;
  const frequencyUnit = rawUnit;

  if (frequencyCount != null && frequencyUnit) {
    return {
      frequencyCount,
      frequencyUnit,
      durationValue: typeof parsed.durationValue === "string" ? parsed.durationValue : null,
      humanReadable:
        typeof parsed.humanReadable === "string" && parsed.humanReadable.trim().length > 0
          ? parsed.humanReadable
          : `${frequencyCount}× per ${frequencyUnit}`,
    };
  }

  if (!heuristic) {
    return {
      frequencyCount: null,
      frequencyUnit: null,
      durationValue: typeof parsed.durationValue === "string" ? parsed.durationValue : null,
      humanReadable: typeof parsed.humanReadable === "string" && parsed.humanReadable.trim().length > 0 ? parsed.humanReadable : null,
    };
  }

  return {
    frequencyCount: heuristic.count,
    frequencyUnit: heuristic.unit,
    durationValue: typeof parsed.durationValue === "string" ? parsed.durationValue : null,
    humanReadable: `${heuristic.count}× per ${heuristic.unit}`,
  };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let goalText = "";
  try {
    const genAI = new GoogleGenerativeAI(Deno.env.get("AI_SDK_GEMINI_KEY")!);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const parsedRequest = await req.json();
    goalText = typeof parsedRequest?.goalText === "string" ? parsedRequest.goalText : "";

    if (!goalText || goalText.trim().length < 3) {
      return new Response(
        JSON.stringify({ frequencyCount: null, frequencyUnit: null, durationValue: null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await model.generateContent(
      `Extract frequency and duration information from this goal text.

Goal: "${goalText}"

Respond with JSON only, no explanation:
{
  "frequencyCount": <integer or null if not stated>,
  "frequencyUnit": <"day" | "week" | "month" | null>,
  "durationValue": <string like "8 weeks" or "until March 2026" or null if not stated>,
  "humanReadable": <short string like "3× per week" or null if nothing extracted>
}`
    );

    const raw = result.response.text();
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "");
    const parsed = JSON.parse(cleaned);
    const normalizedParsed = normalizeParse(parsed, goalText);

    return new Response(JSON.stringify(normalizedParsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[goal-parse error]", err);
    const heuristic = parseFrequencyHeuristic(goalText);
    if (heuristic) {
      return new Response(
        JSON.stringify({
          frequencyCount: heuristic.count,
          frequencyUnit: heuristic.unit,
          durationValue: null,
          humanReadable: `${heuristic.count}× per ${heuristic.unit}`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "parse failed", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
