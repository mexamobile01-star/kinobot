import { Composer, InlineKeyboard } from "grammy";
import type { Conversation } from "@grammyjs/conversations";
import { prisma } from "../../prisma.js";
import { config } from "../../config.js";
import { ce, e } from "../../utils/emoji.js";
import { DOT, cancelKeyboard, adminMenuKeyboard } from "../../utils/keyboard.js";
import type { MyContext } from "../../types.js";

export const serialsHandler = new Composer<MyContext>();

const CANCEL = "❌ Bekor qilish";
const isCancel = (t?: string) => t === CANCEL || t === "/cancel";
const stop = (ctx: MyContext) =>
  ctx.reply("❌ Bekor qilindi.", { reply_markup: adminMenuKeyboard() });

function serialMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text(`${DOT.green} ➕ Serial qo'shish`, "sr:add")
    .row()
    .text(`${DOT.green} 🎞 Qism qo'shish`, "sr:addep")
    .row()
    .text(`${DOT.blue} ☰ Ro'yxat`, "sr:list")
    .text(`${DOT.red} 🗑 O'chirish`, "sr:dellist")
    .row()
    .text(`${DOT.white} ≫ Yopish`, "sr:close");
}

serialsHandler.hears("📺 Serial boshqaruvi", async (ctx) => {
  const count = await prisma.serial.count();
  await ctx.reply(
    `${ce("tv")} <b>Serial boshqaruvi</b>\n\nJami seriallar: <b>${count}</b>`,
    { reply_markup: serialMenu() }
  );
});

serialsHandler.callbackQuery("sr:close", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.deleteMessage().catch(() => {});
});

// ============ SERIAL QO'SHISH ============
serialsHandler.callbackQuery("sr:add", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("addSerial");
});

export async function addSerial(conversation: Conversation<MyContext>, ctx: MyContext) {
  await ctx.reply(
    `${ce("tv")} <b>Yangi serial</b>\n\n1️⃣ Serial uchun <b>kod</b> (raqam) kiriting.`,
    { reply_markup: cancelKeyboard() }
  );

  let code = 0;
  while (true) {
    const c = await conversation.wait();
    if (isCancel(c.message?.text)) return stop(c);
    const t = c.message?.text?.trim() ?? "";
    if (!/^\d+$/.test(t)) {
      await c.reply("❌ Faqat raqam kiriting.");
      continue;
    }
    code = Number(t);
    const exists = await conversation.external(() =>
      prisma.serial.findUnique({ where: { code } })
    );
    if (exists) {
      await c.reply("⚠️ Bu kod band.");
      continue;
    }
    break;
  }

  await ctx.reply("2️⃣ Serial <b>nomini</b> kiriting.");
  const titleCtx = await conversation.wait();
  if (isCancel(titleCtx.message?.text)) return stop(titleCtx);
  const title = titleCtx.message?.text?.trim() || "Nomsiz";

  await ctx.reply("3️⃣ Tavsif/yili — ixtiyoriy. Kerak bo'lmasa <code>-</code>.");
  const capCtx = await conversation.wait();
  if (isCancel(capCtx.message?.text)) return stop(capCtx);
  const cap = capCtx.message?.text?.trim() ?? "-";

  const serial = await conversation.external(() =>
    prisma.serial.create({
      data: { code, title, caption: cap === "-" ? null : cap },
    })
  );

  await ctx.reply(
    `${ce("check")} Serial qo'shildi: <b>${e.escapeHtml(serial.title)}</b> (kod <code>${serial.code}</code>)\n` +
      `Endi "🎞 Qism qo'shish" orqali sezon va qismlarni qo'shing.`,
    { reply_markup: adminMenuKeyboard() }
  );
}

// ============ QISM QO'SHISH ============
serialsHandler.callbackQuery("sr:addep", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("addEpisode");
});

