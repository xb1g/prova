import { GoogleGenerativeAI } from "npm:@google/generative-ai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let goalText = "";
  try {
    const body = (await req.json()) as { goalText: string };
    goalText = body.goalText ?? "";

    if (!goalText.trim()) {
      return new Response(
        JSON.stringify({ error: "goalText is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const genAI = new GoogleGenerativeAI(Deno.env.get("AI_SDK_GEMINI_KEY")!);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const prompt = `Given this goal, suggest a short display name and emoji.

Goal: "${goalText}"

Rules:
- shortName: 2-4 words, title case, captures the essence (e.g. "Morning Run", "Daily Reading", "Drink More Water")
- emoji: single emoji that best represents the goal (e.g. 🏃, 📚, 💧)

Respond JSON only: {"shortName": string, "emoji": string}`;

    const response = await model.generateContent(prompt);
    const text = response.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

    if (!result?.shortName || !result?.emoji) {
      throw new Error("Invalid AI response");
    }

    console.log("[name-goal]", { goalText, result });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const fallback = {
      shortName: goalText.split(" ").slice(0, 3).join(" ") || "My Goal",
      emoji: "🎯",
    };

    console.error("[name-goal error]", err);
    return new Response(JSON.stringify(fallback), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
