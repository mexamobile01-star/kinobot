import { Composer } from "grammy";
import { isOwner, adminCan } from "../../config.js";
import { prisma } from "../../prisma.js";
import { e } from "../../utils/emoji.js";
import { ADMIN_MENU_BUTTONS, ibtn, BE, kb, adminMenuKeyboard } from "../../utils/keyboard.js";
import type { MyContext } from "../../types.js";

export const funnelHandler = new Composer<MyContext>();

// ─── Session yordamchilari ───────────────────────────────────────────────────

type FState = "title" | "question" | "options" | "sendTarget" | "sendDateFrom" | "sendDateTo" | "sendSurvey";

interface FData {
  state: FState;
  surveyId?: number;
  title?: string;
  question?: string;
  options: string[];
  sendDateFrom?: string;
}

function getF(ctx: MyContext): FData | null { return (ctx.session.scratch?.funnel as FData) ?? null; }
function setF(ctx: MyContext, d: FData) { ctx.session.scratch = { ...(ctx.session.scratch ?? {}), funnel: d }; }
function clearF(ctx: MyContext) { if (ctx.session.scratch) delete ctx.session.scratch.funnel; }

function parseDate(s: string): Date | null {
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return isNaN(d.getTime()) ? null : d;
}

// ─── Asosiy menyu ────────────────────────────────────────────────────────────

function funnelMenu() {
  return kb(
    [ibtn("So'rovnoma yaratish",  "fn:create",  "success", BE.chAdd)],
    [ibtn("Natijalar",            "fn:results", "primary", BE.stats)],
    [ibtn("So'rovnoma yuborish",  "fn:send",    "primary", BE.broadcast)],
    [ibtn("O'chirish",            "fn:delete",  "danger",  BE.chDelete)],
    [ibtn("Orqaga",               "bc:menu",    undefined, BE.backMenu)],
  );
}

funnelHandler.hears(ADMIN_MENU_BUTTONS.funnel, async (ctx) => {
  if (!adminCan(ctx.from?.id ?? 0, "funnel")) return;
  clearF(ctx);
  await ctx.reply("<b>Funnel — So'rovnomalar</b>", { reply_markup: funnelMenu() });
});

funnelHandler.callbackQuery("fn:close", async (ctx) => {
  await ctx.answerCallbackQuery();
  clearF(ctx);
  await ctx.deleteMessage().catch(() => {});
  await ctx.reply("Admin panel:", { reply_markup: adminMenuKeyboard(ctx.from.id) });
});

funnelHandler.callbackQuery("fn:menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  clearF(ctx);
  await ctx.editMessageText("<b>Funnel — So'rovnomalar</b>", { reply_markup: funnelMenu() }).catch(() => {});
});

// ─── Yaratish ────────────────────────────────────────────────────────────────

funnelHandler.callbackQuery("fn:create", async (ctx) => {
  await ctx.answerCallbackQuery();
  setF(ctx, { state: "title", options: [] });
  await ctx.editMessageText(
    "1️⃣ So'rovnoma <b>sarlavhasini</b> kiriting (admin uchun, foydalanuvchiga ko'rinmaydi):",
    { reply_markup: kb([ibtn("❌ Bekor", "fn:menu", "danger")]) }
  ).catch(() => {});
});

// ─── Natijalar ───────────────────────────────────────────────────────────────

funnelHandler.callbackQuery("fn:results", async (ctx) => {
  await ctx.answerCallbackQuery();
  const surveys = await prisma.survey.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  if (surveys.length === 0) {
    await ctx.answerCallbackQuery({ text: "Hozircha so'rovnoma yo'q.", show_alert: true });
    return;
  }
  const rows = surveys.map((s) => [ibtn(s.title, `fn:stat:${s.id}`, "primary")]);
  rows.push([ibtn("Orqaga", "fn:menu", undefined, BE.backMenu)]);
  await ctx.editMessageText("<b>Qaysi so'rovnoma natijasi?</b>", { reply_markup: kb(...rows) }).catch(() => {});
});

