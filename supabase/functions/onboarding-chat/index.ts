import { GoogleGenerativeAI } from "npm:@google/generative-ai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are the onboarding coach for Prova, a goal accountability app. Your job: have a warm, smart, natural conversation to understand the user before they start setting goals.

You need to learn (but don't ask in order — let the conversation flow naturally):
• Which areas of life they want to improve (health, career, relationships, learning, finances, creativity, etc.)
• Their vision for success in the next 6–12 months
• Their core values — what matters most to them
• What's blocking or slowing them down right now
• How much time per week they can realistically dedicate to new habits

Conversation rules:
- Keep every message SHORT — 1-3 sentences max. Never lecture.
- Ask only ONE question at a time.
- Genuinely react to what they said before moving on — show you heard them.
- Be direct, warm, and real. Like a smart friend who's also a coach.
- Adapt dynamically — if their answer already covers the next topic, skip that question.
- Don't list topics, don't say "I need to ask you about X". Just have the conversation.
- After 5–8 meaningful exchanges (when you feel you understand them), wrap up.
- If the user adds more detail AFTER the profile was shown (refinement), update the profile accordingly and return type "done" immediately with the refreshed profile.

ALWAYS respond with valid JSON — two formats only:

Regular turn (still gathering info):
{"type":"message","text":"<your 1-3 sentence response ending with one question>"}

Final turn (you have enough to build their profile, OR user is refining after seeing the summary):
{"type":"done","text":"<short warm closing, e.g. 'Love it. Give me a second to put this together…'>","profile":{"lifeAreas":["<area>","<area>"],"direction":"<1-2 sentence vision summary>","values":"<1 sentence on core values>","blockers":"<1 sentence on main obstacles>","weeklyHours":<integer>}}

Rules for the profile:
- lifeAreas: 1–5 short strings (e.g. "health", "career", "relationships")
- direction: what they're working toward in 6–12 months
- values: their core principles in one sentence
- blockers: their main obstacle in one sentence
- weeklyHours: realistic integer hours/week for new habits

No text outside the JSON. Ever.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const genAI = new GoogleGenerativeAI(Deno.env.get("AI_SDK_GEMINI_KEY")!);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite",
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const { history, message } = await req.json();
    // history: Array<{role: "user"|"model", text: string}> — prior turns, NOT including current message
    // message: string — latest user message, empty string on first call

    let responseText: string;

    if (!message) {
      // First call — generate the opening message with no prior history
      const result = await model.generateContent(
        'The user just opened onboarding. Start the conversation with a warm greeting and your first question. Respond with JSON: {"type":"message","text":"<greeting + question>"}'
      );
      responseText = result.response.text();
    } else {
      // Build Gemini history. Gemini requires history to alternate user/model starting with user.
      // If the AI sent an opening message first (role: model), prepend a synthetic user turn.
      let formattedHistory = (history as { role: string; text: string }[]).map((m) => ({
        role: m.role,
        parts: [{ text: m.text }],
      }));

      if (formattedHistory.length > 0 && formattedHistory[0].role === "model") {
        formattedHistory = [
          { role: "user", parts: [{ text: "[start]" }] },
          ...formattedHistory,
        ];
      }

      const chat = model.startChat({ history: formattedHistory });
      const result = await chat.sendMessage(message);
      responseText = result.response.text();
    }

    const parsed = JSON.parse(responseText);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[onboarding-chat error]", err);
    return new Response(
      JSON.stringify({ error: "chat failed", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
