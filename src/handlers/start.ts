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
      `${ce("settings")} <b>Admin panelga xush kelibsiz!</b>`,
      { reply_markup: adminMenuKeyboard(isOwner(uid)) }
    );
    return;
  }

  const forceSub = await getBool(KEYS.forceSubEnabled, true);
  if (forceSub) {
    const ok = await ensureSubscribed(ctx, uid);
    if (!ok) return;
  }

  await ctx.reply(
    `<tg-emoji emoji-id="5258077307985207053">🎬</tg-emoji> <b>Kino vaqti</b>\n\n` +
    `Kino kodini yuboring yoki nom bo'yicha qidiring.`,
    { reply_markup: userMenuKeyboard() }
  );
});

// Obuna tekshirish — yangi xabar YUBORILMAYDI, faqat popup
startHandler.callbackQuery("sub:check", async (ctx) => {
  const notJoined = await getUnsubscribedChannels(ctx, ctx.from.id);
  const blocking  = notJoined.filter((c) => c.type !== "INSTAGRAM");

  if (blocking.length === 0) {
    await ctx.answerCallbackQuery({ text: "✅ Rahmat! Endi foydalanishingiz mumkin." });
    await ctx.deleteMessage().catch(() => {});
    await ctx.reply(
      `<tg-emoji emoji-id="5258077307985207053">🎬</tg-emoji> <b>Kino vaqti</b>\n\nKino kodini yuboring yoki nom bo'yicha qidiring.`,
      { reply_markup: userMenuKeyboard() }
    );
  } else {
    await ctx.answerCallbackQuery({
      text: `❌ ${blocking.length} ta kanalga hali a'zo bo'lmadingiz!`,
      show_alert: true,
    });
  }
});

startHandler.hears("🔎 Kino qidirish", async (ctx) => {
  await ctx.reply(
    `<tg-emoji emoji-id="5429571366384842791">🔎</tg-emoji> Kino <b>kodi</b> yoki <b>nomini</b> yuboring.`
  );
});