funnelHandler.callbackQuery(/^fn:stat:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const survey = await prisma.survey.findUnique({
    where: { id: Number(ctx.match[1]) },
    include: {
      options: {
        orderBy: { sortOrder: "asc" },
        include: { _count: { select: { responses: true } } },
      },
    },
  });
  if (!survey) return;

  const totalSent = survey.sentCount;
  const totalAnswered = await prisma.surveyResponse.count({ where: { surveyId: survey.id } });
  const notAnswered = Math.max(0, totalSent - totalAnswered);

  const lines = [
    `<b>${e.escapeHtml(survey.title)}</b>`,
    `${e.escapeHtml(survey.question)}`,
    ``,
    `Yuborilgan: <b>${totalSent}</b>`,
    `Javob berdi: <b>${totalAnswered}</b>`,
    `Javob bermadi: <b>${notAnswered}</b>`,
    ``,
    `<b>Natijalar:</b>`,
  ];

  for (const opt of survey.options) {
    const cnt = opt._count.responses;
    const pct = totalAnswered > 0 ? Math.round((cnt / totalAnswered) * 100) : 0;
    const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
    lines.push(`${e.escapeHtml(opt.text)}: <b>${cnt}</b> (${pct}%)\n${bar}`);
  }

  await ctx.editMessageText(
    lines.join("\n"),
    { reply_markup: kb(
      [ibtn("Viloyat bo'yicha", `fn:statregion:${survey.id}`, "primary", BE.trend)],
      [ibtn("Orqaga", "fn:results", undefined, BE.backMenu)],
    )}
  ).catch(() => {});
});

funnelHandler.callbackQuery(/^fn:statregion:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const surveyId = Number(ctx.match[1]);

  const responses = await prisma.surveyResponse.findMany({
    where: { surveyId },
    include: { option: true },
  });

  const byRegion: Record<string, Record<string, number>> = {};
  for (const r of responses) {
    const user = await prisma.user.findUnique({ where: { id: r.userId }, select: { region: true } });
    const region = user?.region ?? "Noma'lum";
    if (!byRegion[region]) byRegion[region] = {};
    const optText = r.option.text;
    byRegion[region][optText] = (byRegion[region][optText] ?? 0) + 1;
  }

  const lines = ["<b>Viloyat bo'yicha natijalar:</b>", ""];
  for (const [region, opts] of Object.entries(byRegion).sort()) {
    const total = Object.values(opts).reduce((a, b) => a + b, 0);
    lines.push(`<b>${e.escapeHtml(region)}</b>: ${total} ta`);
    for (const [opt, cnt] of Object.entries(opts)) {
      lines.push(`  • ${e.escapeHtml(opt)}: ${cnt}`);
    }
  }

  await ctx.editMessageText(
    lines.join("\n"),
    { reply_markup: kb([ibtn("Orqaga", `fn:stat:${surveyId}`, undefined, BE.backMenu)]) }
  ).catch(() => {});
});

// ─── Yuborish ────────────────────────────────────────────────────────────────

funnelHandler.callbackQuery("fn:send", async (ctx) => {
  await ctx.answerCallbackQuery();
  const surveys = await prisma.survey.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  if (surveys.length === 0) {
    await ctx.answerCallbackQuery({ text: "Hozircha so'rovnoma yo'q.", show_alert: true });
    return;
  }
  const rows = surveys.map((s) => [ibtn(s.title, `fn:sendsurvey:${s.id}`, "primary")]);
  rows.push([ibtn("Orqaga", "fn:menu", undefined, BE.backMenu)]);
  await ctx.editMessageText("<b>Qaysi so'rovnomani yuborasiz?</b>", { reply_markup: kb(...rows) }).catch(() => {});
});

funnelHandler.callbackQuery(/^fn:sendsurvey:(\d+)$/, async (ctx) => {
  const surveyId = Number(ctx.match[1]);
  await ctx.answerCallbackQuery();
  setF(ctx, { state: "sendTarget", surveyId, options: [] });
  const count = await prisma.user.count({ where: { isBlocked: false } });
  await ctx.editMessageText(
    `<b>So'rovnoma yuborish</b>\n\nKimga yuborasiz?`,
    {
      reply_markup: kb(
        [ibtn(`Hammaga (${count})`, `fn:dosend:all`, "primary", BE.stats)],
        [ibtn("Sana oralig'i bo'yicha", `fn:dosend:daterange`, "primary")],
        [ibtn("Orqaga", "fn:send", undefined, BE.backMenu)],
      ),
    }
  ).catch(() => {});
});

