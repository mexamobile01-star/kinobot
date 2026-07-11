import { Composer } from "grammy";
import { prisma } from "../../prisma.js";
import { adminCan } from "../../config.js";
import { e } from "../../utils/emoji.js";
import { ibtn, kb, aiActiveKeyboard, adminMenuKeyboard } from "../../utils/keyboard.js";
import { aiEnabled, askAI } from "../../services/ai.js";
import type { MyContext } from "../../types.js";

export const aiAdminHandler = new Composer<MyContext>();

const AI_BTN  = "AI yordamchi";
const AI_EXIT = "❌ Chiqish";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Jonli bot statistikasi — admin AI kontekstiga uzatiladi */
async function buildAdminStats(): Promise<string> {
  const today = startOfToday();
  const [
    totalUsers, blockedUsers, todayUsers,
    totalMovies, todayMovies, moviesNoGenre,
    totalSerials,
    totalChannels, activeChannels, inactiveChannels,
    totalReferrals,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isBlocked: true } }),
    prisma.user.count({ where: { createdAt: { gte: today } } }),
    prisma.movie.count(),
    prisma.movie.count({ where: { createdAt: { gte: today } } }),
    prisma.movie.findMany({ where: { genre: null }, select: { code: true, title: true }, take: 15 }),
    prisma.serial.count(),
    prisma.channel.count(),
    prisma.channel.count({ where: { isActive: true } }),
    prisma.channel.findMany({ where: { isActive: false }, select: { title: true }, take: 15 }),
    prisma.user.count({ where: { referralConfirmed: true } }),
  ]);

  const topRefRaw = await prisma.user.groupBy({
    by: ["referredById"],
    where: { referredById: { not: null }, referralConfirmed: true },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 5,
  });
  const topReferrers: string[] = [];
  for (const g of topRefRaw) {
    const u = await prisma.user.findUnique({ where: { id: g.referredById! } });
    const name = u?.firstName || (u?.username ? `@${u.username}` : `ID ${g.referredById}`);
    topReferrers.push(`${name} — ${g._count.id} ta`);
  }

  const lines = [
    `Foydalanuvchilar: ${totalUsers} (bloklangan: ${blockedUsers}, bugun qo'shilgan: ${todayUsers})`,
    `Kinolar: ${totalMovies} (bugun qo'shilgan: ${todayMovies}, janrsiz: ${moviesNoGenre.length} ta)`,
    `Seriallar: ${totalSerials}`,
    `Kanallar: ${totalChannels} (faol: ${activeChannels}, nofaol: ${totalChannels - activeChannels})`,
    `Tasdiqlangan referallar: ${totalReferrals}`,
  ];
  if (topReferrers.length) lines.push(`Top referrerlar:\n  - ${topReferrers.join("\n  - ")}`);
  if (moviesNoGenre.length) lines.push(`Janrsiz kinolar: ${moviesNoGenre.map((m) => `${m.title} (m${m.code})`).join(", ")}`);
  if (inactiveChannels.length) lines.push(`Nofaol kanallar: ${inactiveChannels.map((c) => c.title).join(", ")}`);

  return lines.join("\n");
}

function buildAdminInfo(ctx: MyContext): string {
  const u = ctx.from!;
  const name = u.first_name?.trim() || "Admin";
  const username = u.username ? `@${u.username}` : "yo'q";
  return `Ism: ${name}\nUsername: ${username}\nTelegram ID: ${u.id}`;
}

