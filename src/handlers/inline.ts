import { Composer } from "grammy";
import type { InlineQueryResult } from "grammy/types";
import { prisma } from "../prisma.js";
import { movieCaption } from "../services/media.js";
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
    orderBy: { views: "desc" },
  });

  const results: InlineQueryResult[] = movies.map((m) => ({
    type: "video",
    id: `m${m.id}`,
    video_file_id: m.fileId,
    title: `${m.title} (${m.code})`,
    description: [m.year, m.genre, m.quality].filter(Boolean).join(" · "),
    caption: movieCaption(m),
    parse_mode: "HTML",
  }));

  await ctx.answerInlineQuery(results, {
    cache_time: 10,
    is_personal: true,
  });
});
