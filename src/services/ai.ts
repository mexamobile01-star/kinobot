import { config } from "../config.js";

const MODEL = "gemini-2.0-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

/** AI yoqilganmi (API kalit bor) */
export function aiEnabled(): boolean {
  return !!config.geminiApiKey;
}

/**
 * Gemini'ga so'rov yuboradi. Kalit yo'q yoki xato bo'lsa null qaytaradi.
 */
export async function askGemini(userText: string, system?: string): Promise<string | null> {
  const key = config.geminiApiKey;
  if (!key) return null;

  try {
    const res = await fetch(`${ENDPOINT}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: userText }] }],
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
      }),
    });
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = parts.map((p: any) => p.text ?? "").join("").trim();
    return text || null;
  } catch {
    return null;
  }
}
