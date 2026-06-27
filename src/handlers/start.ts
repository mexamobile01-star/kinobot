import { Composer } from "grammy";
import { isAdmin, isOwner } from "../config.js";
import { ce } from "../utils/emoji.js";
import { adminMenuKeyboard, userMenuKeyboard } from "../utils/keyboard.js";
import { ensureSubscribed, getUnsubscribedChannels } from "../utils/subscription.js";
import { getBool, KEYS } from "../utils/settings.js";
import type { MyContext } from "../types.js";

export const startHandler = new Composer<MyContext>();

startHandler.command("start", async (ctx) => {
  const uid = ctx.from!.id;

  if (isAdmin(uid)) {
    await ctx.reply(
      `${ce("settings")} <b>Admin panelga xush kelibsiz!</b>\n\n` +
        `Quyidagi tugmalar orqali botni boshqaring.`,
      { reply_markup: adminMenuKeyboard(isOwner(uid)) }
    );
    return;
  }

  // Majburiy obuna tekshiruvi
  const forceSub = await getBool(KEYS.forceSubEnabled, true);
  if (forceSub) {
    const ok = await ensureSubscribed(ctx, uid);
    if (!ok) return;
  }

  await ctx.reply(
    `${ce("film")} <b>Assalomu alaykum!</b>\n\n` +
      `Kino kodini yuboring — men sizga kinoni tashlab beraman.\n` +
      `Yoki kino <b>nomini</b> yozib qidiring.\n\n` +
      `${ce("star")} Masalan: <code>123</code>`,
    { reply_markup: userMenuKeyboard() }
  );
});

startHandler.command("help", async (ctx) => {
  await ctx.reply(
    `${ce("fire")} <b>Yordam</b>\n\n` +
      `• Kino <b>kodini</b> yuboring (masalan <code>123</code>)\n` +
      `• Yoki kino <b>nomini</b> yozib qidiring\n` +
      `• Boshqa chatlarda <code>@${ctx.me.username} nom</code> deb inline qidiring`
  );
});

// Yordam tugmasi
startHandler.hears("ℹ️ Yordam", async (ctx) => {
  await ctx.reply(
    `${ce("fire")} <b>Yordam</b>\n\n` +
      `• Kino <b>kodini</b> yuboring (masalan <code>123</code>)\n` +
      `• Yoki kino <b>nomini</b> yozib qidiring`
  );
});

startHandler.hears("🔎 Kino qidirish", async (ctx) => {
  await ctx.reply(
    `${ce("star")} Kino <b>kodi</b> yoki <b>nomini</b> yuboring.`
  );
});

// Obuna tekshirish tugmasi — yangi xabar YUBORILMAYDI, faqat popup
startHandler.callbackQuery("sub:check", async (ctx) => {
  const notJoined = await getUnsubscribedChannels(ctx, ctx.from.id);
  const blocking  = notJoined.filter((c) => c.type !== "INSTAGRAM");

  if (blocking.length === 0) {
    await ctx.answerCallbackQuery({ text: "✅ Rahmat! Endi foydalanishingiz mumkin." });
    await ctx.deleteMessage().catch(() => {});
    await ctx.reply(
      `${ce("film")} Endi kino kodini yoki nomini yuboring.`,
      { reply_markup: userMenuKeyboard() }
    );
  } else {
    const names = blocking.slice(0, 3).map((c) => c.title).join(", ");
    await ctx.answerCallbackQuery({
      text: `❌ Hali ${blocking.length} ta kanalga a'zo bo'lmadingiz!\n${names}`,
      show_alert: true,
    });
  }
});