export async function addEpisode(conversation: Conversation<MyContext>, ctx: MyContext) {
  await ctx.reply(
    `🎞 <b>Qism qo'shish</b>\n\n1️⃣ Qaysi serial? Serial <b>kodini</b> kiriting.`,
    { reply_markup: cancelKeyboard() }
  );

  let serialId = 0;
  let serialTitle = "";
  while (true) {
    const c = await conversation.wait();
    if (isCancel(c.message?.text)) return stop(c);
    const t = c.message?.text?.trim() ?? "";
    if (!/^\d+$/.test(t)) {
      await c.reply("❌ Faqat raqam (serial kodi).");
      continue;
    }
    const serial = await conversation.external(() =>
      prisma.serial.findUnique({ where: { code: Number(t) } })
    );
    if (!serial) {
      await c.reply("❌ Bunday kodli serial yo'q.");
      continue;
    }
    serialId = serial.id;
    serialTitle = serial.title;
    break;
  }

  await ctx.reply("2️⃣ <b>Sezon</b> raqamini kiriting (masalan 1).");
  let seasonNum = 0;
  while (true) {
    const c = await conversation.wait();
    if (isCancel(c.message?.text)) return stop(c);
    const t = c.message?.text?.trim() ?? "";
    if (!/^\d+$/.test(t)) {
      await c.reply("❌ Faqat raqam.");
      continue;
    }
    seasonNum = Number(t);
    break;
  }

  await ctx.reply("3️⃣ <b>Qism</b> raqamini kiriting (masalan 1).");
  let epNum = 0;
  while (true) {
    const c = await conversation.wait();
    if (isCancel(c.message?.text)) return stop(c);
    const t = c.message?.text?.trim() ?? "";
    if (!/^\d+$/.test(t)) {
      await c.reply("❌ Faqat raqam.");
      continue;
    }
    epNum = Number(t);
    break;
  }

  await ctx.reply("4️⃣ Endi qism <b>videosini</b> yuboring.");
  const vidCtx = await conversation.wait();
  if (isCancel(vidCtx.message?.text)) return stop(vidCtx);
  const video = vidCtx.message?.video;
  if (!video) {
    await vidCtx.reply("❌ Bu video emas.", { reply_markup: adminMenuKeyboard() });
    return;
  }
  const fileId = video.file_id;

  // baza kanalga tashlash
  let baseMsgId: number | null = null;
  if (config.baseChannelId) {
    try {
      const sent = await ctx.api.sendVideo(config.baseChannelId, fileId, {
        caption: `#serial ${e.escapeHtml(serialTitle)} · S${seasonNum}E${epNum}`,
      });
      baseMsgId = sent.message_id;
    } catch {
      /* ignore */
    }
  }

  // sezon + qismni saqlash
  const result = await conversation.external(async () => {
    const season = await prisma.season.upsert({
      where: { serialId_number: { serialId, number: seasonNum } },
      create: { serialId, number: seasonNum },
      update: {},
    });
    return prisma.episode.upsert({
      where: { seasonId_number: { seasonId: season.id, number: epNum } },
      create: { seasonId: season.id, number: epNum, fileId, baseMsgId },
      update: { fileId, baseMsgId },
    });
  });

  await ctx.reply(
    `${ce("check")} Qism saqlandi: <b>${e.escapeHtml(serialTitle)}</b> — ${seasonNum}-sezon, ${result.number}-qism.\n` +
      `Yana qism qo'shish uchun "🎞 Qism qo'shish".`,
    { reply_markup: adminMenuKeyboard() }
  );
}

// ============ RO'YXAT ============
serialsHandler.callbackQuery("sr:list", async (ctx) => {
  await ctx.answerCallbackQuery();
  const serials = await prisma.serial.findMany({
    orderBy: { code: "asc" },
    include: { _count: { select: { seasons: true } }, seasons: { include: { _count: { select: { episodes: true } } } } },
  });
  if (serials.length === 0) {
    await ctx.editMessageText("📭 Serial yo'q.", { reply_markup: serialMenu() }).catch(() => {});
    return;
  }
  const lines = serials.map((s) => {
    const eps = s.seasons.reduce((a, x) => a + x._count.episodes, 0);
    return `• <code>${s.code}</code> ${e.escapeHtml(s.title)} — ${s._count.seasons} sezon, ${eps} qism`;
  });
  await ctx.editMessageText(
    `${ce("list")} <b>Seriallar:</b>\n\n${lines.join("\n")}`,
    { reply_markup: new InlineKeyboard().text(`${DOT.white} ≫ Orqaga`, "sr:back") }
  ).catch(() => {});
});

serialsHandler.callbackQuery("sr:back", async (ctx) => {
  await ctx.answerCallbackQuery();
  const count = await prisma.serial.count();
  await ctx
    .editMessageText(`${ce("tv")} <b>Serial boshqaruvi</b>\n\nJami seriallar: <b>${count}</b>`, {
      reply_markup: serialMenu(),
    })
    .catch(() => {});
});

// ============ O'CHIRISH ============
serialsHandler.callbackQuery("sr:dellist", async (ctx) => {
  await ctx.answerCallbackQuery();
  const serials = await prisma.serial.findMany({ orderBy: { code: "asc" } });
  if (serials.length === 0) {
    await ctx.editMessageText("📭 Serial yo'q.", { reply_markup: serialMenu() }).catch(() => {});
    return;
  }
  const kb = new InlineKeyboard();
  for (const s of serials) kb.text(`🗑 ${s.code} · ${s.title}`, `sr:delconf:${s.id}`).row();
  kb.text(`${DOT.white} ≫ Orqaga`, "sr:back");
  await ctx.editMessageText("🗑 Qaysi serialni o'chirasiz? (barcha sezon/qismlari bilan)", {
    reply_markup: kb,
  }).catch(() => {});
});

serialsHandler.callbackQuery(/^sr:delconf:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await prisma.serial.delete({ where: { id } }).catch(() => {});
  await ctx.answerCallbackQuery({ text: "🗑 O'chirildi" });
  await ctx.editMessageText("🗑 Serial o'chirildi.").catch(() => {});
});
