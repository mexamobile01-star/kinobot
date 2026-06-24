import { Composer, InlineKeyboard } from "grammy";
import { createConversation } from "@grammyjs/conversations";
import type { Conversation } from "@grammyjs/conversations";
import { prisma } from "../../prisma.js";
import { config } from "../../config.js";
import { ce, e } from "../../utils/emoji.js";
import { DOT } from "../../utils/keyboard.js";
import { cancelKeyboard, adminMenuKeyboard } from "../../utils/keyboard.js";
import type { MyContext } from "../../types.js";

export const moviesHandler = new Composer<MyContext>();

const CANCEL = "❌ Bekor qilish";

function isCancel(text?: string) {
  return text === CANCEL || text === "/cancel";
}

// ============ MENYU ============
function movieMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text(`${DOT.green} ➕ Kino qo'shish`, "mv:add")
    .row()
    .text(`${DOT.blue} ☰ Ro'yxat`, "mv:list:0")
    .text(`${DOT.red} 🗑 O'chirish`, "mv:del:0")
    .row()
    .text(`${DOT.white} ≫ Yopish`, "mv:close");
}

moviesHandler.hears("🎬 Kino boshqaruvi", async (ctx) => {
  const count = await prisma.movie.count();
  await ctx.reply(
    `${ce("film")} <b>Kino boshqaruvi</b>\n\nJami kinolar: <b>${count}</b>`,
    { reply_markup: movieMenu() }
  );
});

moviesHandler.callbackQuery("mv:close", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.deleteMessage().catch(() => {});
});

// ============ QO'SHISH (conversation) ============
moviesHandler.callbackQuery("mv:add", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("addMovie");
});

export async function addMovie(conversation: Conversation<MyContext>, ctx: MyContext) {
  await ctx.reply(
    `${ce("film")} <b>Yangi kino qo'shish</b>\n\n` +
      `1️⃣ Avval kino <b>videosini</b> yuboring (forward ham bo'ladi).`,
    { reply_markup: cancelKeyboard() }
  );

  // 1) Video
  const vidCtx = await conversation.wait();
  if (isCancel(vidCtx.message?.text)) return cancel(vidCtx);
  const video = vidCtx.message?.video;
  if (!video) {
    await vidCtx.reply("❌ Bu video emas. Bekor qilindi.", {
      reply_markup: adminMenuKeyboard(),
    });
    return;
  }
  const fileId = video.file_id;

  // 2) Kod
  await vidCtx.reply("2️⃣ Kino uchun <b>kod</b> (raqam) kiriting. Masalan: <code>123</code>");
  let code = 0;
  while (true) {
    const c = await conversation.wait();
    if (isCancel(c.message?.text)) return cancel(c);
    const t = c.message?.text?.trim() ?? "";
    if (!/^\d+$/.test(t)) {
      await c.reply("❌ Faqat raqam kiriting.");
      continue;
    }
    code = Number(t);
    const exists = await conversation.external(() =>
      prisma.movie.findUnique({ where: { code } })
    );
    if (exists) {
      await c.reply("⚠️ Bu kod band. Boshqa kod kiriting.");
      continue;
    }
    break;
  }

  // 3) Nom
  await ctx.reply("3️⃣ Kino <b>nomini</b> kiriting.");
  const titleCtx = await conversation.wait();
  if (isCancel(titleCtx.message?.text)) return cancel(titleCtx);
  const title = titleCtx.message?.text?.trim() || "Nomsiz";

  // 4) Qo'shimcha (yili, janr, ...) — ixtiyoriy
  await ctx.reply(
    "4️⃣ Qo'shimcha ma'lumot (yili, janr, til, sifat) — ixtiyoriy.\n" +
      "Kerak bo'lmasa <code>-</code> yuboring."
  );
  const extraCtx = await conversation.wait();
  if (isCancel(extraCtx.message?.text)) return cancel(extraCtx);
  const extra = extraCtx.message?.text?.trim() ?? "-";
  const caption = extra === "-" ? null : extra;

  // 5) Baza kanalga tashlash (file_id olish/saqlash uchun)
  let baseMsgId: number | null = null;
  if (config.baseChannelId) {
    try {
      const sent = await ctx.api.sendVideo(config.baseChannelId, fileId, {
        caption: `#kino #${code}\n🎬 ${e.escapeHtml(title)}`,
      });
      baseMsgId = sent.message_id;
    } catch (err) {
      await ctx.reply(
        `⚠️ Baza kanalga tashlab bo'lmadi (BASE_CHANNEL_ID ni va botning admin huquqini tekshiring): ${(err as Error).message}`
      );
    }
  }

  // 6) Saqlash
  const movie = await conversation.external(() =>
    prisma.movie.create({
      data: { code, title, caption, fileId, baseMsgId },
    })
  );

  await ctx.reply(
    `${ce("check")} <b>Kino qo'shildi!</b>\n\n` +
      `🎬 ${e.escapeHtml(movie.title)}\n` +
      `${ce("star")} Kod: <code>${movie.code}</code>\n` +
      (baseMsgId ? `📦 Baza kanalga tashlandi.` : `ℹ️ Baza kanal sozlanmagan — faqat file_id saqlandi.`),
    { reply_markup: adminMenuKeyboard() }
  );
}