function adminSystemPrompt(stats: string, userInfo: string): string {
  return (
    `Sen — "🎬 Kino vaqti" botining ADMIN uchun shaxsiy AI yordamchisisan. Bu yerda cheklovlar yo'q — ` +
    `admin bilan ochiq, erkin va samimiy suhbatlashasan: savollariga to'liq javob berasan, xato yoki ` +
    `kamchiliklarini topib tuzatib berasan, tavsiyalar berasan.\n\n` +

    `━━━ ADMIN ━━━\n${userInfo}\nUni ismi bilan chaqir.\n\n` +

    `━━━ TIL ━━━\n` +
    `Admin qaysi tilda va alifboda yozsa (o'zbek lotin/kirill, rus, ingliz va h.k.), sen ham aynan ` +
    `o'shanda javob ber.\n\n` +

    `━━━ USLUB ━━━\n` +
    `HTML teglar (<b>,<i>,<code>) va mos emojilar bilan chiroyli, tushunarli javob ber. Markdown ISHLATMA.\n\n` +

    `━━━ JONLI BOT STATISTIKASI ━━━\n${stats}\n` +
    `Admin statistika, kino/kanal boshqaruvi haqida so'rasa — shu ma'lumotlardan aniq foydalan, taxmin qilma.\n\n` +

    `━━━ XABAR YUBORISH (BROADCAST) ━━━\n` +
    `Agar admin BARCHA foydalanuvchilarga xabar yubormoqchi bo'lsa (masalan: "foydalanuvchilarga yangi ` +
    `kino qo'shildi deb xabar yubor"), quyidagicha ishla:\n` +
    `1. Yubormoqchi bo'lgan XABAR MATNINI (foydalanuvchi ko'radigan, chiroyli, HTML formatlangan) tayyorla.\n` +
    `2. Javobing OXIRIGA aynan shu formatda qo'sh:\n[BROADCAST_START]\n<foydalanuvchilarga yuboriladigan aniq matn>\n[BROADCAST_END]\n` +
    `3. Bu blokdan OLDIN adminga qisqa izoh yozishing mumkin, lekin blok ICHIDA FAQAT foydalanuvchiga ` +
    `ko'rinadigan matn bo'lsin — hech qanday qo'shimcha izoh yoki tirnoq yozma.\n` +
    `4. XABARNI O'ZING YUBORMAYSAN — bot adminga tasdiqlash/fikr bildirish/bekor qilish tugmalarini ` +
    `ko'rsatadi, admin tasdiqlagandan keyingina yuboriladi.\n\n` +

    `Endi adminga eng yaxshi tarzda yordam ber!`
  );
}

async function askAdminAi(ctx: MyContext, prompt: string): Promise<string | null> {
  const stats = await buildAdminStats();
  return askAI("admin", prompt, adminSystemPrompt(stats, buildAdminInfo(ctx)));
}

function extractBroadcast(answer: string): { display: string; draft: string | null } {
  const m = answer.match(/\[BROADCAST_START\]([\s\S]*?)\[BROADCAST_END\]/i);
  const display = answer.replace(/\[BROADCAST_START\][\s\S]*?\[BROADCAST_END\]/gi, "").trim();
  return { display, draft: m ? m[1].trim() : null };
}

async function showDraftPreview(ctx: MyContext, draft: string) {
  ctx.session.scratch = { ...(ctx.session.scratch ?? {}), aiAdminDraft: draft };
  await ctx.reply(
    `📢 <b>Xabar qoralamasi</b> (barcha foydalanuvchilarga):\n\n${draft}`,
    {
      reply_markup: kb(
        [ibtn("✅ Tasdiqlash va yuborish", "aiadm:send", "success")],
        [ibtn("✏️ Fikr bildirish", "aiadm:feedback", "primary")],
        [ibtn("❌ Bekor qilish", "aiadm:cancel", "danger")],
      ),
    }
  );
}

aiAdminHandler.hears(AI_BTN, async (ctx) => {
  if (!adminCan(ctx.from!.id, "ai")) return;
  if (!aiEnabled()) {
    await ctx.reply("🤖 AI yordamchi hozircha sozlanmagan.");
    return;
  }
  ctx.session.scratch = { ...(ctx.session.scratch ?? {}), aiAdminChat: true };
  await ctx.reply(
    `🤖 <b>Admin AI yordamchi</b> — cheklovsiz xizmatingizda! ✨\n\n` +
    `Men bilan erkin suhbatlashing:\n` +
    `📊 <i>"Nechta foydalanuvchimiz bor?"</i>\n` +
    `🎬 <i>"Qaysi kinolar janrsiz qolgan?"</i>\n` +
    `📢 <i>"Foydalanuvchilarga yangi serial qo'shildi deb xabar yubor"</i>\n` +
    `💬 yoki istalgan savol/muammoingizni yozing.\n\n` +
    `Chiqish uchun <b>${AI_EXIT}</b> tugmasini bosing.`,
    { reply_markup: aiActiveKeyboard() }
  );
  await ctx.reply("Sozlamalar:", {
    reply_markup: kb([ibtn("⚙️ AI sozlamalari (model, limit)", "aiset:open", "primary")]),
  });
});

