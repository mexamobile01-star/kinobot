import { Composer, InlineKeyboard } from "grammy";
import { prisma } from "../prisma.js";
import { isAdmin } from "../config.js";
import { adminMenuKeyboard, userMenuKeyboard } from "../utils/keyboard.js";
import { ensureSubscribed, getUnsubscribedChannels } from "../utils/subscription.js";
import { getBool, KEYS } from "../utils/settings.js";
import { attachReferrer, confirmReferral } from "../utils/referral.js";
import { sendMovie } from "../services/media.js";
import type { MyContext } from "../types.js";

export const startHandler = new Composer<MyContext>();

const WELCOME =
  `<tg-emoji emoji-id="5258077307985207053">🎬</tg-emoji> <b>Kino vaqti botiga xush kelibsiz!</b>\n\n` +
  `Bu yerda eng sara kinolar va seriallar sizni kutmoqda.\n\n` +
  `<b>Kino kodini</b> yuboring — men uni darhol topib beraman.\n` +
  `Yoki kino <b>nomini</b> yozib qidiring.\n\n` +
  `<tg-emoji emoji-id="5429571366384842791">🔎</tg-emoji> Masalan: <code>123</code>`;

async function deliverMovieByCode(ctx: MyContext, code: number): Promise<boolean> {
  const movie = await prisma.movie.findUnique({ where: { code } });
  if (!movie) return false;
  await sendMovie(ctx, movie);
  return true;
}

// MUHIM: bitta xabarga inline va doimiy (reply) klaviatura birga qo'yilmaydi —
// Telegram cheklovi. Shuning uchun asosiy xabar DOIMIY klaviatura bilan
// birga (kechiktirmasdan) yuboriladi, aks holda foydalanuvchida klaviatura
// "yopilib qolgandek" ko'rinadi.
async function sendWelcome(ctx: MyContext) {
  await ctx.reply(WELCOME, { reply_markup: userMenuKeyboard() });
}

startHandler.command("start", async (ctx) => {
  const uid = ctx.from!.id;
  const payload = (ctx.match ?? "").toString().trim();

  // Deep-link parsing
  let pendingMovieCode: number | null = null;
  if (payload.startsWith("movie_")) {
    const c = Number(payload.slice(6));
    if (Number.isInteger(c)) pendingMovieCode = c;
  } else if (payload.startsWith("ref_")) {
    const refId = Number(payload.slice(4));
    if (Number.isInteger(refId)) await attachReferrer(uid, refId);
  }

  // Admin — qisqa xabar + knopkalar
  if (isAdmin(uid)) {
    await ctx.reply("<b>Admin panel</b>", {
      reply_markup: adminMenuKeyboard(uid),
    });
    return;
  }

  // Deep-link kino — bu yerda majburiy obunani tekshiramiz
  if (pendingMovieCode !== null) {
    const forceSub = await getBool(KEYS.forceSubEnabled, true);
    if (forceSub) {
      const ok = await ensureSubscribed(ctx, uid);
      if (!ok) {
        ctx.session.scratch = { ...(ctx.session.scratch ?? {}), pendingMovieCode };
        return;
      }
    }
    await confirmReferral(ctx, uid);
    const ok = await deliverMovieByCode(ctx, pendingMovieCode);
    if (ok) return;
  }

  // Oddiy /start — chiroyli welcome (obuna kod yozilganda tekshiriladi)
  await sendWelcome(ctx);
});

// Obuna tekshirish — yangi xabar YUBORILMAYDI, faqat popup
startHandler.callbackQuery("sub:check", async (ctx) => {
  const uid = ctx.from.id;
  const notJoined = await getUnsubscribedChannels(ctx, uid);
  const blocking  = notJoined.filter((c) => c.type !== "INSTAGRAM");

  if (blocking.length === 0) {
    await ctx.answerCallbackQuery({ text: "✅ Rahmat! Endi foydalanishingiz mumkin." });
    await ctx.deleteMessage().catch(() => {});
    await confirmReferral(ctx, uid);

    // Obuna oldidan so'ralgan kino bo'lsa — yetkazamiz
    const pending = ctx.session.scratch?.pendingMovieCode as number | undefined;
    if (typeof pending === "number") {
      if (ctx.session.scratch) delete ctx.session.scratch.pendingMovieCode;
      const ok = await deliverMovieByCode(ctx, pending);
      if (ok) return;
    }

    await sendWelcome(ctx);
  } else {
    await ctx.answerCallbackQuery({
      text: `❌ ${blocking.length} ta kanalga hali a'zo bo'lmadingiz!`,
      show_alert: true,
    });
  }
});

startHandler.hears("Kino qidirish", async (ctx) => {
  await ctx.reply(
    `<tg-emoji emoji-id="5429571366384842791">🔎</tg-emoji> Kino <b>kodi</b> yoki <b>nomini</b> yuboring.\n\n` +
    `👇 Do'stlaringiz chatida ham qidirishingiz mumkin:`,
    { reply_markup: new InlineKeyboard().switchInline("🔎 Inline qidiruv", "") }
  );
});
