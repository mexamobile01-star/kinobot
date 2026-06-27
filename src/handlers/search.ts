import { Composer, InlineKeyboard } from "grammy";
import { prisma } from "../prisma.js";
import { isAdmin } from "../config.js";
import { ce, e } from "../utils/emoji.js";
import { sendMovie } from "../services/media.js";
import { ensureSubscribed } from "../utils/subscription.js";
import { getBool, KEYS } from "../utils/settings.js";
import { sendSerialSeasons } from "./serialView.js";
import { ADMIN_MENU_BUTTONS } from "../utils/keyboard.js";
import type { MyContext } from "../types.js";

export const searchHandler = new Composer<MyContext>();

const PANEL_TEXTS = new Set([
  ...Object.values(ADMIN_MENU_BUTTONS),
  "🔄 Yangilash",
  "🔎 Kino qidirish",
  "❌ Bekor qilish",
]);

// ─── Qidiruv knopkasi: ko'p ko'rilgan / inline ───────────────────────────────
searchHandler.callbackQuery("popular:page:0", async (ctx) => {
  await ctx.answerCallbackQuery();
  await renderPopular(ctx, 0, false);
});
searchHandler.callbackQuery(/^popular:page:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await renderPopular(ctx, Number(ctx.match[1]), true);
});

async function renderPopular(ctx: MyContext, page: number, edit: boolean) {
  const PAGE = 10;
  const total = await prisma.movie.count();
  const movies = await prisma.movie.findMany({
    orderBy: { views: "desc" },
    skip: page * PAGE,
    take: PAGE,
  });
  const kb = new InlineKeyboard();
  for (const m of movies) {
    kb.text(`${m.title} (${m.views})`, `movie:${m.id}`).row();
  }
  const pages = Math.ceil(total / PAGE);
  if (page > 0) kb.text("⬅️", `popular:page:${page - 1}`);
  if (pages > 1) kb.text(`${page + 1}/${pages}`, "noop:pop");
  if (page < pages - 1) kb.text("➡️", `popular:page:${page + 1}`);

  const text = `${ce("trendUp")} <b>Ko'p ko'rilgan kinolar</b>`;
  if (edit) await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {});
  else await ctx.reply(text, { reply_markup: kb });
}

searchHandler.callbackQuery("noop:pop", (ctx) => ctx.answerCallbackQuery());

// ─── Asosiy matnli qidiruv ───────────────────────────────────────────────────
searchHandler.on("message:text", async (ctx, next) => {
  const text = ctx.message.text.trim();
  if (text.startsWith("/")) return next();
  if (PANEL_TEXTS.has(text)) return next();

  const uid = ctx.from.id;

  if (!isAdmin(uid)) {
    const forceSub = await getBool(KEYS.forceSubEnabled, true);
    if (forceSub) {
      const ok = await ensureSubscribed(ctx, uid);
      if (!ok) return;
    }
  }

  // Kod bo'yicha
  if (/^\d+$/.test(text)) {
    const code = Number(text);
    const movie = await prisma.movie.findUnique({ where: { code } });
    if (movie) { await sendMovie(ctx, movie); return; }

    const serial = await prisma.serial.findUnique({ where: { code } });
    if (serial) { await sendSerialSeasons(ctx, serial.id); return; }

    await ctx.reply(
      `<tg-emoji emoji-id="5429571366384842791">🔎</tg-emoji> <b>${code}</b> kodli kino topilmadi.\n\n` +
      `Nom bilan ham qidirib ko'ring.`
    );
    return;
  }

  await searchByName(ctx, text);
});

async function searchByName(ctx: MyContext, query: string) {
  const [movies, serials] = await Promise.all([
    prisma.movie.findMany({
      where: { title: { contains: query, mode: "insensitive" } },
      take: 20, orderBy: { views: "desc" },
    }),
    prisma.serial.findMany({
      where: { title: { contains: query, mode: "insensitive" } },
      take: 20, orderBy: { views: "desc" },
    }),
  ]);

  if (movies.length === 0 && serials.length === 0) {
    // Natija topilmasa — inline qidiruv va popular knopkalari ko'rsatiladi
    const kb = new InlineKeyboard()
      .switchInlineCurrent(
        `🔎 Inline qidiruv: ${query}`,
        query
      ).row()
      .text("Ko'p ko'rilganlar", "popular:page:0");
    await ctx.reply(
      `<tg-emoji emoji-id="5429571366384842791">🔎</tg-emoji> "<b>${e.escapeHtml(query)}</b>" topilmadi.\n\nInline qidiruv yoki mashhur kinolarni sinab ko'ring:`,
      { reply_markup: kb }
    );
    return;
  }

  const kb = new InlineKeyboard();
  for (const m of movies) kb.text(`${m.title} (${m.code})`, `movie:${m.id}`).row();
  for (const s of serials) kb.text(`${s.title} (${s.code})`, `serial:${s.id}`).row();

  // Inline qidiruv knopkasi
  kb.switchInlineCurrent(`🔎 Inline: ${query}`, query);

  await ctx.reply(
    `${ce("list")} <b>Topildi (${movies.length + serials.length}):</b>`,
    { reply_markup: kb }
  );
}

// Natijadan kino
searchHandler.callbackQuery(/^movie:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const movie = await prisma.movie.findUnique({ where: { id } });
  await ctx.answerCallbackQuery();
  if (!movie) { await ctx.reply("❌ Kino topilmadi."); return; }
  await sendMovie(ctx, movie);
});

// Natijadan serial
searchHandler.callbackQuery(/^serial:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await ctx.answerCallbackQuery();
  await sendSerialSeasons(ctx, id);
});
