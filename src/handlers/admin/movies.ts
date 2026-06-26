import { Composer } from "grammy";
import type { Conversation } from "@grammyjs/conversations";
import { prisma } from "../../prisma.js";
import { config, isOwner } from "../../config.js";
import { ce, e } from "../../utils/emoji.js";
import { ADMIN_MENU_BUTTONS, ibtn, BE, kb, cancelKeyboard, adminMenuKeyboard } from "../../utils/keyboard.js";
import { isValidUrl, resolveButtonStyle } from "../../utils/contentButton.js";
import { getSetting, setSetting, getGlobalButton, KEYS } from "../../utils/settings.js";
import type { MyContext } from "../../types.js";

export const moviesHandler = new Composer<MyContext>();

const CANCEL = "❌ Bekor qilish";
const isCancel = (t?: string) => t === CANCEL || t === "/cancel";

function movieMenu() {
  return kb(
    [ibtn("Kino qo'shish", "mv:add", "success", BE.chAdd)],
    [ibtn("Ro'yxat", "mv:list:0", "primary", BE.chList), ibtn("O'chirish", "mv:del:0", "danger", BE.chDelete)],
    [ibtn("Knopka boshqaruvi", "mv:btnlist:0")],
    [ibtn("Menyuga qaytish", "mv:close", undefined, BE.backMenu)],
  );
}

moviesHandler.hears(ADMIN_MENU_BUTTONS.movies, async (ctx) => {
  const count = await prisma.movie.count();
  await ctx.reply(
    `<tg-emoji emoji-id="${BE.movie}">🎬</tg-emoji> <b>Kino boshqaruvi</b>\n\n` +
      `Kinolar soni: <b>${count}</b>`,
    { reply_markup: movieMenu() }
  );
});

moviesHandler.callbackQuery("mv:close", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.deleteMessage().catch(() => {});
  await ctx.reply("Admin panel:", {
    reply_markup: adminMenuKeyboard(isOwner(ctx.from.id)),
  });
});

moviesHandler.callbackQuery("mv:add", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("addMovie");
});

// ============ QO'SHISH (conversation) ============
export async function addMovie(conversation: Conversation<MyContext>, ctx: MyContext) {
  const owner = isOwner(ctx.from?.id);

  await ctx.reply(
    `${ce("film")} <b>Yangi kino qo'shish</b>\n\n1️⃣ Kino <b>videosini</b> yuboring.`,
    { reply_markup: cancelKeyboard() }
  );

  const vidCtx = await conversation.wait();
  if (isCancel(vidCtx.message?.text))
    return vidCtx.reply("❌ Bekor qilindi.", { reply_markup: adminMenuKeyboard(owner) });
  const video = vidCtx.message?.video;
  if (!video)
    return vidCtx.reply("❌ Bu video emas.", { reply_markup: adminMenuKeyboard(owner) });
  const fileId = video.file_id;

  await vidCtx.reply("2️⃣ Kino <b>kodini</b> kiriting (raqam). Masalan: <code>123</code>");
  let code = 0;
  while (true) {
    const c = await conversation.wait();
    if (isCancel(c.message?.text))
      return c.reply("❌ Bekor qilindi.", { reply_markup: adminMenuKeyboard(owner) });
    const t = c.message?.text?.trim() ?? "";
    if (!/^\d+$/.test(t)) { await c.reply("❌ Faqat raqam."); continue; }
    code = Number(t);
    const exists = await conversation.external(() => prisma.movie.findUnique({ where: { code } }));
    if (exists) { await c.reply("⚠️ Bu kod band."); continue; }
    break;
  }

  await ctx.reply("3️⃣ Kino <b>nomini</b> kiriting.");
  const titleCtx = await conversation.wait();
  if (isCancel(titleCtx.message?.text))
    return titleCtx.reply("❌ Bekor qilindi.", { reply_markup: adminMenuKeyboard(owner) });
  const title = titleCtx.message?.text?.trim() || "Nomsiz";

  await ctx.reply("4️⃣ Tavsif (yili, janr, til) — ixtiyoriy. Kerak bo'lmasa <code>-</code>.");
  const capCtx = await conversation.wait();
  if (isCancel(capCtx.message?.text))
    return capCtx.reply("❌ Bekor qilindi.", { reply_markup: adminMenuKeyboard(owner) });
  const cap = capCtx.message?.text?.trim() ?? "-";

  let baseMsgId: number | null = null;
  if (config.baseChannelId) {
    try {
      const sent = await ctx.api.sendVideo(config.baseChannelId, fileId, {
        caption: `#kino #${code}\n🎬 ${e.escapeHtml(title)}`,
      });
      baseMsgId = sent.message_id;
    } catch (err) {
      await ctx.reply(`⚠️ Baza kanalga tashlab bo'lmadi: ${(err as Error).message}`);
    }
  }

  const movie = await conversation.external(() =>
    prisma.movie.create({
      data: { code, title, caption: cap === "-" ? null : cap, fileId, baseMsgId },
    })
  );

  await ctx.reply(
    `${ce("check")} <b>Kino qo'shildi!</b>\n\n` +
    `🎬 ${e.escapeHtml(movie.title)}\n` +
    `${ce("star")} Kod: <code>${movie.code}</code>\n` +
    (baseMsgId ? `📦 Baza kanalga tashlandi.` : `ℹ️ Baza kanal sozlanmagan.`),
    { reply_markup: adminMenuKeyboard(owner) }
  );
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
  const total  = await prisma.movie.count();
  const movies = await prisma.movie.findMany({
    orderBy: { code: "asc" }, skip: page * PAGE, take: PAGE,
  });

  if (movies.length === 0) {
    await ctx.editMessageText("📭 Kino yo'q.", { reply_markup: movieMenu() }).catch(() => {});
    return;
  }

  const rows: ReturnType<typeof ibtn>[][] = [];
  for (const m of movies) {
    rows.push(
      delMode
        ? [ibtn(`🗑 ${m.code} · ${m.title}`, `mv:delconf:${m.id}`, "danger")]
        : [ibtn(`🎬 ${m.code} · ${m.title} (${m.views}👁)`, `mv:view:${m.id}`, "primary")]
    );
  }

  const pages  = Math.ceil(total / PAGE);
  const prefix = delMode ? "mv:del" : "mv:list";
  const nav: ReturnType<typeof ibtn>[] = [];
  if (page > 0)         nav.push(ibtn("⬅️", `${prefix}:${page - 1}`));
  nav.push(ibtn(`${page + 1}/${pages}`, "noop"));
  if (page < pages - 1) nav.push(ibtn("➡️", `${prefix}:${page + 1}`));
  rows.push(nav);
  rows.push([ibtn("Orqaga", "mv:back", undefined, BE.home)]);

  await ctx.editMessageText(
    delMode ? "🗑 <b>O'chirish uchun tanlang:</b>" : `${ce("list")} <b>Kinolar</b> (jami ${total}):`,
    { reply_markup: kb(...rows) }
  ).catch(() => {});
}

