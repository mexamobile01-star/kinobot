import { Composer } from "grammy";
import { isOwner, adminCan } from "../../config.js";
import { prisma } from "../../prisma.js";
import { ce, e } from "../../utils/emoji.js";
import { ADMIN_MENU_BUTTONS, adminMenuKeyboard, ibtn, BE, kb } from "../../utils/keyboard.js";
import { resolveButtonStyle } from "../../utils/contentButton.js";
import type { MyContext } from "../../types.js";

export const broadcastHandler = new Composer<MyContext>();

// ─── Yordamchi tiplar ────────────────────────────────────────────────────────

interface InlineBtn {
  text: string;
  url: string;
  style: string;
}

interface BcastData {
  state: string;
  target: { type: string; dateFrom?: string; dateTo?: string; region?: string; surveyId?: number; optionId?: number };
  templateChatId?: number;
  templateMsgId?: number;
  buttons: InlineBtn[][];
  pendingBtnText?: string;
}

function getBcast(ctx: MyContext): BcastData | null {
  return (ctx.session.scratch?.bcast as BcastData) ?? null;
}
function setBcast(ctx: MyContext, d: BcastData) {
  ctx.session.scratch = { ...(ctx.session.scratch ?? {}), bcast: d };
}
function clearBcast(ctx: MyContext) {
  if (ctx.session.scratch) delete ctx.session.scratch.bcast;
}

function buildInlineKb(buttons: InlineBtn[][]) {
  if (!buttons.length) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inline_keyboard: any[][] = buttons.map((row) =>
    row.map((b) => ({ text: b.text, url: b.url, style: b.style }))
  );
  return { inline_keyboard };
}

function parseDate(s: string): Date | null {
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(d: Date) {
  return `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1).toString().padStart(2, "0")}.${d.getFullYear()}`;
}

// ─── Asosiy menyu ────────────────────────────────────────────────────────────

function broadcastMenu() {
  return kb(
    [
      ibtn("📤 Hammaga yuborish",       "bc:target:all",       "primary"),
      ibtn("📅 Sana oralig'i",          "bc:target:daterange", "primary"),
    ],
    [
      ibtn("🗺 Viloyat bo'yicha",        "bc:target:region",    "success"),
      ibtn("📊 Funnel javobchilari",     "bc:target:funnel",    "success"),
    ],
    [ibtn("📋 So'rovnomalar (Funnel)",   "fn:menu",             "primary", BE.trend)],
    [ibtn("Menyuga qaytish", "bc:close", undefined, BE.backMenu)],
  );
}

broadcastHandler.hears(ADMIN_MENU_BUTTONS.broadcast, async (ctx) => {
  if (!adminCan(ctx.from?.id ?? 0, "broadcast")) return;
  clearBcast(ctx);
  await ctx.reply(
    `${ce("fire")} <b>Xabar yuborish</b>\n\nKimga yubormoqchisiz?`,
    { reply_markup: broadcastMenu() }
  );
});

broadcastHandler.callbackQuery("bc:close", async (ctx) => {
  await ctx.answerCallbackQuery();
  clearBcast(ctx);
  await ctx.deleteMessage().catch(() => {});
  await ctx.reply("Admin panel:", { reply_markup: adminMenuKeyboard(ctx.from.id) });
});

broadcastHandler.callbackQuery("bc:menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  clearBcast(ctx);
  await ctx.editMessageText(
    `${ce("fire")} <b>Xabar yuborish</b>\n\nKimga yubormoqchisiz?`,
    { reply_markup: broadcastMenu() }
  ).catch(() => {});
});

// ─── Nishon tanlash ──────────────────────────────────────────────────────────

broadcastHandler.callbackQuery("bc:target:all", async (ctx) => {
  await ctx.answerCallbackQuery();
  const count = await prisma.user.count({ where: { isBlocked: false } });
  setBcast(ctx, { state: "compose", target: { type: "all" }, buttons: [] });
  await ctx.editMessageText(
    `👥 Jami: <b>${count}</b> ta foydalanuvchi\n\nXabarni yuboring (matn, rasm, video, fayl):`,
    { reply_markup: kb([ibtn("❌ Bekor", "bc:menu", "danger")]) }
  ).catch(() => {});
});

