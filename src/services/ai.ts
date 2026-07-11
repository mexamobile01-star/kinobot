import { config } from "../config.js";
import { getSetting, KEYS } from "../utils/settings.js";

// ─────────────────────────────────────────────────────────────────────────────
// AI PROVAYDER REGISTRI
// Barcha provayderlar (Gemini'dan tashqari) OpenAI-mos chat completions API.
// Kalit yo'q provayder avtomatik "mavjud emas" bo'ladi.
// ─────────────────────────────────────────────────────────────────────────────

export type ProviderId = "groq" | "openrouter" | "cerebras" | "github" | "mistral" | "gemini";

interface Provider {
  id: ProviderId;
  label: string;
  style: "openai" | "gemini";
  baseUrl: string;          // OpenAI-mos uchun to'liq chat completions URL
  key: () => string;        // API kalit (bo'sh bo'lsa — mavjud emas)
  models: { id: string; label: string }[];
}

export const PROVIDERS: Provider[] = [
  {
    id: "groq",
    label: "Groq",
    style: "openai",
    baseUrl: "https://api.groq.com/openai/v1/chat/completions",
    key: () => config.groqApiKey,
    models: [
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (sifatli)" },
      { id: "llama-3.1-8b-instant",    label: "Llama 3.1 8B (tez, katta limit)" },
      { id: "openai/gpt-oss-120b",     label: "GPT-OSS 120B" },
      { id: "moonshotai/kimi-k2-instruct", label: "Kimi K2" },
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    style: "openai",
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    key: () => config.openrouterApiKey,
    models: [
      { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free)" },
      { id: "deepseek/deepseek-chat-v3-0324:free",    label: "DeepSeek V3 (free)" },
      { id: "google/gemini-2.0-flash-exp:free",       label: "Gemini 2.0 Flash (free)" },
      { id: "qwen/qwen-2.5-72b-instruct:free",        label: "Qwen 2.5 72B (free)" },
    ],
  },
  {
    id: "cerebras",
    label: "Cerebras",
    style: "openai",
    baseUrl: "https://api.cerebras.ai/v1/chat/completions",
    key: () => config.cerebrasApiKey,
    models: [
      { id: "llama-3.3-70b", label: "Llama 3.3 70B (juda tez)" },
      { id: "llama3.1-8b",   label: "Llama 3.1 8B" },
    ],
  },
  {
    id: "github",
    label: "GitHub Models",
    style: "openai",
    baseUrl: "https://models.github.ai/inference/chat/completions",
    key: () => config.githubModelsToken,
    models: [
      { id: "openai/gpt-4o-mini",           label: "GPT-4o mini" },
      { id: "meta/Llama-3.3-70B-Instruct",  label: "Llama 3.3 70B" },
    ],
  },
  {
    id: "mistral",
    label: "Mistral",
    style: "openai",
    baseUrl: "https://api.mistral.ai/v1/chat/completions",
    key: () => config.mistralApiKey,
    models: [
      { id: "mistral-large-latest", label: "Mistral Large" },
      { id: "mistral-small-latest", label: "Mistral Small" },
    ],
  },
  {
    id: "gemini",
    label: "Google Gemini",
    style: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    key: () => config.geminiApiKey,
    models: [
      { id: "gemini-2.0-flash",     label: "Gemini 2.0 Flash" },
      { id: "gemini-1.5-flash",     label: "Gemini 1.5 Flash" },
    ],
  },
];

export function getProvider(id: string): Provider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** Kaliti bor (mavjud) provayderlar */
export function availableProviders(): Provider[] {
  return PROVIDERS.filter((p) => !!p.key());
}

/** Biror provayder kaliti bormi? */
export function aiEnabled(): boolean {
  return availableProviders().length > 0;
}

/** So'nggi rate-limit holati (header'lardan) — panel uchun */
export const rateLimitSnapshot = new Map<ProviderId, Record<string, string>>();
/** So'nggi xato (panel uchun) */
export const lastProviderError = new Map<ProviderId, string>();

interface AiResult {
  text: string;
  provider: ProviderId;
  model: string;
  tokens: number;
}

// ─── OpenAI-mos so'rov ───────────────────────────────────────────────────────
async function callOpenAI(p: Provider, model: string, userText: string, system?: string): Promise<AiResult | null> {
  try {
    const res = await fetch(p.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${p.key()}`,
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

    // rate-limit header'larini saqlaymiz
    const rl: Record<string, string> = {};
    for (const [k, v] of res.headers.entries()) {
      if (k.toLowerCase().startsWith("x-ratelimit")) rl[k] = v;
    }
    if (Object.keys(rl).length) rateLimitSnapshot.set(p.id, rl);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const msg = `${res.status} ${res.statusText} — ${body.slice(0, 300)}`;
      lastProviderError.set(p.id, msg);
      console.error(`🤖 ${p.label} (${model}) xato: ${msg}`);
      return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) return null;
    const tokens = data?.usage?.total_tokens ?? 0;
    lastProviderError.delete(p.id);
    return { text: text.trim(), provider: p.id, model, tokens };
  } catch (err) {
    lastProviderError.set(p.id, (err as Error).message);
    console.error(`🤖 ${p.label} (${model}) so'rov xatosi:`, (err as Error).message);
    return null;
  }
}

// ─── Gemini so'rov ───────────────────────────────────────────────────────────
async function callGemini(p: Provider, model: string, userText: string, system?: string): Promise<AiResult | null> {
  try {
    const url = `${p.baseUrl}/${model}:generateContent?key=${p.key()}`;
    const res = await fetch(url, {
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
      const msg = `${res.status} ${res.statusText} — ${body.slice(0, 300)}`;
      lastProviderError.set(p.id, msg);
      console.error(`🤖 Gemini (${model}) xato: ${msg}`);
      return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = parts.map((x: any) => x.text ?? "").join("").trim();
    if (!text) return null;
    const tokens = data?.usageMetadata?.totalTokenCount ?? 0;
    lastProviderError.delete(p.id);
    return { text, provider: p.id, model, tokens };
  } catch (err) {
    lastProviderError.set(p.id, (err as Error).message);
    console.error(`🤖 Gemini (${model}) so'rov xatosi:`, (err as Error).message);
    return null;
  }
}

async function callProvider(p: Provider, model: string, userText: string, system?: string): Promise<AiResult | null> {
  if (!p.key()) return null;
  return p.style === "gemini"
    ? callGemini(p, model, userText, system)
    : callOpenAI(p, model, userText, system);
}

/**
 * Scope uchun sozlangan modelni oladi va so'raydi; bo'lmasa qolgan mavjud
 * provayderlar bo'ylab fallback qiladi. Har muvaffaqiyatli chaqiruv usage
 * hisoblagichga yoziladi (onUsage callback orqali — sikldan qochish uchun).
 */
export async function askAI(scope: "user" | "admin", userText: string, system?: string): Promise<string | null> {
  const available = availableProviders();
  if (available.length === 0) {
    console.error("🤖 AI so'rovi keldi, lekin hech qanday provayder kaliti yo'q!");
    return null;
  }

  // Sozlangan modelni birinchi sinaymiz
  const selected = await getSetting(scope === "admin" ? KEYS.aiAdminModel : KEYS.aiUserModel, "");
  const tried = new Set<string>();
  const order: { p: Provider; model: string }[] = [];

  if (selected.includes(":")) {
    const [pid, ...rest] = selected.split(":");
    const model = rest.join(":");
    const p = available.find((x) => x.id === pid);
    if (p && model) { order.push({ p, model }); tried.add(`${pid}:${model}`); }
  }

  // Fallback: har mavjud provayderning birinchi modeli
  for (const p of available) {
    const model = p.models[0]?.id;
    if (!model) continue;
    const kk = `${p.id}:${model}`;
    if (tried.has(kk)) continue;
    order.push({ p, model });
    tried.add(kk);
  }

  for (const { p, model } of order) {
    const r = await callProvider(p, model, userText, system);
    if (r) {
      recordUsage(r.provider, r.model, r.tokens);
      return r.text;
    }
  }
  return null;
}

// ─── Usage tracking (B2'da DB'ga ulanadi; hozircha callback) ─────────────────
type UsageSink = (provider: ProviderId, model: string, tokens: number) => void;
let usageSink: UsageSink | null = null;
export function setUsageSink(sink: UsageSink) { usageSink = sink; }
function recordUsage(provider: ProviderId, model: string, tokens: number) {
  try { usageSink?.(provider, model, tokens); } catch { /* ignore */ }
}
