import { Composer } from "grammy";
import { prisma } from "../../prisma.js";
import { e } from "../../utils/emoji.js";
import { ibtn, BE, kb } from "../../utils/keyboard.js";
import type { MyContext } from "../../types.js";

export const joinStatsHandler = new Composer<MyContext>();

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

joinStatsHandler.callbackQuery("ch:jrstats", async (ctx) => {
  await ctx.answerCallbackQuery();

  const channels = await prisma.channel.findMany({
    where: { type: "REQUEST", isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  if (channels.length === 0) {
    await ctx.editMessageText(
      "📊 <b>So'rovlar statistikasi</b>\n\nSo'rovli kanal qo'shilmagan.",
      { reply_markup: kb([ibtn("Orqaga", "ch:menu", undefined, BE.backMenu)]) }
    ).catch(() => {});
    return;
  }

  const now   = new Date();
  const today = startOfDay(now);
  const yest  = new Date(today); yest.setDate(yest.getDate() - 1);
  const month = new Date(today); month.setDate(1);

  const lines: string[] = [];

  for (const ch of channels) {
    const cid = ch.chatId;
    const [total, todayN, yestN, monthN, pending] = await Promise.all([
      prisma.joinRequest.count({ where: { channelId: cid } }),
      prisma.joinRequest.count({ where: { channelId: cid, date: { gte: today } } }),
      prisma.joinRequest.count({ where: { channelId: cid, date: { gte: yest, lt: today } } }),
      prisma.joinRequest.count({ where: { channelId: cid, date: { gte: month } } }),
      prisma.joinRequest.count({ where: { channelId: cid, status: "pending" } }),
    ]);

    lines.push(
      `📢 <b>${e.escapeHtml(ch.title)}</b>\n` +
      `  Bugun: <b>${todayN}</b> | Kecha: <b>${yestN}</b>\n` +
      `  Bu oy: <b>${monthN}</b> | Jami: <b>${total}</b>\n` +
      `  Kutilmoqda: <b>${pending}</b>`
    );
  }

  // Umumiy pending soni
  const totalPending = await prisma.joinRequest.count({ where: { status: "pending" } });

  const rows: ReturnType<typeof ibtn>[][] = [];
  if (totalPending > 0) {
    rows.push([
      ibtn(`✅ 10% qabul`,   "jr:approve:10",  "success"),
      ibtn(`✅ 30% qabul`,   "jr:approve:30",  "success"),
      ibtn(`✅ 50% qabul`,   "jr:approve:50",  "success"),
    ]);
    rows.push([
      ibtn(`✅ Hammasini qabul (${totalPending})`, "jr:approve:all", "success", BE.check),
    ]);
    rows.push([
      ibtn("✏️ Sonini yozib qabul qilish", "jr:approvecustom", "primary"),
    ]);
  }
  rows.push([ibtn("🔄 Yangilash", "ch:jrstats", "primary"), ibtn("Orqaga", "ch:menu", undefined, BE.backMenu)]);

  await ctx.editMessageText(
    `📊 <b>So'rovlar statistikasi</b>\n\n${lines.join("\n\n")}\n\n` +
    (totalPending > 0 ? `⏳ Jami kutilmoqda: <b>${totalPending}</b>` : `✅ Kutilayotgan so'rov yo'q.`),
    { reply_markup: kb(...rows) }
  ).catch(() => {});
});

// ============ TASDIQLASH — FOIZ ============
joinStatsHandler.callbackQuery(/^jr:approve:(\d+|all)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Tasdiqlanmoqda..." });

  const arg = ctx.match[1];
  const pending = await prisma.joinRequest.findMany({
    where: { status: "pending" },
    orderBy: { date: "asc" },
  });

  if (pending.length === 0) {
    await ctx.answerCallbackQuery({ text: "Kutilayotgan so'rov yo'q.", show_alert: true });
    return;
  }

  let toApprove = pending;
  if (arg !== "all") {
    const pct = Number(arg) / 100;
    const count = Math.max(1, Math.round(pending.length * pct));
    toApprove = pending.slice(0, count);
  }

  let approved = 0;
  for (const req of toApprove) {
    try {
      await ctx.api.approveChatJoinRequest(Number(req.channelId), Number(req.userId));
      await prisma.joinRequest.update({
        where: { id: req.id },
        data: { status: "approved" },
      });
      approved++;
    } catch {
      // Ignore individual errors
    }
  }

  await ctx.answerCallbackQuery({ text: `✅ ${approved} ta so'rov tasdiqlandi.`, show_alert: true });
  // Statistikani yangilaymiz
  await ctx.callbackQuery?.message; // trigger refresh
});

// ============ MAXSUS SON YOZISH ============
joinStatsHandler.callbackQuery("jr:approvecustom", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.scratch = { ...(ctx.session.scratch ?? {}), approveCustomCount: true };
  await ctx.reply("Nechta so'rovni tasdiqlash kerak? Sonni yuboring:");
});

joinStatsHandler.on("message:text", async (ctx, next) => {
  if (!ctx.session.scratch?.approveCustomCount) return next();

  const text = ctx.message.text.trim();
  if (!/^\d+$/.test(text)) {
    await ctx.reply("❌ Faqat raqam kiriting.");
    return;
  }

  const count = Number(text);
  if (ctx.session.scratch) delete ctx.session.scratch.approveCustomCount;

  const pending = await prisma.joinRequest.findMany({
    where: { status: "pending" },
    orderBy: { date: "asc" },
    take: count,
  });

  let approved = 0;
  for (const req of pending) {
    try {
      await ctx.api.approveChatJoinRequest(Number(req.channelId), Number(req.userId));
      await prisma.joinRequest.update({
        where: { id: req.id },
        data: { status: "approved" },
      });
      approved++;
    } catch {
      // Ignore
    }
  }

  await ctx.reply(`✅ <b>${approved}</b> ta so'rov tasdiqlandi.`);
});