broadcastHandler.callbackQuery("bc:target:daterange", async (ctx) => {
  await ctx.answerCallbackQuery();
  setBcast(ctx, { state: "dateFrom", target: { type: "daterange" }, buttons: [] });
  await ctx.editMessageText(
    `📅 <b>Sana oralig'i bo'yicha</b>\n\nBoshlanish sanasini kiriting:\nFormat: <code>DD.MM.YYYY</code>`,
    { reply_markup: kb([ibtn("❌ Bekor", "bc:menu", "danger")]) }
  ).catch(() => {});
});

broadcastHandler.callbackQuery("bc:target:region", async (ctx) => {
  await ctx.answerCallbackQuery();
  const regions = await prisma.user.groupBy({
    by: ["region"],
    where: { region: { not: null }, isBlocked: false },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });

  if (regions.length === 0) {
    await ctx.answerCallbackQuery({
      text: "Hozircha hech bir foydalanuvchi viloyatini ko'rsatmagan.\nAvval Funnel orqali viloyat so'rovnomasini yuboring.",
      show_alert: true,
    });
    return;
  }

  const rows = regions.map((r) => [
    ibtn(`${r.region} (${r._count.id})`, `bc:region:${r.region}`, "primary"),
  ]);
  rows.push([ibtn("❌ Bekor", "bc:menu", "danger")]);

  await ctx.editMessageText(
    "🗺 <b>Qaysi viloyat/shaharga yubormoqchisiz?</b>",
    { reply_markup: kb(...rows) }
  ).catch(() => {});
});

broadcastHandler.callbackQuery(/^bc:region:(.+)$/, async (ctx) => {
  const region = ctx.match[1];
  const count = await prisma.user.count({ where: { region, isBlocked: false } });
  await ctx.answerCallbackQuery();
  setBcast(ctx, { state: "compose", target: { type: "region", region }, buttons: [] });
  await ctx.editMessageText(
    `🗺 Viloyat: <b>${e.escapeHtml(region)}</b>\n👥 Foydalanuvchilar: <b>${count}</b>\n\nXabarni yuboring:`,
    { reply_markup: kb([ibtn("❌ Bekor", "bc:menu", "danger")]) }
  ).catch(() => {});
});

broadcastHandler.callbackQuery("bc:target:funnel", async (ctx) => {
  await ctx.answerCallbackQuery();
  const surveys = await prisma.survey.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  if (surveys.length === 0) {
    await ctx.answerCallbackQuery({ text: "Hozircha so'rovnoma yaratilmagan.", show_alert: true });
    return;
  }
  const rows = surveys.map((s) => [ibtn(s.title, `bc:survey:${s.id}`, "primary")]);
  rows.push([ibtn("❌ Bekor", "bc:menu", "danger")]);
  await ctx.editMessageText(
    "📊 <b>Qaysi so'rovnoma javobchilariga yubormoqchisiz?</b>",
    { reply_markup: kb(...rows) }
  ).catch(() => {});
});

broadcastHandler.callbackQuery(/^bc:survey:(\d+)$/, async (ctx) => {
  const surveyId = Number(ctx.match[1]);
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: { options: { orderBy: { sortOrder: "asc" } } },
  });
  if (!survey) { await ctx.answerCallbackQuery(); return; }
  await ctx.answerCallbackQuery();
  const rows = survey.options.map((o) => {
    const cnt = 0; // will be filled later
    return [ibtn(o.text, `bc:survopt:${surveyId}:${o.id}`, "primary")];
  });
  rows.push([ibtn("📊 Barcha javobchilar", `bc:survopt:${surveyId}:0`, "success")]);
  rows.push([ibtn("❌ Bekor", "bc:menu", "danger")]);
  await ctx.editMessageText(
    `📊 <b>${e.escapeHtml(survey.title)}</b>\n\nQaysi javob berganlar?`,
    { reply_markup: kb(...rows) }
  ).catch(() => {});
});

