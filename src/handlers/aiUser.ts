import { Composer } from "grammy";
import { prisma } from "../prisma.js";
import { isAdmin } from "../config.js";
import { e } from "../utils/emoji.js";
import { ibtn, kb } from "../utils/keyboard.js";
import { ensureSubscribed } from "../utils/subscription.js";
import { getBool, KEYS } from "../utils/settings.js";
import { aiEnabled, askGemini } from "../services/ai.js";
import { sendMovie } from "../services/media.js";
import { sendSerialSeasons } from "./serialView.js";
import type { MyContext } from "../types.js";

export const aiUserHandler = new Composer<MyContext>();

export const AI_BTN = "AI yordamchi";

// Bot ma'lumotlari
const ADMIN_CONTACT = "@akajon_00";
const CHANNEL       = "@kinovaqti_00";

const PAGE_SIZE = 5;

interface AiListItem {
  type: "m" | "s";
  code: number;
  title: string;
}

// MUHIM: pastdagi doimiy (reply) klaviatura AI rejimida HAM o'zgarmaydi —
// shuning uchun undan chiqish uchun har bir AI javobiga inline "❌ Chiqish"
// tugmasi biriktiriladi. Aks holda (persistent keyboard almashtirilsa)
// foydalanuvchida "klaviatura yopilib qolgandek" muammo paydo bo'ladi.
function aiReplyMarkup() {
  return kb([ibtn("❌ AI suhbatini tugatish", "ai:exit", "danger")]);
}

/** Mavjud kinolar va seriallar ro'yxatidan AI konteksti (m/s prefiksli kodlar) */
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
    ? movies.map((m) => `- ${m.title} (kod: m${m.code}${m.genre ? `, ${m.genre}` : ""}${m.year ? `, ${m.year}` : ""}, ${m.views}👁)`).join("\n")
    : "yo'q";
  const sr = serials.length
    ? serials.map((s) => `- ${s.title} (kod: s${s.code}${s.genre ? `, ${s.genre}` : ""}) [serial]`).join("\n")
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

    `━━━ KODLAR ━━━\n` +
    `• Har bir kino/serial kodi old qo'shimchali: kino uchun "m"+raqam (m12), serial uchun "s"+raqam (s7).\n` +
    `• Javobingda kodni HAR DOIM shu ko'rinishda yoz (m12, s7) — old qo'shimchasiz ishlatma.\n\n` +

    `━━━ KINO YUBORISH ━━━\n` +
    `• Foydalanuvchi BITTA kinoni HOZIR ko'rmoqchi bo'lsa ("shu kinoni ber", "Titanic yubor"): ` +
    `javob oxiriga [SEND:m12] yoki [SEND:s7] qo'sh — bot uni AVTOMATIK yuboradi. Bir nechta bo'lsa: [SEND:m12][SEND:s7].\n` +
    `• Foydalanuvchi BIR NECHTA kino so'rasa yoki RO'YXAT/TAVSIYA so'rasa ("5 ta kino tavsiya qil", "jangari kinolarni ko'rsat"): ` +
    `javob oxiriga barcha mos kodlarni bitta tegga jamlab yoz: [LIST:m12,s7,m88] — foydalanuvchiga chiroyli TUGMALI ` +
    `ro'yxat (sahifalash bilan) ko'rsatiladi.\n` +
    `• Bitta javobda HAM [SEND] HAM [LIST] ishlatma — vaziyatga qarab FAQAT bittasini tanla.\n` +
    `• Faqat yuqoridagi ro'yxatdagi mavjud kodlardan foydalan. Ro'yxatda yo'q bo'lsa — rostini ayt.\n\n` +

    `━━━ BOT MA'LUMOTLARI ━━━\n` +
    `• Admin bilan bog'lanish: ${ADMIN_CONTACT}\n` +
    `• Rasmiy kanal: ${CHANNEL}\n` +
    `• Foydalanuvchi admin/kanal haqida so'rasa — shu ma'lumotlarni ber.\n\n` +

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
  // Doimiy klaviatura O'ZGARMAYDI — foydalanuvchi istalgan payt boshqa
  // menyu tugmasini (Kino qidirish va h.k.) bosishi yoki kod yozishi mumkin.
  await ctx.reply(
    `🤖 <b>AI yordamchi</b> — sizga xizmatda! ✨\n\n` +
    `Menga yozing:\n` +
    `🔥 <i>"Eng zo'r jangari kinoni ber"</i>\n` +
    `🚀 <i>"Kosmos haqida kino bormi?"</i>\n` +
    `🎭 <i>"5 ta komediya tavsiya qil"</i>\n` +
    `💬 yoki istalgan savolingizni.\n\n` +
    `Men mos kinolarni topib, <b>to'g'ridan-to'g'ri yuborib</b> yoki chiroyli <b>tugmali ro'yxat</b> qilib beraman! 🎬\n\n` +
    `Kino kodini yuborsangiz — oddiy qidiruvga o'tasiz. Chiqish uchun pastdagi tugmani bosing.`,
    { reply_markup: aiReplyMarkup() }
  );
});

