import { Composer } from "grammy";
import { prisma } from "../prisma.js";
import { config } from "../config.js";
import { e } from "../utils/emoji.js";
import { ibtn, kb, BE } from "../utils/keyboard.js";
import { getSetting, KEYS } from "../utils/settings.js";
import { activeTariffs, isPremiumActive, premiumEnabled, seedDefaultTariffs } from "../utils/premium.js";
import { getUnsubscribedChannels, editSubscriptionPrompt } from "../utils/subscription.js";
import type { MyContext } from "../types.js";

export const premiumHandler = new Composer<MyContext>();

/** Premium taklifi xabari (limit tugaganda, /premium yoki obuna so'rovi ostidagi tugma orqali) */
export async function sendPremiumPrompt(ctx: MyContext, reason?: string, edit = false): Promise<void> {
  let tariffs = await activeTariffs();
  // Premium yoqilgan-u tarif yo'q bo'lsa — standart tariflarni avtomatik qo'shamiz
  if (tariffs.length === 0 && (await premiumEnabled())) {
    await seedDefaultTariffs();
    tariffs = await activeTariffs();
  }

  const head =
    `<tg-emoji emoji-id="5258093637450866522">💎</tg-emoji> <b>Premium obuna</b>\n\n` +
    (reason ? `${reason}\n\n` : "") +
    `Premium a'zolik bilan botdan <b>to'liq erkin</b> foydalanasiz:\n\n` +
    `✅ <b>Cheksiz</b> kino va serial — limitsiz\n` +
    `✅ <b>Majburiy obunasiz</b> — hech qanday kanal so'ralmaydi\n` +
    `✅ <b>Cheksiz AI yordamchi</b> — tavsiya + rasm orqali kino topish\n` +
    `✅ Reklama va kutishlarsiz, eng tez xizmat\n\n`;

  if (tariffs.length === 0) {
    const text = head + `Hozircha tariflar sozlanmagan. Admin bilan bog'laning.`;
    if (edit) await ctx.editMessageText(text).catch(() => ctx.reply(text));
    else await ctx.reply(text);
    return;
  }

  // Eng foydali tarifni aniqlash: kunlik narxi eng arzon bo'lgani.
  const perDay = (t: (typeof tariffs)[number]) => (t.days > 0 ? t.price / t.days : t.price);
  const bestPerDay = Math.min(...tariffs.map(perDay));
  // Taqqoslash uchun eng qimmat kunlik narx (odatda eng qisqa tarif)
  const worstPerDay = Math.max(...tariffs.map(perDay));

  const lines: string[] = [head, `<b>Tarifni tanlang:</b>`];
  const rows = tariffs.map((t) => {
    const pd = perDay(t);
    const isBest = pd <= bestPerDay + 0.01;
    // Eng qisqa/qimmat tarifga nisbatan tejash foizi
    const saving = worstPerDay > 0 ? Math.round((1 - pd / worstPerDay) * 100) : 0;

    const priceStr = t.price.toLocaleString("ru-RU");
    const perDayStr = Math.round(pd).toLocaleString("ru-RU");

    let info = `• <b>${e.escapeHtml(t.label)}</b> — ${priceStr} so'm  <i>(${perDayStr} so'm/kun)</i>`;
    if (isBest) info += `  ⭐️ <b>eng foydali</b>`;
    else if (saving >= 5) info += `  💰 ${saving}% tejash`;
    lines.push(info);

    const btnLabel = isBest
      ? `⭐️ ${t.label} — ${priceStr} so'm (eng foydali)`
      : `${t.label} — ${priceStr} so'm`;
    return [ibtn(btnLabel, `prem:buy:${t.id}`, isBest ? "success" : "primary")];
  });
  rows.push([ibtn("⬅️ Orqaga", "prem:back", undefined, BE.backMenu)]);

  const text = lines.join("\n");
  const markup = kb(...rows);
  if (edit) await ctx.editMessageText(text, { reply_markup: markup }).catch(() => ctx.reply(text, { reply_markup: markup }));
  else await ctx.reply(text, { reply_markup: markup });
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

// Obuna so'rovi ostidagi "Premium obuna" tugmasi — shu xabarni o'zini yangilaydi
premiumHandler.callbackQuery("prem:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendPremiumPrompt(ctx, undefined, true);
});

// Tariflardan "Orqaga" — obuna so'rovi hali kerak bo'lsa unga qaytadi, aks holda yopadi
premiumHandler.callbackQuery("prem:back", async (ctx) => {
  await ctx.answerCallbackQuery();
  const notJoined = await getUnsubscribedChannels(ctx, ctx.from.id);
  const blocking  = notJoined.filter((c) => c.type !== "INSTAGRAM");
  if (blocking.length > 0) {
    await editSubscriptionPrompt(ctx, notJoined);
  } else {
    await ctx.deleteMessage().catch(() => {});
  }
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
