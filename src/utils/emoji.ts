import { config } from "../config.js";

/**
 * Premium (custom) emoji'lar.
 * Telegram Bot API HTML parse_mode'da <tg-emoji emoji-id="..."> tegini qo'llab-quvvatlaydi.
 * Agar foydalanuvchida custom emoji ko'rinmasa, ichidagi fallback emoji ko'rinadi.
 *
 * IDlar foydalanuvchi tomonidan berilgan (boshqa botdan).
 * Agar biror ID ishlamasa — fallback emoji avtomatik ko'rinadi.
 */
export const EMOJI_IDS = {
  settings: "5258509201306557640",
  list: "5210860842714688276",
  star: "5210771709258394044",
  menu: "5260399854500191689",
  home: "5258501105293205250",
  fire: "5193202823411546657",
  chart: "5257963315258204021",
  trendUp: "5258513401784573443",
  stats: "5258391025281408576",
  film: "5258331647358540449",
  tv: "4918438965029110683",
  folder: "5260416304224936047",
  check: "5260342697075416641",
  subCheck: "5861665979968262792",
  botName: "5258077307985207053",
  search: "5429571366384842791",
  blocked: "5260249440450520061",
  views: "5258096772776991776",
  channel: "5260268501515377807",
} as const;

const FALLBACK: Record<keyof typeof EMOJI_IDS, string> = {
  settings: "⚙️",
  list: "📋",
  star: "⭐",
  menu: "📲",
  home: "🏠",
  fire: "🔥",
  chart: "📊",
  trendUp: "📈",
  stats: "👥",
  film: "🎬",
  tv: "📺",
  folder: "🗂",
  check: "✅",
  subCheck: "✅",
  botName: "🎬",
  search: "🔎",
  blocked: "🚫",
  views: "👁",
  channel: "📢",
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Custom emoji HTML qaytaradi. USE_PREMIUM_EMOJI=false bo'lsa — oddiy emoji.
 */
export function ce(key: keyof typeof EMOJI_IDS): string {
  const fallback = FALLBACK[key];
  if (!config.usePremiumEmoji) return fallback;
  return `<tg-emoji emoji-id="${EMOJI_IDS[key]}">${fallback}</tg-emoji>`;
}

export const e = { escapeHtml };