aiUserHandler.callbackQuery("ai:exit", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "AI suhbati tugatildi." });
  if (ctx.session.scratch) delete ctx.session.scratch.aiChat;
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
});

/** "m12" / "s7" ko'rinishidagi kod bo'yicha kino yoki serialni yuboradi */
async function deliverPrefixedCode(ctx: MyContext, raw: string): Promise<boolean> {
  const type = raw[0];
  const num = Number(raw.slice(1));
  if (!Number.isInteger(num)) return false;

  if (type === "s") {
    const serial = await prisma.serial.findUnique({ where: { code: num } });
    if (!serial) return false;
    await sendSerialSeasons(ctx, serial.id);
    return true;
  }
  const movie = await prisma.movie.findUnique({ where: { code: num } });
  if (!movie) return false;
  await sendMovie(ctx, movie);
  return true;
}

/** [LIST:...] tegidagi kodlarni DB'dan sarlavhalari bilan aniqlaydi (tartib va takrorsiz) */
async function resolveListItems(rawCodes: string[]): Promise<AiListItem[]> {
  const movieCodes: number[] = [];
  const serialCodes: number[] = [];
  const order: { type: "m" | "s"; code: number }[] = [];

  for (const rc of rawCodes) {
    const type = rc[0] === "s" ? "s" : "m";
    const num = Number(rc.slice(1));
    if (!Number.isInteger(num)) continue;
    if (type === "s") serialCodes.push(num); else movieCodes.push(num);
    order.push({ type, code: num });
  }

  const [movies, serials] = await Promise.all([
    movieCodes.length
      ? prisma.movie.findMany({ where: { code: { in: movieCodes } }, select: { code: true, title: true } })
      : Promise.resolve([]),
    serialCodes.length
      ? prisma.serial.findMany({ where: { code: { in: serialCodes } }, select: { code: true, title: true } })
      : Promise.resolve([]),
  ]);
  const mMap = new Map(movies.map((m) => [m.code, m.title]));
  const sMap = new Map(serials.map((s) => [s.code, s.title]));

  const items: AiListItem[] = [];
  const seen = new Set<string>();
  for (const o of order) {
    const key = `${o.type}${o.code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const title = o.type === "s" ? sMap.get(o.code) : mMap.get(o.code);
    if (title) items.push({ type: o.type, code: o.code, title });
  }
  return items;
}

function buildListKeyboard(items: AiListItem[], page: number) {
  const start = page * PAGE_SIZE;
  const pageItems = items.slice(start, start + PAGE_SIZE);

  const rows = pageItems.map((it) => [
    ibtn(
      `${it.type === "s" ? "📺" : "🎬"} ${it.title}`,
      `ai:watch:${it.type}${it.code}`,
      it.type === "s" ? "success" : "primary",
    ),
  ]);

  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  if (totalPages > 1) {
    const nav: ReturnType<typeof ibtn>[] = [];
    if (page > 0) nav.push(ibtn("⬅️ Orqaga", `ai:pg:${page - 1}`, "primary"));
    nav.push(ibtn(`${page + 1}/${totalPages}`, "noop:ai"));
    if (page < totalPages - 1) nav.push(ibtn("Oldinga ➡️", `ai:pg:${page + 1}`, "success"));
    rows.push(nav);
  }
  rows.push([ibtn("❌ Yopish", "ai:close", "danger")]);

  return kb(...rows);
}

async function renderAiList(ctx: MyContext, edit: boolean) {
  const state = ctx.session.scratch?.aiList as { items: AiListItem[]; page: number } | undefined;
  if (!state) return;
  const markup = buildListKeyboard(state.items, state.page);

  if (edit) {
    await ctx.editMessageReplyMarkup({ reply_markup: markup }).catch(() => {});
  } else {
    await ctx.reply(
      `🎯 <b>Tavsiya etilgan kinolar</b> (${state.items.length} ta):`,
      { reply_markup: markup }
    );
  }
}

aiUserHandler.on("message:text", async (ctx, next) => {
  if (!ctx.session.scratch?.aiChat) return next();

  const text = ctx.message.text.trim();
  if (text.startsWith("/")) { if (ctx.session.scratch) delete ctx.session.scratch.aiChat; return next(); }

  // Aniq kino/serial kodi (faqat raqam) — foydalanuvchi AI'dan emas, oddiy
  // qidiruvdan foydalanmoqchi. AI rejimidan jimgina chiqamiz (doimiy
  // klaviatura hech qachon o'zgarmagani uchun buni ko'rsatish shart emas)
  // va odatdagi qidiruv oqimiga o'tkazamiz.
  if (/^\d+$/.test(text)) {
    if (ctx.session.scratch) delete ctx.session.scratch.aiChat;
    return next();
  }

  await ctx.replyWithChatAction("typing").catch(() => {});
  const context = await buildContext();
  const answer = await askGemini(text, systemPrompt(context));

  if (!answer) {
    await ctx.reply("🤖 Kechirasiz, hozir javob bera olmadim. Birozdan keyin urinib ko'ring.", {
      reply_markup: aiReplyMarkup(),
    });
    return;
  }

  const listMatch = answer.match(/\[LIST:([^\]]+)\]/i);
  const display = answer
    .replace(/\[LIST:[^\]]+\]/gi, "")
    .replace(/\[SEND:[ms]?\d+\]/gi, "")
    .trim();

  // AI matnini yuborish (HTML, xato bo'lsa oddiy matn) — inline "chiqish" bilan
  if (display) {
    await ctx.reply(display, { reply_markup: aiReplyMarkup() })
      .catch(async () => {
        await ctx.reply(e.escapeHtml(display), { reply_markup: aiReplyMarkup() });
      });
  }

  if (listMatch) {
    // Bir nechta kino — chiroyli tugmali (sahifalangan) ro'yxat
    const rawCodes = listMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
    const items = await resolveListItems(rawCodes);
    if (items.length) {
      ctx.session.scratch = { ...(ctx.session.scratch ?? {}), aiList: { items, page: 0 } };
      await renderAiList(ctx, false);
    }
    return;
  }

  // Bitta/bir nechta [SEND:...] — to'g'ridan-to'g'ri yuborish (ko'pi bilan 5 ta)
  const codes: string[] = [];
  const re = /\[SEND:([ms]\d+)\]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(answer)) !== null) codes.push(m[1]);

  const unique = [...new Set(codes)].slice(0, 5);
  for (const code of unique) {
    await deliverPrefixedCode(ctx, code).catch(() => {});
  }
});

// ─── AI ro'yxat knopkalari ────────────────────────────────────────────────────

aiUserHandler.callbackQuery("noop:ai", (ctx) => ctx.answerCallbackQuery());

aiUserHandler.callbackQuery(/^ai:watch:([ms]\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = ctx.from.id;
  if (!isAdmin(uid)) {
    const forceSub = await getBool(KEYS.forceSubEnabled, true);
    if (forceSub) {
      const ok = await ensureSubscribed(ctx, uid);
      if (!ok) return;
    }
  }
  await deliverPrefixedCode(ctx, ctx.match[1]).catch(() => {});
});

aiUserHandler.callbackQuery(/^ai:pg:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const state = ctx.session.scratch?.aiList as { items: AiListItem[]; page: number } | undefined;
  if (!state) return;
  state.page = Number(ctx.match[1]);
  ctx.session.scratch = { ...(ctx.session.scratch ?? {}), aiList: state };
  await renderAiList(ctx, true);
});

aiUserHandler.callbackQuery("ai:close", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (ctx.session.scratch) delete ctx.session.scratch.aiList;
  await ctx.deleteMessage().catch(() => {});
});
