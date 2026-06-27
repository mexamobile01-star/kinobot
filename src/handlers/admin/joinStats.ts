import { Composer } from "grammy";
import { prisma } from "../../prisma.js";
import { e } from "../../utils/emoji.js";
import { ibtn, BE, kb } from "../../utils/keyboard.js";
import type { MyContext } from "../../types.js";

export const joinStatsHandler = new Composer<MyContext>();

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** So'rovlar statistikasini chizadi (callback javobini bermaydi) */
async function renderStats(ctx: MyContext, edit = true) {
  const channels = await prisma.channel.findMany({
    where: { type: "REQUEST", isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  if (channels.length === 0) {
    const text = "📊 <b>So'rovlar statistikasi</b>\n\nSo'rovli kanal qo'shilmagan.";
    const markup = kb([ibtn("Orqaga", "ch:menu", undefined, BE.backMenu)]);
    if (edit) await ctx.editMessageText(text, { reply_markup: markup }).catch(() => {});
    else await ctx.reply(text, { reply_markup: markup });
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

  const totalPending = await prisma.joinRequest.count({ where: { status: "pending" } });

  const rows: ReturnType<typeof ibtn>[][] = [];
  if (totalPending > 0) {
    rows.push([
      ibtn("✅ 10%", "jr:approve:10", "success"),
      ibtn("✅ 30%", "jr:approve:30", "success"),
      ibtn("✅ 50%", "jr:approve:50", "success"),
    ]);
    rows.push([
      ibtn(`✅ Hammasini (${totalPending})`, "jr:approve:all", "success", BE.check),
    ]);
    rows.push([
      ibtn("✏️ Sonini yozib qabul qilish", "jr:approvecustom", "primary"),
    ]);
  }
  rows.push([
    ibtn("🔄 Yangilash", "ch:jrstats", "primary"),
    ibtn("Orqaga", "ch:menu", undefined, BE.backMenu),
  ]);

  const text =
    `📊 <b>So'rovlar statistikasi</b>\n\n${lines.join("\n\n")}\n\n` +
    (totalPending > 0 ? `⏳ Jami kutilmoqda: <b>${totalPending}</b>` : `✅ Kutilayotgan so'rov yo'q.`);

  if (edit) await ctx.editMessageText(text, { reply_markup: kb(...rows) }).catch(() => {});
  else await ctx.reply(text, { reply_markup: kb(...rows) });
}

joinStatsHandler.callbackQuery("ch:jrstats", async (ctx) => {
  await ctx.answerCallbackQuery();
  await renderStats(ctx);
});

/** Pending so'rovlarni tasdiqlaydi, tasdiqlangan sonni qaytaradi */
async function approveRequests(ctx: MyContext, limit?: number) {
  const pending = await prisma.joinRequest.findMany({
    where: { status: "pending" },
    orderBy: { date: "asc" },
    ...(limit ? { take: limit } : {}),
  });

  let approved = 0, failed = 0;
  for (const req of pending) {
    try {
      await ctx.api.approveChatJoinRequest(Number(req.channelId), Number(req.userId));
      await prisma.joinRequest.update({ where: { id: req.id }, data: { status: "approved" } });
      approved++;
    } catch {
      failed++;
    }
  }
  return { approved, failed };
}

// ============ TASDIQLASH — FOIZ / HAMMASI ============
joinStatsHandler.callbackQuery(/^jr:approve:(\d+|all)$/, async (ctx) => {
  const arg = ctx.match[1];

  const totalPending = await prisma.joinRequest.count({ where: { status: "pending" } });
  if (totalPending === 0) {
    await ctx.answerCallbackQuery({ text: "Kutilayotgan so'rov yo'q.", show_alert: true });
    return;
  }

  let limit: number | undefined;
  if (arg !== "all") {
    const pct = Number(arg) / 100;
    limit = Math.max(1, Math.round(totalPending * pct));
  }

  await ctx.answerCallbackQuery({ text: "Tasdiqlanmoqda..." });
  const { approved, failed } = await approveRequests(ctx, limit);

  await renderStats(ctx);
  await ctx.reply(
    `✅ <b>${approved}</b> ta so'rov tasdiqlandi.` +
    (failed > 0 ? `\n⚠️ ${failed} ta tasdiqlanmadi (eskirgan yoki bot huquqi yetmaydi).` : "")
  );
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
  if (text === "❌ Bekor qilish" || text === "/cancel") {
    if (ctx.session.scratch) delete ctx.session.scratch.approveCustomCount;
    await ctx.reply("❌ Bekor qilindi.");
    return;
  }
  if (!/^\d+$/.test(text)) {
    await ctx.reply("❌ Faqat raqam kiriting.");
    return;
  }

  const count = Number(text);
  if (ctx.session.scratch) delete ctx.session.scratch.approveCustomCount;

  const { approved, failed } = await approveRequests(ctx, count);
  await ctx.reply(
    `✅ <b>${approved}</b> ta so'rov tasdiqlandi.` +
    (failed > 0 ? `\n⚠️ ${failed} ta tasdiqlanmadi.` : "")
  );
  await renderStats(ctx, false);
});