broadcastHandler.callbackQuery(/^bc:survopt:(\d+):(\d+)$/, async (ctx) => {
  const [surveyId, optionId] = [Number(ctx.match[1]), Number(ctx.match[2])];
  const where = optionId === 0
    ? { surveyId }
    : { surveyId, optionId };
  const responses = await prisma.surveyResponse.findMany({ where, select: { userId: true } });
  const count = responses.length;
  await ctx.answerCallbackQuery();
  setBcast(ctx, { state: "compose", target: { type: "funnel", surveyId, optionId }, buttons: [] });
  await ctx.editMessageText(
    `📊 Javobchilar: <b>${count}</b> ta\n\nXabarni yuboring:`,
    { reply_markup: kb([ibtn("❌ Bekor", "bc:menu", "danger")]) }
  ).catch(() => {});
});

// ─── Xabar shabloni qabul qilish ─────────────────────────────────────────────

broadcastHandler.on("message", async (ctx, next) => {
  if (!adminCan(ctx.from?.id ?? 0, "broadcast")) return next();
  const bcast = getBcast(ctx);
  if (!bcast) return next();

  const text = ctx.message.text?.trim();

  // ── Sana kiritish ──
  if (bcast.state === "dateFrom") {
    if (text === "❌ Bekor") { clearBcast(ctx); await ctx.reply("Bekor."); return; }
    const d = parseDate(text ?? "");
    if (!d) { await ctx.reply("❌ Format: <code>DD.MM.YYYY</code>"); return; }
    bcast.target.dateFrom = text!;
    bcast.state = "dateTo";
    setBcast(ctx, bcast);
    await ctx.reply(
      `✅ Boshlanish: <b>${formatDate(d)}</b>\n\nTugash sanasini kiriting (shu sana kiradi):\nFormat: <code>DD.MM.YYYY</code>`,
      { reply_markup: kb([ibtn("❌ Bekor", "bc:menu", "danger")]) }
    );
    return;
  }

  if (bcast.state === "dateTo") {
    if (text === "❌ Bekor") { clearBcast(ctx); await ctx.reply("Bekor."); return; }
    const d = parseDate(text ?? "");
    if (!d) { await ctx.reply("❌ Format: <code>DD.MM.YYYY</code>"); return; }
    const from = parseDate(bcast.target.dateFrom!)!;
    const to = new Date(d); to.setHours(23, 59, 59, 999);
    const count = await prisma.user.count({
      where: { isBlocked: false, createdAt: { gte: from, lte: to } },
    });
    bcast.target.dateTo = text!;
    bcast.state = "compose";
    setBcast(ctx, bcast);
    await ctx.reply(
      `✅ Sana: <b>${formatDate(from)} – ${formatDate(d)}</b>\n👥 Foydalanuvchilar: <b>${count}</b>\n\nXabarni yuboring:`,
      { reply_markup: kb([ibtn("❌ Bekor", "bc:menu", "danger")]) }
    );
    return;
  }

  // ── Knopka matni ──
  if (bcast.state === "btnText") {
    if (text === "❌ Bekor") { bcast.state = "preview"; setBcast(ctx, bcast); await showPreview(ctx, bcast); return; }
    bcast.pendingBtnText = text?.slice(0, 64) ?? "";
    bcast.state = "btnUrl";
    setBcast(ctx, bcast);
    await ctx.reply("🔗 Knopka URL ini kiriting (https://...):");
    return;
  }

  // ── Knopka URL ──
  if (bcast.state === "btnUrl") {
    if (text === "❌ Bekor") { bcast.state = "preview"; setBcast(ctx, bcast); await showPreview(ctx, bcast); return; }
    const url = text?.trim() ?? "";
    if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("tg://")) {
      await ctx.reply("❌ URL <code>https://</code> bilan boshlanishi kerak.");
      return;
    }
    await ctx.reply(
      "🎨 Knopka rangini tanlang:",
      {
        reply_markup: kb(
          [
            ibtn("Ko'k",   `bc:btnstyle:primary:${encodeURIComponent(url)}`, "primary"),
            ibtn("Yashil", `bc:btnstyle:success:${encodeURIComponent(url)}`, "success"),
            ibtn("Qizil",  `bc:btnstyle:danger:${encodeURIComponent(url)}`,  "danger"),
            ibtn("Random", `bc:btnstyle:random:${encodeURIComponent(url)}`,  "success"),
          ],
        ),
      }
    );
    return;
  }

  // ── Xabar shabloni ──
  if (bcast.state === "compose") {
    bcast.templateChatId = ctx.chat.id;
    bcast.templateMsgId  = ctx.message.message_id;
    bcast.state = "preview";
    setBcast(ctx, bcast);
    await showPreview(ctx, bcast);
    return;
  }

  return next();
});

