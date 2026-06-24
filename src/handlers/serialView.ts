import { Composer, InlineKeyboard } from "grammy";
import { prisma } from "../prisma.js";
import { ce, e } from "../utils/emoji.js";
import type { MyContext } from "../types.js";

export const serialViewHandler = new Composer<MyContext>();

/** Serial sezonlari ro'yxatini chiqaradi */
export async function sendSerialSeasons(ctx: MyContext, serialId: number) {
  const serial = await prisma.serial.findUnique({
    where: { id: serialId },
    include: { seasons: { orderBy: { number: "asc" } } },
  });
  if (!serial) {
    await ctx.reply("❌ Serial topilmadi.");
    return;
  }

  await prisma.serial.update({
    where: { id: serialId },
    data: { views: { increment: 1 } },
  });

  if (serial.seasons.length === 0) {
    await ctx.reply("⚠️ Bu serialda hali sezon/qism qo'shilmagan.");
    return;
  }

  const kb = new InlineKeyboard();
  for (const s of serial.seasons) {
    kb.text(
      `📂 ${s.number}-sezon${s.title ? ` · ${s.title}` : ""}`,
      `season:${s.id}`
    ).row();
  }

  const caption =
    `${ce("tv")} <b>${e.escapeHtml(serial.title)}</b>\n` +
    (serial.year ? `📅 ${serial.year}\n` : "") +
    (serial.caption ? `\n${e.escapeHtml(serial.caption)}\n` : "") +
    `\nSezonni tanlang:`;

  if (serial.posterId) {
    await ctx.replyWithPhoto(serial.posterId, {
      caption,
      reply_markup: kb,
    });
  } else {
    await ctx.reply(caption, { reply_markup: kb });
  }
}

// Sezon tanlandi → qismlar ro'yxati
serialViewHandler.callbackQuery(/^season:(\d+)$/, async (ctx) => {
  const seasonId = Number(ctx.match[1]);
  await ctx.answerCallbackQuery();

  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: {
      episodes: { orderBy: { number: "asc" } },
      serial: true,
    },
  });
  if (!season) {
    await ctx.reply("❌ Sezon topilmadi.");
    return;
  }
  if (season.episodes.length === 0) {
    await ctx.reply("⚠️ Bu sezonda qismlar yo'q.");
    return;
  }

  const kb = new InlineKeyboard();
  let i = 0;
  for (const ep of season.episodes) {
    kb.text(`${ep.number}-qism`, `ep:${ep.id}`);
    if (++i % 3 === 0) kb.row();
  }
  kb.row().text("⬅️ Sezonlar", `serialBack:${season.serialId}`);

  await ctx.reply(
    `${ce("tv")} <b>${e.escapeHtml(season.serial.title)}</b> — ${season.number}-sezon\n` +
      `Qismni tanlang:`,
    { reply_markup: kb }
  );
});

// Qism tanlandi → videoni yuborish
serialViewHandler.callbackQuery(/^ep:(\d+)$/, async (ctx) => {
  const epId = Number(ctx.match[1]);
  await ctx.answerCallbackQuery();

  const ep = await prisma.episode.findUnique({
    where: { id: epId },
    include: { season: { include: { serial: true } } },
  });
  if (!ep) {
    await ctx.reply("❌ Qism topilmadi.");
    return;
  }

  await ctx.replyWithVideo(ep.fileId, {
    caption:
      `${ce("tv")} <b>${e.escapeHtml(ep.season.serial.title)}</b>\n` +
      `${ep.season.number}-sezon · ${ep.number}-qism` +
      (ep.title ? `\n${e.escapeHtml(ep.title)}` : ""),
  });
});

// Orqaga (sezonlar)
serialViewHandler.callbackQuery(/^serialBack:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendSerialSeasons(ctx, Number(ctx.match[1]));
});
