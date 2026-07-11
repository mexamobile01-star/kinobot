import { config } from "../config.js";

// Ikki provayder qo'llab-quvvatlanadi:
//  - Groq (bepul, tez, O'zbekistonda ishlaydi): GROQ_API_KEY
//  - Google Gemini (ba'zi hududlarda bepul kvota yo'q): GEMINI_API_KEY
// Groq birinchi navbatda ishlatiladi (agar kalit bor bo'lsa).

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/** AI yoqilganmi (biror provayder kaliti bor) */
export function aiEnabled(): boolean {
  return !!config.groqApiKey || !!config.geminiApiKey;
}

async function askGroq(userText: string, system?: string): Promise<string | null> {
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.groqApiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          ...(system ? [{ role: "system", content: system }] : []),
          { role: "user", content: userText },
        ],
        temperature: 0.7,
        max_tokens: 800,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`🤖 Groq xato: ${res.status} ${res.statusText} — ${body.slice(0, 500)}`);
      return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === "string" ? text.trim() || null : null;
  } catch (err) {
    console.error("🤖 Groq so'rov xatosi:", (err as Error).message);
    return null;
  }
}

async function askGeminiApi(userText: string, system?: string): Promise<string | null> {
  try {
    const res = await fetch(`${GEMINI_URL}?key=${config.geminiApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: userText }] }],
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`🤖 Gemini xato: ${res.status} ${res.statusText} — ${body.slice(0, 500)}`);
      return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = parts.map((p: any) => p.text ?? "").join("").trim();
    return text || null;
  } catch (err) {
    console.error("🤖 Gemini so'rov xatosi:", (err as Error).message);
    return null;
  }
}

/**
 * AI'ga so'rov yuboradi. Groq birinchi, keyin Gemini. Kalit yo'q/xato bo'lsa null.
 */
export async function askGemini(userText: string, system?: string): Promise<string | null> {
  if (!config.groqApiKey && !config.geminiApiKey) {
    console.error("🤖 AI so'rovi keldi, lekin GROQ_API_KEY va GEMINI_API_KEY ikkalasi ham yo'q!");
    return null;
  }
  if (config.groqApiKey) {
    const r = await askGroq(userText, system);
    if (r) return r;
  }
  if (config.geminiApiKey) {
    const r = await askGeminiApi(userText, system);
    if (r) return r;
  }
  return null;
}