function cancel(ctx: MyContext) {
  return ctx.reply("❌ Bekor qilindi.", { reply_markup: adminMenuKeyboard() });
}

// ============ RO'YXAT (sahifalangan) ============
const PAGE = 8;

moviesHandler.callbackQuery(/^mv:list:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await renderList(ctx, Number(ctx.match[1]), false);
});

moviesHandler.callbackQuery(/^mv:del:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await renderList(ctx, Number(ctx.match[1]), true);
});

async function renderList(ctx: MyContext, page: number, delMode: boolean) {
  const total = await prisma.movie.count();
  const movies = await prisma.movie.findMany({
    orderBy: { code: "asc" },
    skip: page * PAGE,
    take: PAGE,
  });
  if (movies.length === 0) {
    await ctx.editMessageText("📭 Kino yo'q.", { reply_markup: movieMenu() }).catch(() => {});
    return;
  }
  const kb = new InlineKeyboard();
  for (const m of movies) {
    if (delMode) {
      kb.text(`🗑 ${m.code} · ${m.title}`, `mv:delconf:${m.id}`).row();
    } else {
      kb.text(`🎬 ${m.code} · ${m.title} (${m.views}👁)`, `mv:view:${m.id}`).row();
    }
  }
  // navigatsiya
  const pages = Math.ceil(total / PAGE);
  const nav: [string, string][] = [];
  const prefix = delMode ? "mv:del" : "mv:list";
  if (page > 0) nav.push(["⬅️", `${prefix}:${page - 1}`]);
  nav.push([`${page + 1}/${pages}`, "noop"]);
  if (page < pages - 1) nav.push(["➡️", `${prefix}:${page + 1}`]);
  for (const [t, d] of nav) kb.text(t, d);
  kb.row().text(`${DOT.white} ≫ Orqaga`, "mv:back");

  await ctx
    .editMessageText(
      `${delMode ? "🗑 O'chirish uchun tanlang" : ce("list") + " Kinolar"} (jami ${total}):`,
      { reply_markup: kb }
    )
    .catch(() => {});
}

moviesHandler.callbackQuery("noop", (ctx) => ctx.answerCallbackQuery());

moviesHandler.callbackQuery("mv:back", async (ctx) => {
  await ctx.answerCallbackQuery();
  const count = await prisma.movie.count();
  await ctx
    .editMessageText(
      `${ce("film")} <b>Kino boshqaruvi</b>\n\nJami kinolar: <b>${count}</b>`,
      { reply_markup: movieMenu() }
    )
    .catch(() => {});
});

// Bitta kinoni ko'rish
moviesHandler.callbackQuery(/^mv:view:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await ctx.answerCallbackQuery();
  const m = await prisma.movie.findUnique({ where: { id } });
  if (!m) return;
  await ctx.replyWithVideo(m.fileId, {
    caption:
      `🎬 <b>${e.escapeHtml(m.title)}</b>\n` +
      `${ce("star")} Kod: <code>${m.code}</code>\n` +
      `👁 Ko'rishlar: ${m.views}`,
    reply_markup: new InlineKeyboard().text("🗑 O'chirish", `mv:delconf:${m.id}`),
  });
});

// O'chirishni tasdiqlash
moviesHandler.callbackQuery(/^mv:delconf:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const m = await prisma.movie.findUnique({ where: { id } });
  await prisma.movie.delete({ where: { id } }).catch(() => {});
  // baza kanaldan ham o'chirishga urinish
  if (m?.baseMsgId && config.baseChannelId) {
    await ctx.api.deleteMessage(config.baseChannelId, m.baseMsgId).catch(() => {});
  }
  await ctx.answerCallbackQuery({ text: "🗑 O'chirildi" });
  await ctx.editMessageText("🗑 Kino o'chirildi.").catch(() => {});
});
