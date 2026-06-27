import { prisma } from "../prisma.js";
import { ce, e } from "../utils/emoji.js";
import { contentButtonMarkup } from "../utils/contentButton.js";
import { getGlobalButton, getBool, KEYS } from "../utils/settings.js";
import type { MyContext } from "../types.js";
import type { Movie } from "@prisma/client";

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}s ${m}d` : `${m} daqiqa`;
}

export function movieCaption(m: Movie): string {
  const lines: string[] = [];
  lines.push(`${ce("film")} <b>${e.escapeHtml(m.title)}</b>`);
  if (m.year)     lines.push(`📅 Yili: <b>${m.year}</b>`);
  if (m.genre)    lines.push(`🎭 Janr: <b>${e.escapeHtml(m.genre)}</b>`);
  if (m.language) lines.push(`🗣 Til: <b>${e.escapeHtml(m.language)}</b>`);
  if (m.quality)  lines.push(`📺 Sifat: <b>${e.escapeHtml(m.quality)}</b>`);
  if (m.duration) lines.push(`⏱ Vaqti: <b>${formatDuration(m.duration)}</b>`);
  if (m.caption)  lines.push(`\n${e.escapeHtml(m.caption)}`);
  lines.push(`\n${ce("star")} Kod: <code>${m.code}</code>`);
  lines.push(`${ce("stats")} Ko'rishlar: <b>${m.views}</b>`);
  return lines.join("\n");
}

export async function sendMovie(ctx: MyContext, movie: Movie) {
  const enabled = await getBool(KEYS.movieBtnEnabled, true);
  const globalBtn = enabled ? await getGlobalButton("movie") : null;
  await ctx.replyWithVideo(movie.fileId, {
    caption: movieCaption(movie),
    reply_markup: globalBtn ? contentButtonMarkup(globalBtn) : undefined,
  });
  await prisma.movie.update({
    where: { id: movie.id },
    data: { views: { increment: 1 } },
  });
}
