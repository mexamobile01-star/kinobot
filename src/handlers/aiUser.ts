import { Composer, Keyboard } from "grammy";
import { prisma } from "../prisma.js";
import { isAdmin } from "../config.js";
import { e } from "../utils/emoji.js";
import { userMenuKeyboard } from "../utils/keyboard.js";
import { ensureSubscribed } from "../utils/subscription.js";
import { getBool, KEYS } from "../utils/settings.js";
import { aiEnabled, askGemini } from "../services/ai.js";
import { sendMovie } from "../services/media.js";
import { sendSerialSeasons } from "./serialView.js";
import type { MyContext } from "../types.js";

export const aiUserHandler = new Composer<MyContext>();

export const AI_BTN = "AI yordamchi";
const AI_EXIT = "❌ Chiqish";

// Bot ma'lumotlari
const ADMIN_CONTACT = "@akajon_00";
const CHANNEL       = "@kinovaqti_00";

function aiKeyboard() {
  return new Keyboard().text(AI_EXIT).resized();
}

/** Mavjud kinolar va seriallar ro'yxatidan AI konteksti */
async function buildContext(): Promise<string> {
  const [movies, serials] = await Promise.all([
    prisma.movie.findMany({
      orderBy: { views: "desc" }, take: 250,
      select: { code: true, title: true, genre: true, year: true, views: true },
    }),
    prisma.serial.findMany({
      orderBy: { views: "desc" }, take: 100,
      select: { code: true, title: true, genre: true, year: true },
    }),
  ]);

  const mv = movies.length
    ? movies.map((m) => `- ${m.title} (kod: ${m.code}${m.genre ? `, ${m.genre}` : ""}${m.year ? `, ${m.year}` : ""}, ${m.views}👁)`).join("\n")
    : "yo'q";
  const sr = serials.length
    ? serials.map((s) => `- ${s.title} (kod: ${s.code}${s.genre ? `, ${s.genre}` : ""}) [serial]`).join("\n")
    : "yo'q";

  return `KINOLAR:\n${mv}\n\nSERIALLAR:\n${sr}`;
}

function systemPrompt(context: string): string {
  return (
    `Sen — "🎬 Kino vaqti" Telegram botining zamonaviy, aqlli va samimiy AI yordamchisisan. ` +
    `Vazifang: foydalanuvchiga kino/serial tanlashda yordam berish, savollariga javob berish va ularni xursand qilish.\n\n` +

    `━━━ USLUB ━━━\n` +
    `• Har doim O'ZBEK tilida yoz.\n` +
    `• Javoblaringni CHIROYLI bezat: HTML teglaridan foydalanish mumkin — <b>qalin</b>, <i>kursiv</i>, <code>kod</code>.\n` +
    `• Mos emojilardan saxiylik bilan foydalan (🎬🍿🔥⭐️😍🎭🚀💥❤️🤖 va h.k.).\n` +
    `• Ro'yxatlarni chiroyli, tushunarli tuz. Uzun matndan qoch — jonli va qiziqarli bo'l.\n` +
    `• Markdown (** yoki ##) ISHLATMA — faqat HTML teglari.\n\n` +

    `━━━ KINO YUBORISH ━━━\n` +
    `• Foydalanuvchi biror kinoni KO'RMOQCHI/OLMOQCHI bo'lsa ("shu kinoni ber", "Titanic yubor", "ko'rmoqchiman"), ` +
    `javobing OXIRIGA maxsus belgi qo'sh: [SEND:KOD] (KOD — kino/serial kodi). ` +
    `Bot shu belgini ko'rib kinoni AVTOMATIK yuboradi.\n` +
    `• Bir nechta kino bo'lsa: [SEND:12][SEND:34] shaklida.\n` +
    `• Faqat quyidagi ro'yxatdagi mavjud kino uchun [SEND] yoz. Ro'yxatda bo'lmasa — rostini ayt.\n` +
    `• Agar foydalanuvchi shunchaki TAVSIYA so'rasa (ko'rish istagini aniq bildirmasa), [SEND] yozma — ` +
    `kino nomi va <code>kod</code>ini ayt, ko'rish uchun kodni yuborishini taklif qil.\n\n` +

    `━━━ BOT MA'LUMOTLARI ━━━\n` +
    `• Admin bilan bog'lanish: ${ADMIN_CONTACT}\n` +
    `• Rasmiy kanal: ${CHANNEL}\n` +
    `• Foydalanuvchi admin/kanal haqida so'rasa — shu ma'lumotlarni ber.\n` +
    `• Kino kodini bilса, uni botga yuborsa — kino keladi. Buni eslatib turishing mumkin.\n\n` +

    `━━━ MAVJUD KONTENT ━━━\n${context}\n\n` +
    `Endi foydalanuvchiga eng yaxshi tarzda yordam ber!`
  );
}

