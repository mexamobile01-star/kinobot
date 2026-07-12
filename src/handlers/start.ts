import { Composer } from "grammy";
import { prisma } from "../prisma.js";
import { isAdmin } from "../config.js";
import { adminMenuKeyboard, userMenuKeyboard, kb } from "../utils/keyboard.js";
import { getUnsubscribedChannels } from "../utils/subscription.js";
import { checkContentAccess } from "../utils/access.js";
import { attachReferrer, confirmReferral } from "../utils/referral.js";
import { sendReferralInfo } from "./referral.js";
import { sendMovie } from "../services/media.js";
import type { MyContext } from "../types.js";

export const startHandler = new Composer<MyContext>();

const CHANNEL_URL = "https://t.me/kinovaqti_00";

const WELCOME =
  `<tg-emoji emoji-id="5258077307985207053">🎬</tg-emoji> <b>Kino vaqti botiga xush kelibsiz!</b>\n\n` +
  `<b>Kodini</b> yuboring yoki <b>nomini</b> yozib qidiring — darhol topib beraman. 🍿`;

function welcomeKeyboard() {
  return kb(
    [
      { text: "Referal", callback_data: "start:referal", icon_custom_emoji_id: "5258513401784573443" },
      { text: "Mashhur", callback_data: "popular:page:0", icon_custom_emoji_id: "5258391252914676042" },
    ],
    [
      { text: "Random", callback_data: "start:random", icon_custom_emoji_id: "5210771709258394044" },
      { text: "Kino kanali", url: CHANNEL_URL, icon_custom_emoji_id: "5260268501515377807" },
    ],
  );
}

async function deliverMovieByCode(ctx: MyContext, code: number): Promise<boolean> {
  const movie = await prisma.movie.findUnique({ where: { code } });
  if (!movie) return false;
  await sendMovie(ctx, movie);
  return true;
}

// MUHIM: bitta xabarga inline va doimiy (reply) klaviatura birga qo'yilmaydi —
// Telegram cheklovi. Shuning uchun ikkita xabar ketma-ket (kechiktirmasdan)
// yuboriladi: birinchisi buyruq tugmalari bilan, ikkinchisi doimiy klaviaturani
// o'rnatish uchun — aks holda foydalanuvchida klaviatura "yopilib qolgandek" ko'rinadi.
async function sendWelcome(ctx: MyContext) {
  await ctx.reply(WELCOME, { reply_markup: welcomeKeyboard() });
  await ctx.reply("👇 Asosiy menyu:", { reply_markup: userMenuKeyboard() });
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

  // Deep-link kino — premium/majburiy obuna/limit tekshiruvi
  if (pendingMovieCode !== null) {
    const ok = await checkContentAccess(ctx);
    if (!ok) {
      ctx.session.scratch = { ...(ctx.session.scratch ?? {}), pendingMovieCode };
      return;
    }
    await confirmReferral(ctx, uid);
    const delivered = await deliverMovieByCode(ctx, pendingMovieCode);
    if (delivered) return;
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

startHandler.callbackQuery("start:referal", async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendReferralInfo(ctx);
});

startHandler.callbackQuery("start:random", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await checkContentAccess(ctx))) return;
  const total = await prisma.movie.count();
  if (total === 0) { await ctx.reply("📭 Hozircha kino yo'q."); return; }
  const skip = Math.floor(Math.random() * total);
  const [movie] = await prisma.movie.findMany({ skip, take: 1 });
  if (movie) await sendMovie(ctx, movie);
});
