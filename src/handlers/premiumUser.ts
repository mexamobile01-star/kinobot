import { Composer } from "grammy";
import { prisma } from "../prisma.js";
import { config } from "../config.js";
import { e } from "../utils/emoji.js";
import { ibtn, kb } from "../utils/keyboard.js";
import { getSetting, KEYS } from "../utils/settings.js";
import { activeTariffs, isPremiumActive } from "../utils/premium.js";
import type { MyContext } from "../types.js";

export const premiumHandler = new Composer<MyContext>();

/** Premium taklifi xabari (limit tugaganda yoki /premium orqali) */
export async function sendPremiumPrompt(ctx: MyContext, reason?: string): Promise<void> {
  const tariffs = await activeTariffs();

  const head =
    `<tg-emoji emoji-id="5258093637450866522">💎</tg-emoji> <b>Premium obuna</b>\n\n` +
    (reason ? `${reason}\n\n` : "") +
    `Premium bilan:\n` +
    `✅ Cheksiz kino/serial\n` +
    `✅ Cheksiz AI yordamchi (tavsiya, rasm orqali qidiruv)\n` +
    `✅ Majburiy obunasiz (kanallar so'ralmaydi)\n` +
    `✅ Tez va qulay\n\n`;

  if (tariffs.length === 0) {
    await ctx.reply(head + `Hozircha tariflar sozlanmagan. Admin bilan bog'laning.`);
    return;
  }

  const rows = tariffs.map((t) => [
    ibtn(`${t.label} — ${t.price.toLocaleString("ru-RU")} so'm`, `prem:buy:${t.id}`, "success"),
  ]);

  await ctx.reply(head + `Tarifni tanlang:`, { reply_markup: kb(...rows) });
}

// /premium — holat + sotib olish
premiumHandler.command("premium", async (ctx) => {
  const user = await prisma.user.findUnique({ where: { id: BigInt(ctx.from!.id) } });
  if (isPremiumActive(user?.premiumUntil)) {
    const until = user!.premiumUntil!;
    await ctx.reply(
      `<tg-emoji emoji-id="5258093637450866522">💎</tg-emoji> <b>Sizda Premium faol!</b>\n\n` +
      `Amal qilish muddati: <b>${until.toLocaleDateString("ru-RU")}</b> gacha.`
    );
    return;
  }
  await sendPremiumPrompt(ctx);
});

// Tarif tanlandi → to'lov ko'rsatmasi + screenshot so'rash
premiumHandler.callbackQuery(/^prem:buy:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const tariff = await prisma.tariff.findUnique({ where: { id: Number(ctx.match[1]) } });
  if (!tariff || !tariff.isActive) {
    await ctx.reply("❌ Tarif topilmadi.");
    return;
  }
  const payInfo = await getSetting(KEYS.paymentInfo, "");
  ctx.session.scratch = { ...(ctx.session.scratch ?? {}), premBuyTariff: tariff.id };

  await ctx.reply(
    `💳 <b>To'lov</b>\n\n` +
    `Tarif: <b>${e.escapeHtml(tariff.label)}</b>\n` +
    `Narx: <b>${tariff.price.toLocaleString("ru-RU")} so'm</b>\n` +
    `Muddat: <b>${tariff.days} kun</b>\n\n` +
    (payInfo
      ? `${e.escapeHtml(payInfo)}\n\n`
      : `To'lov ma'lumotlari sozlanmagan. Admin bilan bog'laning.\n\n`) +
    `To'lovni amalga oshirgach, <b>chek/screenshot</b> rasmini shu yerga yuboring. ` +
    `Admin tekshirib premiumni yoqadi.`,
    { reply_markup: kb([ibtn("❌ Bekor qilish", "prem:cancel", "danger")]) }
  );
});

premiumHandler.callbackQuery("prem:cancel", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Bekor qilindi." });
  if (ctx.session.scratch) delete ctx.session.scratch.premBuyTariff;
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
});

// Chek/screenshot (rasm yoki fayl) qabul qilish
premiumHandler.on(["message:photo", "message:document"], async (ctx, next) => {
  const tariffId = ctx.session.scratch?.premBuyTariff as number | undefined;
  if (!tariffId) return next();

  const tariff = await prisma.tariff.findUnique({ where: { id: tariffId } });
  if (!tariff) { if (ctx.session.scratch) delete ctx.session.scratch.premBuyTariff; return; }

  const proofFileId = ctx.message.photo?.at(-1)?.file_id ?? ctx.message.document?.file_id ?? null;
  if (ctx.session.scratch) delete ctx.session.scratch.premBuyTariff;

  const payment = await prisma.payment.create({
    data: {
      userId: BigInt(ctx.from!.id),
      tariffId: tariff.id,
      tariffLabel: tariff.label,
      days: tariff.days,
      amount: tariff.price,
      proofFileId,
      status: "pending",
    },
  });

  await ctx.reply(
    `✅ <b>Chek qabul qilindi!</b>\n\n` +
    `To'lovingiz admin tomonidan tekshirilmoqda. Tasdiqlangach premium avtomatik yoqiladi. ` +
    `Odatda bu bir necha daqiqa/soat ichida bo'ladi.`
  );

  // Adminlarga (owner) xabar
  const uname = ctx.from!.username ? `@${ctx.from!.username}` : "—";
  const notify =
    `<tg-emoji emoji-id="5258093637450866522">💎</tg-emoji> <b>Yangi premium to'lov!</b>\n\n` +
    `Foydalanuvchi: <b>${e.escapeHtml(ctx.from!.first_name ?? "—")}</b> ${uname}\n` +
    `ID: <code>${ctx.from!.id}</code>\n` +
    `Tarif: <b>${e.escapeHtml(tariff.label)}</b> — ${tariff.price.toLocaleString("ru-RU")} so'm (${tariff.days} kun)\n\n` +
    `Tasdiqlash: <b>Premium</b> bo'limi → Kutilayotgan to'lovlar.`;
  for (const oid of config.ownerIds) {
    await ctx.api.sendMessage(Number(oid), notify, { parse_mode: "HTML" }).catch(() => null);
    if (proofFileId && ctx.message.photo) {
      await ctx.api.sendPhoto(Number(oid), proofFileId, { caption: `To'lov #${payment.id}` }).catch(() => null);
    }
  }
});