aiAdminHandler.hears(AI_EXIT, async (ctx) => {
  const wasActive = !!ctx.session.scratch?.aiAdminChat;
  if (ctx.session.scratch) {
    delete ctx.session.scratch.aiAdminChat;
    delete ctx.session.scratch.aiAdminDraft;
    delete ctx.session.scratch.aiAdminAwaitingFeedback;
  }
  await ctx.reply(
    wasActive ? "AI yordamchidan chiqdingiz. 👋" : "Asosiy menyu:",
    { reply_markup: adminMenuKeyboard(ctx.from!.id) }
  );
});

aiAdminHandler.on("message:text", async (ctx, next) => {
  if (!ctx.session.scratch?.aiAdminChat) return next();

  const text = ctx.message.text.trim();
  if (text.startsWith("/")) { if (ctx.session.scratch) delete ctx.session.scratch.aiAdminChat; return next(); }

  // Qoralamaga fikr bildirish rejimi
  if (ctx.session.scratch?.aiAdminAwaitingFeedback) {
    const prevDraft = ctx.session.scratch?.aiAdminDraft as string | undefined;
    if (ctx.session.scratch) delete ctx.session.scratch.aiAdminAwaitingFeedback;
    await ctx.replyWithChatAction("typing").catch(() => {});
    const answer = await askAdminAi(
      ctx,
      `Avvalgi xabar qoralamasi:\n"${prevDraft}"\n\nMening fikrim: "${text}"\n\n` +
      `Shu fikr asosida xabarni qayta tayyorla va [BROADCAST_START]/[BROADCAST_END] formatida ber.`
    );
    if (!answer) { await ctx.reply("🤖 Xatolik yuz berdi, qayta urinib ko'ring."); return; }
    const { display, draft } = extractBroadcast(answer);
    if (display) await ctx.reply(display);
    if (draft) await showDraftPreview(ctx, draft);
    return;
  }

  await ctx.replyWithChatAction("typing").catch(() => {});
  const answer = await askAdminAi(ctx, text);

  if (!answer) {
    await ctx.reply("🤖 Kechirasiz, hozir javob bera olmadim. Birozdan keyin urinib ko'ring.");
    return;
  }

  const { display, draft } = extractBroadcast(answer);
  if (display) {
    await ctx.reply(display).catch(async () => { await ctx.reply(e.escapeHtml(display)); });
  }
  if (draft) await showDraftPreview(ctx, draft);
});

aiAdminHandler.callbackQuery("aiadm:send", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Yuborilmoqda..." });
  const draft = ctx.session.scratch?.aiAdminDraft as string | undefined;
  if (!draft) { await ctx.reply("❌ Qoralama topilmadi."); return; }
  if (ctx.session.scratch) delete ctx.session.scratch.aiAdminDraft;

  const users = await prisma.user.findMany({ where: { isBlocked: false }, select: { id: true } });
  const statusMsg = await ctx.reply(`⏳ Yuborilmoqda: 0 / ${users.length}...`);

  let sent = 0, failed = 0;
  for (let i = 0; i < users.length; i++) {
    try {
      await ctx.api.sendMessage(Number(users[i].id), draft, { parse_mode: "HTML" });
      sent++;
    } catch {
      failed++;
      await prisma.user.update({ where: { id: users[i].id }, data: { isBlocked: true } }).catch(() => null);
    }
    if ((i + 1) % 50 === 0 || i === users.length - 1) {
      await ctx.api.editMessageText(ctx.chat!.id, statusMsg.message_id, `⏳ ${i + 1} / ${users.length}...`).catch(() => {});
    }
    if (i % 25 === 0 && i > 0) await new Promise((r) => setTimeout(r, 1000));
  }

  await prisma.broadcast.create({
    data: { targetType: "all", targetExtra: "ai", sentCount: sent, failCount: failed },
  }).catch(() => null);

  await ctx.api.editMessageText(
    ctx.chat!.id, statusMsg.message_id,
    `✅ <b>Xabar yuborildi!</b>\n\nYuborildi: <b>${sent}</b>\nYuborilmadi: <b>${failed}</b>`
  ).catch(() => {});
});

aiAdminHandler.callbackQuery("aiadm:feedback", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.scratch = { ...(ctx.session.scratch ?? {}), aiAdminAwaitingFeedback: true };
  await ctx.reply("✏️ Xabarni qanday o'zgartirish kerak? Fikringizni yozing:");
});

aiAdminHandler.callbackQuery("aiadm:cancel", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Bekor qilindi." });
  if (ctx.session.scratch) {
    delete ctx.session.scratch.aiAdminDraft;
    delete ctx.session.scratch.aiAdminAwaitingFeedback;
  }
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
});
