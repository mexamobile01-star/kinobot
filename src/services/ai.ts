import { config } from "../config.js";

// Provayderlar zanjiri (birinchisi ishlamasa keyingisiga o'tadi):
//  1. Groq — kuchli model (yaxshi sifat, lekin kunlik token limiti past)
//  2. Groq — yengil model (kunlik limiti ancha katta, fallback)
//  3. Google Gemini (ba'zi hududlarda bepul kvota yo'q)

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL_PRIMARY  = "llama-3.3-70b-versatile"; // sifatli, lekin TPD past
const GROQ_MODEL_FALLBACK = "llama-3.1-8b-instant";    // TPD ancha katta

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/** AI yoqilganmi (biror provayder kaliti bor) */
export function aiEnabled(): boolean {
  return !!config.groqApiKey || !!config.geminiApiKey;
}

async function askGroq(model: string, userText: string, system?: string): Promise<string | null> {
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.groqApiKey}`,
      },
      body: JSON.stringify({
        model,
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
      console.error(`🤖 Groq (${model}) xato: ${res.status} ${res.statusText} — ${body.slice(0, 500)}`);
      return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === "string" ? text.trim() || null : null;
  } catch (err) {
    console.error(`🤖 Groq (${model}) so'rov xatosi:`, (err as Error).message);
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
 * AI'ga so'rov yuboradi. Zanjir: Groq-70b → Groq-8b → Gemini.
 * Birontasi ham ishlamasa (limit/xato) — null.
 */
export async function askGemini(userText: string, system?: string): Promise<string | null> {
  if (!config.groqApiKey && !config.geminiApiKey) {
    console.error("🤖 AI so'rovi keldi, lekin GROQ_API_KEY va GEMINI_API_KEY ikkalasi ham yo'q!");
    return null;
  }
  if (config.groqApiKey) {
    const r1 = await askGroq(GROQ_MODEL_PRIMARY, userText, system);
    if (r1) return r1;
    const r2 = await askGroq(GROQ_MODEL_FALLBACK, userText, system);
    if (r2) return r2;
  }
  if (config.geminiApiKey) {
    const r3 = await askGeminiApi(userText, system);
    if (r3) return r3;
  }
  return null;
}
