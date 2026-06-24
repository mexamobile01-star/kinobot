import { Composer, InlineKeyboard } from "grammy";
import { prisma } from "../prisma.js";
import { isAdmin } from "../config.js";
import { ce, e } from "../utils/emoji.js";
import { sendMovie } from "../services/media.js";
import { ensureSubscribed } from "../utils/subscription.js";
import { getBool, KEYS } from "../utils/settings.js";
import { sendSerialSeasons } from "./serialView.js";
import type { MyContext } from "../types.js";

export const searchHandler = new Composer<MyContext>();

// Admin panel tugmalari matnlari — qidiruv ularni qabul qilmasligi uchun
const PANEL_TEXTS = new Set([
  "📊 Statistika",
  "📢 Kanal boshqaruvi",
  "🎬 Kino boshqaruvi",
  "📺 Serial boshqaruvi",
  "💾 Backup",
  "🔄 Yangilash",
  "🔎 Kino qidirish",
  "ℹ️ Yordam",
  "❌ Bekor qilish",
]);

searchHandler.on("message:text", async (ctx, next) => {
  const text = ctx.message.text.trim();
  if (text.startsWith("/")) return next();
  if (PANEL_TEXTS.has(text)) return next();

  const uid = ctx.from.id;

  // Majburiy obuna (adminlardan tashqari)
  if (!isAdmin(uid)) {
    const forceSub = await getBool(KEYS.forceSubEnabled, true);
    if (forceSub) {
      const ok = await ensureSubscribed(ctx, uid);
      if (!ok) return;
    }
  }

  // 1) Kod bo'yicha (raqam)
  if (/^\d+$/.test(text)) {
    const code = Number(text);

    const movie = await prisma.movie.findUnique({ where: { code } });
    if (movie) {
      await sendMovie(ctx, movie);
      return;
    }

    const serial = await prisma.serial.findUnique({ where: { code } });
    if (serial) {
      await sendSerialSeasons(ctx, serial.id);
      return;
    }

    await ctx.reply(
      `❌ <b>${code}</b> kodli kino yoki serial topilmadi.\n` +
        `Nom bilan ham qidirib ko'ring.`
    );
    return;
  }

  // 2) Nom bo'yicha qidiruv
  await searchByName(ctx, text);
});

async function searchByName(ctx: MyContext, query: string) {
  const [movies, serials] = await Promise.all([
    prisma.movie.findMany({
      where: { title: { contains: query, mode: "insensitive" } },
      take: 20,
      orderBy: { views: "desc" },
    }),
    prisma.serial.findMany({
      where: { title: { contains: query, mode: "insensitive" } },
      take: 20,
      orderBy: { views: "desc" },
    }),
  ]);

  if (movies.length === 0 && serials.length === 0) {
    await ctx.reply(
      `❌ "<b>${e.escapeHtml(query)}</b>" bo'yicha hech narsa topilmadi.`
    );
    return;
  }

  const kb = new InlineKeyboard();
  for (const m of movies) {
    kb.text(`🎬 ${m.title} (${m.code})`, `movie:${m.id}`).row();
  }
  for (const s of serials) {
    kb.text(`📺 ${s.title} (${s.code})`, `serial:${s.id}`).row();
  }

  await ctx.reply(
    `${ce("list")} <b>Topildi (${movies.length + serials.length}):</b>\n` +
      `Quyidagidan birini tanlang:`,
    { reply_markup: kb }
  );
}

// Qidiruv natijasidan kino tanlash
searchHandler.callbackQuery(/^movie:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const movie = await prisma.movie.findUnique({ where: { id } });
  await ctx.answerCallbackQuery();
  if (!movie) {
    await ctx.reply("❌ Kino topilmadi (o'chirilgan bo'lishi mumkin).");
    return;
  }
  await sendMovie(ctx, movie);
});

// Qidiruv natijasidan serial tanlash
searchHandler.callbackQuery(/^serial:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await ctx.answerCallbackQuery();
  await sendSerialSeasons(ctx, id);
});
