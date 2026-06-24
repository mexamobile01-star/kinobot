import { Composer } from "grammy";
import { isAdmin } from "../config.js";
import { ce } from "../utils/emoji.js";
import { adminMenuKeyboard, userMenuKeyboard } from "../utils/keyboard.js";
import { ensureSubscribed } from "../utils/subscription.js";
import { getBool, KEYS } from "../utils/settings.js";
import type { MyContext } from "../types.js";

export const startHandler = new Composer<MyContext>();

startHandler.command("start", async (ctx) => {
  const uid = ctx.from!.id;

  if (isAdmin(uid)) {
    await ctx.reply(
      `${ce("settings")} <b>Admin panelga xush kelibsiz!</b>\n\n` +
        `Quyidagi tugmalar orqali botni boshqaring.`,
      { reply_markup: adminMenuKeyboard() }
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

// Obuna tekshirish tugmasi
startHandler.callbackQuery("sub:check", async (ctx) => {
  const ok = await ensureSubscribed(ctx, ctx.from.id);
  if (ok) {
    await ctx.answerCallbackQuery({ text: "✅ Rahmat! Endi foydalanishingiz mumkin." });
    await ctx.deleteMessage().catch(() => {});
    await ctx.reply(
      `${ce("film")} Endi kino kodini yoki nomini yuboring.`,
      { reply_markup: userMenuKeyboard() }
    );
  } else {
    await ctx.answerCallbackQuery({
      text: "❌ Hali hamma kanalga a'zo bo'lmadingiz!",
      show_alert: true,
    });
  }
});
