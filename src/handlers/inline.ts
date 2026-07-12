import { Composer } from "grammy";
import type { InlineQueryResult } from "grammy/types";
import { prisma } from "../prisma.js";
import { isAdmin } from "../config.js";
import { movieCaption } from "../services/media.js";
import { getGlobalButton, getBool, KEYS } from "../utils/settings.js";
import { contentButtonRow } from "../utils/contentButton.js";
import { getUnsubscribedChannels } from "../utils/subscription.js";
import { isPremiumActive } from "../utils/premium.js";
import { e } from "../utils/emoji.js";
import type { MyContext } from "../types.js";

export const inlineHandler = new Composer<MyContext>();

inlineHandler.on("inline_query", async (ctx) => {
  const uid = ctx.from.id;
  const q = ctx.inlineQuery.query.trim();

  // Referal taklifi — do'stga chiroyli, tugmali xabar sifatida yuboriladi.
  // MUHIM: bu majburiy obuna tekshiruvidan OLDIN — havolani ulashish hech qachon
  // bloklanmasligi kerak (obuna bo'lmagan foydalanuvchi ham do'stini taklif qila oladi).
  const refMatch = q.match(/^ref_(\d+)$/);
  if (refMatch) {
    const refId = refMatch[1];
    const link = `https://t.me/${ctx.me.username}?start=ref_${refId}`;
    const inviter = await prisma.user.findUnique({ where: { id: BigInt(refId) } });
    const inviterName = inviter?.firstName?.trim() || "Do'stingiz";

    await ctx.answerInlineQuery(
      [
        {
          type: "article",
          id: `ref${refId}`,
          title: "🎬 Kino vaqti botiga taklif",
          description: `${inviterName} sizni taklif qilmoqda — minglab kino va serial, bepul!`,
          input_message_content: {
            message_text:
              `🎬 <b>${e.escapeHtml(inviterName)}</b> sizni <b>Kino vaqti</b> botiga taklif qilmoqda!\n\n` +
              `Minglab kino va serial — bepul va tez. 🍿`,
            parse_mode: "HTML",
          },
          reply_markup: { inline_keyboard: [[{ text: "🎬 Botni ochish", url: link }]] },
        },
      ],
      { cache_time: 0, is_personal: true }
    );
    return;
  }

  // Majburiy obuna — boshqa chatlarda ham tekshiriladi (video "sizib chiqmasin").
  // Admin va premium foydalanuvchilar obunasiz o'tadi.
  if (!isAdmin(uid)) {
    const forceSub = await getBool(KEYS.forceSubEnabled, true);
    const u = forceSub ? await prisma.user.findUnique({ where: { id: BigInt(uid) } }) : null;
    if (forceSub && !isPremiumActive(u?.premiumUntil)) {
      const notJoined = await getUnsubscribedChannels(ctx, uid);
      const blocking  = notJoined.filter((c) => c.type !== "INSTAGRAM");
      if (blocking.length > 0) {
        await ctx.answerInlineQuery([], {
          cache_time: 0,
          is_personal: true,
          button: {
            text: "🔒 Avval botga obuna bo'ling",
            start_parameter: "start",
          },
        });
        return;
      }
    }
  }

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