funnelHandler.callbackQuery(/^fn:dosend:(all|daterange)$/, async (ctx) => {
  const mode = ctx.match[1];
  const f = getF(ctx);
  if (!f?.surveyId) { await ctx.answerCallbackQuery(); return; }

  if (mode === "daterange") {
    await ctx.answerCallbackQuery();
    f.state = "sendDateFrom";
    setF(ctx, f);
    await ctx.editMessageText(
      "Boshlanish sanasini kiriting (DD.MM.YYYY):",
      { reply_markup: kb([ibtn("❌ Bekor", "fn:menu", "danger")]) }
    ).catch(() => {});
    return;
  }

  await ctx.answerCallbackQuery({ text: "Yuborilmoqda..." });
  await sendSurveyToUsers(ctx, f.surveyId, "all");
});

async function sendSurveyToUsers(ctx: MyContext, surveyId: number, targetType: string, from?: Date, to?: Date) {
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: { options: { orderBy: { sortOrder: "asc" } } },
  });
  if (!survey) return;

  let whereClause: Parameters<typeof prisma.user.findMany>[0] = { where: { isBlocked: false } };
  if (from && to) {
    whereClause = { where: { isBlocked: false, createdAt: { gte: from, lte: to } } };
  }

  const users = await prisma.user.findMany({ ...whereClause, select: { id: true } });
  const total = users.length;

  const ikb = {
    inline_keyboard: survey.options.map((o) => [
      { text: o.text, callback_data: `svr:ans:${surveyId}:${o.id}` },
    ]),
  };

  let sent = 0;
  const statusMsg = await ctx.reply(`Yuborilmoqda: 0 / ${total}...`);

  for (let i = 0; i < users.length; i++) {
    try {
      await ctx.api.sendMessage(Number(users[i].id), survey.question, {
        reply_markup: ikb,
        parse_mode: "HTML",
      });
      sent++;
    } catch {
      await prisma.user.update({ where: { id: users[i].id }, data: { isBlocked: true } }).catch(() => null);
    }
    if ((i + 1) % 50 === 0 || i === users.length - 1) {
      await ctx.api.editMessageText(ctx.chat!.id, statusMsg.message_id, `⏳ ${i + 1} / ${total}...`).catch(() => {});
    }
    if (i % 25 === 0 && i > 0) await new Promise((r) => setTimeout(r, 1000));
  }

  await prisma.survey.update({ where: { id: surveyId }, data: { sentCount: { increment: sent } } });

  clearF(ctx);
  await ctx.api.editMessageText(
    ctx.chat!.id, statusMsg.message_id,
    `<b>Yuborildi!</b>\n\nYuborildi: <b>${sent}</b>\nYuborilmadi: <b>${total - sent}</b>`
  ).catch(() => {});
}

// ─── O'chirish ───────────────────────────────────────────────────────────────

funnelHandler.callbackQuery("fn:delete", async (ctx) => {
  await ctx.answerCallbackQuery();
  const surveys = await prisma.survey.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  if (surveys.length === 0) {
    await ctx.answerCallbackQuery({ text: "So'rovnoma yo'q.", show_alert: true });
    return;
  }
  const rows = surveys.map((s) => [ibtn(s.title, `fn:delconf:${s.id}`, "danger", BE.chDelete)]);
  rows.push([ibtn("Orqaga", "fn:menu", undefined, BE.backMenu)]);
  await ctx.editMessageText("<b>Qaysi so'rovnomani o'chirasiz?</b>", { reply_markup: kb(...rows) }).catch(() => {});
});

funnelHandler.callbackQuery(/^fn:delconf:(\d+)$/, async (ctx) => {
  await prisma.survey.delete({ where: { id: Number(ctx.match[1]) } }).catch(() => {});
  await ctx.answerCallbackQuery({ text: "O'chirildi." });
  await ctx.editMessageText("So'rovnoma o'chirildi.", { reply_markup: kb([ibtn("Orqaga", "fn:menu", undefined, BE.backMenu)]) }).catch(() => {});
});

// ─── Matn kiritish (message handler) ────────────────────────────────────────