moviesHandler.callbackQuery("noop", (ctx) => ctx.answerCallbackQuery());

moviesHandler.callbackQuery("mv:back", async (ctx) => {
  await ctx.answerCallbackQuery();
  const count = await prisma.movie.count();
  await ctx.editMessageText(
    `<tg-emoji emoji-id="${BE.movie}">🎬</tg-emoji> <b>Kino boshqaruvi</b>\n\n` +
      `Kinolar soni: <b>${count}</b>`,
    {
      reply_markup: movieMenu(),
    }
  ).catch(() => {});
});

moviesHandler.callbackQuery(/^mv:btnlist:\d+$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await renderGlobalMovieButtonEditor(ctx);
});

async function renderGlobalMovieButtonEditor(ctx: MyContext, edit = true) {
  const btn = await getGlobalButton("movie");
  const status = btn.buttonUrl
    ? `Nom: <b>${e.escapeHtml(btn.buttonText ?? "Ko'rish")}</b>\nHavola: ${e.escapeHtml(btn.buttonUrl)}\nRang: <b>${btn.buttonStyle}</b>`
    : "Knopka hali sozlanmagan.";

  const text =
    `<tg-emoji emoji-id="${BE.movie}">🎬</tg-emoji> <b>Kino uchun global knopka</b>\n\n` +
    `${status}\n\n<i>Bu knopka barcha kinolarda ko'rinadi.</i>`;

  const reply_markup = kb(
    [
      ibtn("Nomni o'zgartirish",    "mv:gbtntext",   "primary", BE.editName),
      ibtn("Havolani o'zgartirish", "mv:gbtnurl",    "primary", BE.editUrl),
    ],
    [
      ibtn("🎨 Rangni tanlash", "mv:gbtncolors", "primary"),
      ibtn("O'chirish",          "mv:gbtnclear",  "danger", BE.chDelete),
    ],
    [ibtn("Orqaga", "mv:back", undefined, BE.backMenu)],
  );

  if (edit) {
    await ctx.editMessageText(text, { reply_markup }).catch(() => {});
  } else {
    await ctx.reply(text, { reply_markup });
  }
}

