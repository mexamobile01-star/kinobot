import { Composer, Keyboard } from "grammy";
import { prisma } from "../prisma.js";
import { isAdmin } from "../config.js";
import { e } from "../utils/emoji.js";
import { userMenuKeyboard } from "../utils/keyboard.js";
import { ensureSubscribed } from "../utils/subscription.js";
import { getBool, KEYS } from "../utils/settings.js";
import { aiEnabled, askGemini } from "../services/ai.js";
import type { MyContext } from "../types.js";

export const aiUserHandler = new Composer<MyContext>();

export const AI_BTN   = "AI yordamchi";
const AI_EXIT = "❌ Chiqish";

function aiKeyboard() {
  return new Keyboard().text(AI_EXIT).resized();
}

/** Mavjud kinolar ro'yxatidan AI uchun kontekst tuzadi */
async function buildMovieContext(): Promise<string> {
  const movies = await prisma.movie.findMany({
    orderBy: { views: "desc" },
    take: 200,
    select: { code: true, title: true, genre: true, year: true },
  });
  if (movies.length === 0) return "Hozircha bazada kino yo'q.";
  return movies
    .map((m) => `- ${m.title} (kod: ${m.code}${m.genre ? `, janr: ${m.genre}` : ""}${m.year ? `, ${m.year}` : ""})`)
    .join("\n");
}

function systemPrompt(movieList: string): string {
  return (
    `Sen "Kino vaqti" Telegram bot uchun do'stona AI yordamchisan. ` +
    `Foydalanuvchiga kino tanlashda yordam berasan, kino haqidagi savollariga javob berasan. ` +
    `Har doim O'ZBEK tilida, qisqa va aniq javob ber.\n\n` +
    `Quyida botdagi MAVJUD kinolar ro'yxati (nom — kod — janr):\n${movieList}\n\n` +
    `QOIDALAR:\n` +
    `1. Foydalanuvchi kino so'rasa yoki tavsif aytsa (masalan "kosmos haqida kino"), ro'yxatdan mos kelganini top va uning KODINI ayt.\n` +
    `2. Kodni shu ko'rinishda yoz: "🎬 <Nom> — kod: <kod>". Foydalanuvchi shu kodni botga yuborib kinoni oladi.\n` +
    `3. Ro'yxatda mos kino bo'lmasa, rostini ayt va o'xshashini tavsiya qil.\n` +
    `4. Umumiy suhbat/savollarга ham javob ber, lekin qisqa.`
  );
}

aiUserHandler.hears(AI_BTN, async (ctx) => {
  const uid = ctx.from!.id;

  if (!aiEnabled()) {
    await ctx.reply("🤖 AI yordamchi hozircha sozlanmagan. Keyinroq urinib ko'ring.");
    return;
  }

  // Majburiy obuna (adminlardan tashqari)
  if (!isAdmin(uid)) {
    const forceSub = await getBool(KEYS.forceSubEnabled, true);
    if (forceSub) {
      const ok = await ensureSubscribed(ctx, uid);
      if (!ok) return;
    }
  }

  ctx.session.scratch = { ...(ctx.session.scratch ?? {}), aiChat: true };
  await ctx.reply(
    `🤖 <b>AI yordamchi</b>\n\n` +
    `Menga yozing:\n` +
    `• "jangari kino tavsiya qil"\n` +
    `• "kosmos haqida kino bormi?"\n` +
    `• yoki istalgan savolingizni.\n\n` +
    `Chiqish uchun <b>${AI_EXIT}</b> tugmasini bosing.`,
    { reply_markup: aiKeyboard() }
  );
});

aiUserHandler.hears(AI_EXIT, async (ctx) => {
  if (!ctx.session.scratch?.aiChat) return;
  if (ctx.session.scratch) delete ctx.session.scratch.aiChat;
  await ctx.reply("AI yordamchidan chiqdingiz.", { reply_markup: userMenuKeyboard() });
});

aiUserHandler.on("message:text", async (ctx, next) => {
  if (!ctx.session.scratch?.aiChat) return next();

  const text = ctx.message.text.trim();
  if (text.startsWith("/")) { if (ctx.session.scratch) delete ctx.session.scratch.aiChat; return next(); }

  await ctx.replyWithChatAction("typing").catch(() => {});
  const movieList = await buildMovieContext();
  const answer = await askGemini(text, systemPrompt(movieList));

  if (!answer) {
    await ctx.reply("🤖 Kechirasiz, hozir javob bera olmadim. Qaytadan urinib ko'ring.", {
      reply_markup: aiKeyboard(),
    });
    return;
  }

  await ctx.reply(e.escapeHtml(answer), { reply_markup: aiKeyboard() });
});