// ─── Knopka rang tanlash ─────────────────────────────────────────────────────

broadcastHandler.callbackQuery(/^bc:btnstyle:(primary|success|danger|random):(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const bcast = getBcast(ctx);
  if (!bcast || !bcast.pendingBtnText) return;

  const style = resolveButtonStyle(ctx.match[1]);
  const url   = decodeURIComponent(ctx.match[2]);

  const btn: InlineBtn = { text: bcast.pendingBtnText, url, style };
  delete bcast.pendingBtnText;

  await ctx.editMessageText(
    "Yangi qatorda yoki avvalgisi bilan?",
    {
      reply_markup: kb(
        [
          ibtn("➕ Shu qatorda", `bc:btnadd:same`,  "primary"),
          ibtn("🆕 Yangi qator", `bc:btnadd:new`,   "success"),
        ],
      ),
    }
  ).catch(() => {});

  bcast.state = "btnRow";
  ctx.session.scratch = {
    ...(ctx.session.scratch ?? {}),
    bcast,
    pendingBtn: btn,
  };
});

broadcastHandler.callbackQuery(/^bc:btnadd:(same|new)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const bcast = getBcast(ctx);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const btn = ctx.session.scratch?.pendingBtn as InlineBtn | undefined;
  if (!bcast || !btn) return;

  if (ctx.match[1] === "same" && bcast.buttons.length > 0) {
    bcast.buttons[bcast.buttons.length - 1].push(btn);
  } else {
    bcast.buttons.push([btn]);
  }

  if (ctx.session.scratch) delete (ctx.session.scratch as Record<string, unknown>).pendingBtn;
  bcast.state = "preview";
  setBcast(ctx, bcast);
  await showPreview(ctx, bcast);
});

// ─── Ko'rinish ───────────────────────────────────────────────────────────────

async function showPreview(ctx: MyContext, bcast: BcastData) {
  const btnCount = bcast.buttons.flat().length;
  await ctx.reply(
    `👁 <b>Ko'rinish</b>\n\n` +
    `🎯 Nishon: <b>${targetLabel(bcast)}</b>\n` +
    `🔘 Knopkalar: <b>${btnCount}</b> ta`,
    {
      reply_markup: kb(
        [ibtn("➕ Knopka qo'shish", "bc:addbtn",  "primary", BE.chAdd)],
        [ibtn("🗑 Barcha knopkalarni tozalash", "bc:clearbtn", "danger")],
        [ibtn("▶️ Yuborish",  "bc:send",   "success", BE.check)],
        [ibtn("❌ Bekor",      "bc:menu",   "danger")],
      ),
    }
  );

  // Shablonni ko'rsatish
  if (bcast.templateChatId && bcast.templateMsgId) {
    const ikb = buildInlineKb(bcast.buttons);
    await ctx.api.copyMessage(ctx.chat!.id, bcast.templateChatId, bcast.templateMsgId, {
      reply_markup: ikb,
    }).catch(() => {});
  }
}

function targetLabel(bcast: BcastData): string {
  if (bcast.target.type === "all") return "Hammaga";
  if (bcast.target.type === "daterange") return `Sana: ${bcast.target.dateFrom} – ${bcast.target.dateTo}`;
  if (bcast.target.type === "region") return `Viloyat: ${bcast.target.region}`;
  if (bcast.target.type === "funnel") return `Funnel javobchilari`;
  return "?";
}