funnelHandler.on("message:text", async (ctx, next) => {
  if (!adminCan(ctx.from?.id ?? 0, "funnel")) return next();
  const f = getF(ctx);
  if (!f) return next();

  const text = ctx.message.text.trim();

  if (text === "❌ Bekor" || text === "/cancel") {
    clearF(ctx);
    await ctx.reply("❌ Bekor qilindi.");
    return;
  }

  if (f.state === "title") {
    f.title = text.slice(0, 100);
    f.state = "question";
    setF(ctx, f);
    await ctx.reply("2️⃣ Foydalanuvchiga ko'rsatiladigan <b>savol</b> matnini kiriting:");
    return;
  }

  if (f.state === "question") {
    f.question = text.slice(0, 500);
    f.state = "options";
    setF(ctx, f);
    await ctx.reply(
      `3️⃣ Javob <b>variantlarini</b> kiriting — har biri alohida xabar.\n` +
      `Tugatish uchun <b>Tayyor</b> deb yozing.\n\n` +
      `<i>Viloyat so'rovnomasini yaratayotgan bo'lsangiz, har bir variant viloyat nomi bo'lsin.</i>`,
      { reply_markup: kb([ibtn("✅ Tayyor", "fn:optsdone", "success"), ibtn("❌ Bekor", "fn:menu", "danger")]) }
    );
    return;
  }

  if (f.state === "options") {
    if (text.toLowerCase() === "tayyor") {
      await saveSurvey(ctx, f);
      return;
    }
    f.options.push(text.slice(0, 100));
    setF(ctx, f);
    await ctx.reply(
      `✅ Variant qo'shildi: <b>${e.escapeHtml(text.slice(0, 100))}</b>\n\n` +
      `Jami: ${f.options.length} ta variant. Yana kiriting yoki <b>Tayyor</b> deng:`,
      { reply_markup: kb([ibtn("✅ Tayyor", "fn:optsdone", "success"), ibtn("❌ Bekor", "fn:menu", "danger")]) }
    );
    return;
  }

  if (f.state === "sendDateFrom") {
    const d = parseDate(text);
    if (!d) { await ctx.reply("❌ Format: <code>DD.MM.YYYY</code>"); return; }
    f.sendDateFrom = text;
    f.state = "sendDateTo";
    setF(ctx, f);
    await ctx.reply("Tugash sanasini kiriting (DD.MM.YYYY):");
    return;
  }

  if (f.state === "sendDateTo") {
    const d = parseDate(text);
    if (!d) { await ctx.reply("❌ Format: <code>DD.MM.YYYY</code>"); return; }
    const from = parseDate(f.sendDateFrom!)!;
    const to = new Date(d); to.setHours(23, 59, 59, 999);
    if (!f.surveyId) return;
    await ctx.reply("⏳ Yuborilmoqda...");
    await sendSurveyToUsers(ctx, f.surveyId, "daterange", from, to);
    return;
  }

  return next();
});

funnelHandler.callbackQuery("fn:optsdone", async (ctx) => {
  await ctx.answerCallbackQuery();
  const f = getF(ctx);
  if (!f) return;
  await saveSurvey(ctx, f);
});

async function saveSurvey(ctx: MyContext, f: FData) {
  if (!f.title || !f.question) { await ctx.reply("❌ Sarlavha yoki savol yo'q."); return; }
  if (f.options.length < 2) { await ctx.reply("❌ Kamida 2 ta variant kerak."); return; }

  const isRegion = f.options.some((o) =>
    /viloyat|shahar|toshkent|samarqand|farg|buxoro|xorazm|qashqadaryo|surxondaryo|jizzax|sirdaryo|navoiy|andijon|namangan/i.test(o)
  );

  const survey = await prisma.survey.create({
    data: {
      title: f.title,
      question: f.question,
      isRegionSurvey: isRegion,
      options: {
        create: f.options.map((text, i) => ({ text, sortOrder: i })),
      },
    },
  });

  clearF(ctx);
  await ctx.reply(
    `<b>So'rovnoma yaratildi!</b>\n\n` +
    `Sarlavha: <b>${e.escapeHtml(f.title)}</b>\n` +
    `Savol: ${e.escapeHtml(f.question)}\n` +
    `Variantlar: <b>${f.options.length}</b> ta\n` +
    (isRegion ? `Viloyat so'rovnomasi sifatida belgilandi.` : ""),
    { reply_markup: kb(
      [ibtn("Hozir yuborish", `fn:sendsurvey:${survey.id}`, "success", BE.broadcast)],
      [ibtn("Menyuga",        "fn:menu",                    "primary", BE.backMenu)],
    )}
  );
}
