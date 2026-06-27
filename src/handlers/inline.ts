import { Composer } from "grammy";
import type { InlineQueryResult } from "grammy/types";
import { prisma } from "../prisma.js";
import { movieCaption } from "../services/media.js";
import { getGlobalButton, getBool, KEYS } from "../utils/settings.js";
import { contentButtonRow } from "../utils/contentButton.js";
import type { MyContext } from "../types.js";

export const inlineHandler = new Composer<MyContext>();

inlineHandler.on("inline_query", async (ctx) => {
  const q = ctx.inlineQuery.query.trim();

  const where = q
    ? /^\d+$/.test(q)
      ? { code: Number(q) }
      : { title: { contains: q, mode: "insensitive" as const } }
    : {};

  const movies = await prisma.movie.findMany({
    where,
    take: 25,
    orderBy: q ? { views: "desc" } : { views: "desc" },
  });

  const enabled   = await getBool(KEYS.movieBtnEnabled, true);
  const globalBtn = enabled ? await getGlobalButton("movie") : null;
  const btnRow    = globalBtn ? contentButtonRow(globalBtn) : null;

  const results: InlineQueryResult[] = movies.map((m) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reply_markup: any = { inline_keyboard: btnRow ? [btnRow] : [] };
    return {
      type: "video",
      id: `m${m.id}`,
      video_file_id: m.fileId,
      title: `${m.title} (${m.code})`,
      description: [
        m.year ? `${m.year}` : null,
        m.genre,
        m.quality,
        `Ko'rishlar: ${m.views}`,
      ].filter(Boolean).join(" · "),
      caption: movieCaption(m),
      parse_mode: "HTML",
      reply_markup: reply_markup.inline_keyboard.length ? reply_markup : undefined,
    };
  });

  await ctx.answerInlineQuery(results, {
    cache_time: 10,
    is_personal: true,
    button: {
      text: "🔎 Ko'proq qidirish...",
      start_parameter: "search",
    },
  });
});