// ─── Knopka qo'shish ─────────────────────────────────────────────────────────

broadcastHandler.callbackQuery("bc:addbtn", async (ctx) => {
  await ctx.answerCallbackQuery();
  const bcast = getBcast(ctx);
  if (!bcast) return;
  bcast.state = "btnText";
  setBcast(ctx, bcast);
  await ctx.reply("✏️ Knopka <b>matnini</b> kiriting:");
});

broadcastHandler.callbackQuery("bc:clearbtn", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Barcha knopkalar tozalandi." });
  const bcast = getBcast(ctx);
  if (!bcast) return;
  bcast.buttons = [];
  bcast.state = "preview";
  setBcast(ctx, bcast);
  await showPreview(ctx, bcast);
});

// ─── Yuborish ────────────────────────────────────────────────────────────────

broadcastHandler.callbackQuery("bc:send", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Yuborilmoqda..." });
  const bcast = getBcast(ctx);
  if (!bcast?.templateChatId || !bcast.templateMsgId) {
    await ctx.reply("❌ Xabar shabloni topilmadi.");
    return;
  }

  clearBcast(ctx);

  // Foydalanuvchilarni filter qilish
  const users = await getTargetUsers(bcast);
  const total = users.length;

  await ctx.editMessageText(`⏳ Yuborilmoqda: 0 / ${total}...`).catch(() => {});

  const ikb = buildInlineKb(bcast.buttons);
  let sent = 0, failed = 0;

  for (let i = 0; i < users.length; i++) {
    const uid = Number(users[i]);
    try {
      await ctx.api.copyMessage(uid, bcast.templateChatId, bcast.templateMsgId, {
        reply_markup: ikb,
      });
      sent++;
    } catch {
      failed++;
      await prisma.user.update({
        where: { id: BigInt(uid) },
        data: { isBlocked: true },
      }).catch(() => null);
    }

    // Progress update har 50 ta
    if ((i + 1) % 50 === 0 || i === users.length - 1) {
      await ctx.editMessageText(`⏳ Yuborilmoqda: ${i + 1} / ${total}...`).catch(() => {});
    }

    // Telegram rate limit (30 msg/sec)
    if (i % 25 === 0 && i > 0) await new Promise((r) => setTimeout(r, 1000));
  }

  await prisma.broadcast.create({
    data: {
      targetType: bcast.target.type,
      targetExtra: JSON.stringify(bcast.target),
      sentCount: sent,
      failCount: failed,
    },
  }).catch(() => null);

  await ctx.editMessageText(
    `${ce("check")} <b>Xabar yuborish tugadi!</b>\n\n` +
    `🎯 Nishon: <b>${targetLabel(bcast)}</b>\n` +
    `✅ Yuborildi: <b>${sent}</b>\n` +
    `❌ Yuborilmadi: <b>${failed}</b>`,
    { reply_markup: kb([ibtn("Menyuga", "bc:menu", "primary", BE.backMenu)]) }
  ).catch(() => {});
});

async function getTargetUsers(bcast: BcastData): Promise<bigint[]> {
  const t = bcast.target;

  if (t.type === "all") {
    const rows = await prisma.user.findMany({ where: { isBlocked: false }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  if (t.type === "daterange" && t.dateFrom && t.dateTo) {
    const from = parseDate(t.dateFrom)!;
    const to = new Date(parseDate(t.dateTo)!); to.setHours(23, 59, 59, 999);
    const rows = await prisma.user.findMany({
      where: { isBlocked: false, createdAt: { gte: from, lte: to } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  if (t.type === "region" && t.region) {
    const rows = await prisma.user.findMany({
      where: { isBlocked: false, region: t.region },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  if (t.type === "funnel" && t.surveyId) {
    const where = t.optionId
      ? { surveyId: t.surveyId, optionId: t.optionId }
      : { surveyId: t.surveyId };
    const responses = await prisma.surveyResponse.findMany({ where, select: { userId: true } });
    return responses.map((r) => r.userId);
  }

  return [];
}
