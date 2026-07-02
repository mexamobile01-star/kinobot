import { config } from "../config.js";
import { e } from "../utils/emoji.js";
import type { MyContext } from "../types.js";
import type { Movie } from "@prisma/client";

// Kino kanal posti uchun premium emojilar
const EM = {
  name:  "5258077307985207053", // 📹
  genre: "5258318251355545562", // 🙃
  time:  "5258419835922030550", // 🕔
  bot:   "5258093637450866522", // 🤖
};

function tg(id: string, fallback: string): string {
  return `<tg-emoji emoji-id="${id}">${fallback}</tg-emoji>`;
}

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Kino kanal posti uchun caption */
export function movieChannelCaption(m: Movie): string {
  const lines = [
    `${tg(EM.name, "📹")} nomi : ${e.escapeHtml(m.title)}`,
    `${tg(EM.genre, "🙃")} janri : ${m.genre ? e.escapeHtml(m.genre) : "—"}`,
    `${tg(EM.time, "🕔")} vaqti : ${m.duration ? formatDuration(m.duration) : "—"}`,
  ];
  return lines.join("\n\n");
}

/** "bot orqali kinoni ko'rish" tugmasi (deep-link) */
export function movieWatchButton(botUsername: string, code: number) {
  return {
    text: "🤖 bot orqali kinoni ko'rish",
    url: `https://t.me/${botUsername}?start=movie_${code}`,
    icon_custom_emoji_id: EM.bot,
  };
}

/**
 * Qisqa videoni kino kanalga tashlaydi.
 * shortMsgId qaytaradi (yoki null).
 */
export async function postToMovieChannel(
  ctx: MyContext,
  movie: Movie,
  shortFileId: string
): Promise<number | null> {
  if (!config.movieChannelId) return null;
  const btn = movieWatchButton(ctx.me.username, movie.code);
  try {
    const sent = await ctx.api.sendVideo(config.movieChannelId, shortFileId, {
      caption: movieChannelCaption(movie),
      parse_mode: "HTML",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply_markup: { inline_keyboard: [[btn]] } as any,
    });
    return sent.message_id;
  } catch {
    return null;
  }
}
