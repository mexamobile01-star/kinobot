import { Composer } from "grammy";
import { prisma } from "../prisma.js";
import { isAdmin, isOwner } from "../config.js";
import { ce } from "../utils/emoji.js";
import { adminMenuKeyboard, userMenuKeyboard } from "../utils/keyboard.js";
import { ensureSubscribed, getUnsubscribedChannels } from "../utils/subscription.js";
import { getBool, KEYS } from "../utils/settings.js";
import { attachReferrer, confirmReferral } from "../utils/referral.js";
import { sendMovie } from "../services/media.js";
import type { MyContext } from "../types.js";

export const startHandler = new Composer<MyContext>();

const WELCOME =
  `<tg-emoji emoji-id="5258077307985207053">🎬</tg-emoji> <b>Kino vaqti</b>\n\n` +
  `Kino kodini yuboring yoki nom bo'yicha qidiring.`;

async function deliverMovieByCode(ctx: MyContext, code: number): Promise<boolean> {
  const movie = await prisma.movie.findUnique({ where: { code } });
  if (!movie) return false;
  await sendMovie(ctx, movie);
  return true;
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
    if (!ok) {
      // Obunadan keyin kino yetkazish uchun kodni saqlab qo'yamiz
      if (pendingMovieCode !== null) {
        ctx.session.scratch = { ...(ctx.session.scratch ?? {}), pendingMovieCode };
      }
      return;
    }
  }

  await confirmReferral(ctx, uid);

  // Deep-link kino
  if (pendingMovieCode !== null) {
    const ok = await deliverMovieByCode(ctx, pendingMovieCode);
    if (ok) return;
  }

  await ctx.reply(WELCOME, { reply_markup: userMenuKeyboard() });
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

    await ctx.reply(WELCOME, { reply_markup: userMenuKeyboard() });
  } else {
    await ctx.answerCallbackQuery({
      text: `❌ ${blocking.length} ta kanalga hali a'zo bo'lmadingiz!`,
      show_alert: true,
    });
  }
});

startHandler.hears("Kino qidirish", async (ctx) => {
  await ctx.reply(
    `<tg-emoji emoji-id="5429571366384842791">🔎</tg-emoji> Kino <b>kodi</b> yoki <b>nomini</b> yuboring.`
  );
});