moviesHandler.callbackQuery("mv:gbtncolors", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    "🎨 <b>Knopka rangini tanlang:</b>",
    {
      reply_markup: kb(
        [
          ibtn("Ko'k",   "mv:gbtnsty:primary", "primary"),
          ibtn("Yashil", "mv:gbtnsty:success", "success"),
          ibtn("Qizil",  "mv:gbtnsty:danger",  "danger"),
          ibtn("Random", "mv:gbtnsty:random",  "success"),
        ],
        [ibtn("Orqaga", "mv:btnlist:0", undefined, BE.backMenu)],
      ),
    }
  ).catch(() => {});
});

moviesHandler.callbackQuery("mv:gbtntext", async (ctx) => {
  ctx.session.scratch = { ...(ctx.session.scratch ?? {}), movieBtnField: "text" };
  await ctx.answerCallbackQuery();
  await ctx.reply("Yangi knopka nomini yuboring. Masalan: <code>Tomosha qilish</code>");
});

moviesHandler.callbackQuery("mv:gbtnurl", async (ctx) => {
  ctx.session.scratch = { ...(ctx.session.scratch ?? {}), movieBtnField: "url" };
  await ctx.answerCallbackQuery();
  await ctx.reply("Knopka havolasini yuboring. Masalan: <code>https://t.me/kanal</code>");
});

moviesHandler.callbackQuery(/^mv:gbtnsty:(primary|success|danger|random)$/, async (ctx) => {
  const style = resolveButtonStyle(ctx.match[1]);
  await setSetting(KEYS.movieBtnStyle, style);
  await ctx.answerCallbackQuery({ text: `Rang: ${style}` });
  await renderGlobalMovieButtonEditor(ctx);
});

moviesHandler.callbackQuery("mv:gbtnclear", async (ctx) => {
  await Promise.all([
    setSetting(KEYS.movieBtnText, ""),
    setSetting(KEYS.movieBtnUrl, ""),
    setSetting(KEYS.movieBtnStyle, "primary"),
  ]);
  await ctx.answerCallbackQuery({ text: "Knopka o'chirildi." });
  await renderGlobalMovieButtonEditor(ctx);
});

moviesHandler.on("message:text", async (ctx, next) => {
  const field = ctx.session.scratch?.movieBtnField as string | undefined;
  if (!field) return next();

  const text = ctx.message.text.trim();
  if (isCancel(text)) {
    if (ctx.session.scratch) delete ctx.session.scratch.movieBtnField;
    await ctx.reply("❌ Bekor qilindi.");
    return;
  }

  if (field === "text") {
    await setSetting(KEYS.movieBtnText, text.slice(0, 64));
    if (ctx.session.scratch) delete ctx.session.scratch.movieBtnField;
    await ctx.reply(`${ce("check")} Knopka nomi saqlandi.`);
    await renderGlobalMovieButtonEditor(ctx, false);
    return;
  }

  if (!isValidUrl(text)) {
    await ctx.reply("❌ Havola <code>http://</code> yoki <code>https://</code> bilan boshlanishi kerak.");
    return;
  }

  await setSetting(KEYS.movieBtnUrl, text);
  const currentName = await getSetting(KEYS.movieBtnText);
  if (!currentName) await setSetting(KEYS.movieBtnText, "Ko'rish");
  if (ctx.session.scratch) delete ctx.session.scratch.movieBtnField;
  await ctx.reply(`${ce("check")} Knopka havolasi saqlandi.`);
  await renderGlobalMovieButtonEditor(ctx, false);
});

moviesHandler.callbackQuery(/^mv:view:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const m = await prisma.movie.findUnique({ where: { id: Number(ctx.match[1]) } });
  if (!m) return;
  await ctx.replyWithVideo(m.fileId, {
    caption:
      `🎬 <b>${e.escapeHtml(m.title)}</b>\n` +
      `${ce("star")} Kod: <code>${m.code}</code>\n👁 Ko'rishlar: ${m.views}`,
    reply_markup: kb(
      [
        ibtn("Knopkani tahrirlash", "mv:btnlist:0", "primary", BE.editName),
        ibtn("O'chirish", `mv:delconf:${m.id}`, "danger", BE.chDelete),
      ]
    ),
  });
});

moviesHandler.callbackQuery(/^mv:delconf:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const m  = await prisma.movie.findUnique({ where: { id } });
  await prisma.movie.delete({ where: { id } }).catch(() => {});
  if (m?.baseMsgId && config.baseChannelId)
    await ctx.api.deleteMessage(config.baseChannelId, m.baseMsgId).catch(() => {});
  await ctx.answerCallbackQuery({ text: "🗑 O'chirildi" });
  await ctx.editMessageText("🗑 Kino o'chirildi.").catch(() => {});
});