aiUserHandler.hears(AI_BTN, async (ctx) => {
  const uid = ctx.from!.id;

  if (!aiEnabled()) {
    await ctx.reply("🤖 AI yordamchi hozircha sozlanmagan. Keyinroq urinib ko'ring.");
    return;
  }

  if (!isAdmin(uid)) {
    const forceSub = await getBool(KEYS.forceSubEnabled, true);
    if (forceSub) {
      const ok = await ensureSubscribed(ctx, uid);
      if (!ok) return;
    }
  }

  ctx.session.scratch = { ...(ctx.session.scratch ?? {}), aiChat: true };
  await ctx.reply(
    `🤖 <b>AI yordamchi</b> — sizga xizmatda! ✨\n\n` +
    `Menga yozing:\n` +
    `🔥 <i>"Eng zo'r jangari kinoni ber"</i>\n` +
    `🚀 <i>"Kosmos haqida kino bormi?"</i>\n` +
    `🎭 <i>"Kayfiyatim tushkun, biror qiziq kino tavsiya qil"</i>\n` +
    `💬 yoki istalgan savolingizni.\n\n` +
    `Men mos kinolarni topib, hatto <b>to'g'ridan-to'g'ri yuborib</b> beraman! 🎬\n\n` +
    `Chiqish uchun <b>${AI_EXIT}</b>.`,
    { reply_markup: aiKeyboard() }
  );
});

aiUserHandler.hears(AI_EXIT, async (ctx) => {
  if (!ctx.session.scratch?.aiChat) return;
  if (ctx.session.scratch) delete ctx.session.scratch.aiChat;
  await ctx.reply("AI yordamchidan chiqdingiz. 👋", { reply_markup: userMenuKeyboard() });
});

/** Kod bo'yicha kino yoki serial yuboradi */
async function deliverByCode(ctx: MyContext, code: number): Promise<boolean> {
  const movie = await prisma.movie.findUnique({ where: { code } });
  if (movie) { await sendMovie(ctx, movie); return true; }
  const serial = await prisma.serial.findUnique({ where: { code } });
  if (serial) { await sendSerialSeasons(ctx, serial.id); return true; }
  return false;
}

aiUserHandler.on("message:text", async (ctx, next) => {
  if (!ctx.session.scratch?.aiChat) return next();

  const text = ctx.message.text.trim();
  if (text.startsWith("/")) { if (ctx.session.scratch) delete ctx.session.scratch.aiChat; return next(); }

  await ctx.replyWithChatAction("typing").catch(() => {});
  const context = await buildContext();
  const answer = await askGemini(text, systemPrompt(context));

  if (!answer) {
    await ctx.reply("🤖 Kechirasiz, hozir javob bera olmadim. Birozdan keyin urinib ko'ring.", {
      reply_markup: aiKeyboard(),
    });
    return;
  }

  // [SEND:kod] belgilarini ajratib olamiz
  const codes: number[] = [];
  const re = /\[SEND:(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(answer)) !== null) codes.push(Number(m[1]));

  const display = answer.replace(/\[SEND:\d+\]/g, "").trim();

  // AI matnini yuborish (HTML, xato bo'lsa oddiy matn)
  if (display) {
    await ctx.reply(display, { reply_markup: aiKeyboard() })
      .catch(async () => {
        await ctx.reply(e.escapeHtml(display), { reply_markup: aiKeyboard() });
      });
  }

  // So'ralgan kinolarni yetkazish (takrorlanmas, ko'pi bilan 5 ta)
  const unique = [...new Set(codes)].slice(0, 5);
  for (const code of unique) {
    await deliverByCode(ctx, code).catch(() => {});
  }
});
