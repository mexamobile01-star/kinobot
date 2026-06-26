import { prisma } from "../prisma.js";
import { ce, e } from "../utils/emoji.js";
import { contentButtonMarkup } from "../utils/contentButton.js";
import { getGlobalButton } from "../utils/settings.js";
import type { MyContext } from "../types.js";
import type { Movie } from "@prisma/client";

export function movieCaption(m: Movie): string {
  const lines: string[] = [];
  lines.push(`${ce("film")} <b>${e.escapeHtml(m.title)}</b>`);
  if (m.year) lines.push(`📅 Yili: <b>${m.year}</b>`);
  if (m.genre) lines.push(`🎭 Janr: <b>${e.escapeHtml(m.genre)}</b>`);
  if (m.language) lines.push(`🗣 Til: <b>${e.escapeHtml(m.language)}</b>`);
  if (m.quality) lines.push(`📺 Sifat: <b>${e.escapeHtml(m.quality)}</b>`);
  if (m.caption) lines.push(`\n${e.escapeHtml(m.caption)}`);
  lines.push(`\n${ce("star")} Kod: <code>${m.code}</code>`);
  return lines.join("\n");
}

/** Kinoni foydalanuvchiga yuboradi va ko'rishlar sonini oshiradi */
export async function sendMovie(ctx: MyContext, movie: Movie) {
  const globalBtn = await getGlobalButton("movie");
  await ctx.replyWithVideo(movie.fileId, {
    caption: movieCaption(movie),
    reply_markup: contentButtonMarkup(globalBtn),
  });
  await prisma.movie.update({
    where: { id: movie.id },
    data: { views: { increment: 1 } },
  });
}
