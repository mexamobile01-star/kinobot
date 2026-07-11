import { Composer, Keyboard } from "grammy";
import { prisma } from "../../prisma.js";
import { adminCan } from "../../config.js";
import { e } from "../../utils/emoji.js";
import { ibtn, kb, BE } from "../../utils/keyboard.js";
import { indexVideoMovie } from "../../services/ingest.js";
import type { MyContext } from "../../types.js";

export const sourceChannelsHandler = new Composer<MyContext>();

const REQ_SRC = 88;

function can(ctx: MyContext): boolean {
  return adminCan(ctx.from?.id ?? 0, "movies");
}

async function menuData() {
  const count = await prisma.sourceChannel.count();
  const text =
    `📥 <b>Manba kanallar</b>\n\n` +
    `Bot <b>admin</b> bo'lgan kanallar. Ularga yangi video post tushganda ` +
    `avtomatik bazaga qo'shiladi (caption'dagi <code>#kod</code> yoki avto-kod).\n\n` +
    `Manba kanallar: <b>${count}</b>\n\n` +
    `ℹ️ Bot admin bo'lmagan kanaldan olish uchun — videoni botga <b>forward</b> qiling ` +
    `(quyidagi tugma orqali).`;
  const markup = kb(
    [ibtn("➕ Manba kanal qo'shish (bot admin)", "src:add", "success")],
    [ibtn("📤 Forward orqali qo'shish", "src:import", "primary")],
    [ibtn("📋 Ro'yxat / o'chirish", "src:list", "primary")],
    [ibtn("Orqaga", "src:back", undefined, BE.backMenu)],
  );
  return { text, markup };
}

sourceChannelsHandler.callbackQuery("src:menu", async (ctx) => {
  if (!can(ctx)) { await ctx.answerCallbackQuery(); return; }
  await ctx.answerCallbackQuery();
  const { text, markup } = await menuData();
  await ctx.editMessageText(text, { reply_markup: markup }).catch(() => {});
});

sourceChannelsHandler.callbackQuery("src:back", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `<tg-emoji emoji-id="${BE.movie}">🎬</tg-emoji> <b>Kino boshqaruvi</b>`,
    { reply_markup: kb(
      [ibtn("Kino qo'shish", "mv:add", "success", BE.chAdd)],
      [ibtn("Ro'yxat", "mv:list:0", "primary", BE.chList), ibtn("O'chirish", "mv:del:0", "danger", BE.chDelete)],
      [ibtn("Knopka boshqaruvi", "mv:btnlist:0")],
      [ibtn("📥 Manba kanallar (avto-olish)", "src:menu", "primary")],
      [ibtn("Menyuga qaytish", "mv:close", undefined, BE.backMenu)],
    )}
  ).catch(() => {});
});

// ─── Manba kanal qo'shish (requestChat) ──────────────────────────────────────
sourceChannelsHandler.callbackQuery("src:add", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.scratch = { ...(ctx.session.scratch ?? {}), srcAdd: true };
  const rkb = new Keyboard()
    .requestChat("📢 Kanalni tanlash", REQ_SRC, {
      chat_is_channel: true,
      request_title: true, request_username: true,
    })
    .row()
    .text("❌ Bekor qilish")
    .resized().oneTime();
  await ctx.reply(
    `📢 Bot <b>admin</b> bo'lgan kanalni tanlang.\n\n` +
    `⚠️ Bot o'sha kanalda admin bo'lishi shart — aks holda yangi postlar kelmaydi.`,
    { reply_markup: rkb }
  );
});

sourceChannelsHandler.on("message:chat_shared", async (ctx, next) => {
  if (!ctx.session.scratch?.srcAdd) return next();
  if (ctx.message.chat_shared.request_id !== REQ_SRC) return next();
  if (ctx.session.scratch) delete ctx.session.scratch.srcAdd;

  const shared = ctx.message.chat_shared;
  const chatId = shared.chat_id;

  // Bot admin ekanini tekshirish
  const member = await ctx.api.getChatMember(chatId, ctx.me.id).catch(() => null);
  if (!member || !["administrator", "creator"].includes(member.status)) {
    await ctx.reply("❌ Bot bu kanalda admin emas. Avval botni admin qiling, keyin qayta urinib ko'ring.", {
      reply_markup: { remove_keyboard: true },
    });
    return;
  }

  const chat = await ctx.api.getChat(chatId).catch(() => null);
  const title = shared.title ?? (chat && "title" in chat ? chat.title : undefined) ?? "Manba kanal";

  await prisma.sourceChannel.upsert({
    where: { chatId: BigInt(chatId) },
    create: { chatId: BigInt(chatId), title },
    update: { title },
  });
  await ctx.reply(`✅ Manba kanal qo'shildi: <b>${e.escapeHtml(title)}</b>\n\nEndi yangi video postlar avtomatik indekslanadi.`, {
    reply_markup: { remove_keyboard: true },
  });
});

// ─── Ro'yxat / o'chirish ─────────────────────────────────────────────────────
sourceChannelsHandler.callbackQuery("src:list", async (ctx) => {
  await ctx.answerCallbackQuery();
  const items = await prisma.sourceChannel.findMany({ orderBy: { addedAt: "asc" } });
  if (items.length === 0) {
    await ctx.editMessageText("📭 Manba kanal yo'q.", {
      reply_markup: kb([ibtn("Orqaga", "src:menu", undefined, BE.backMenu)]),
    }).catch(() => {});
    return;
  }
  const rows = items.map((s) => [ibtn(`🗑 ${s.title}`, `src:del:${s.id}`, "danger")]);
  rows.push([ibtn("Orqaga", "src:menu", undefined, BE.backMenu)]);
  await ctx.editMessageText("📋 <b>Manba kanallar:</b>", { reply_markup: kb(...rows) }).catch(() => {});
});

sourceChannelsHandler.callbackQuery(/^src:del:(\d+)$/, async (ctx) => {
  await prisma.sourceChannel.delete({ where: { id: Number(ctx.match[1]) } }).catch(() => null);
  await ctx.answerCallbackQuery({ text: "O'chirildi." });
  const items = await prisma.sourceChannel.findMany({ orderBy: { addedAt: "asc" } });
  const rows = items.map((s) => [ibtn(`🗑 ${s.title}`, `src:del:${s.id}`, "danger")]);
  rows.push([ibtn("Orqaga", "src:menu", undefined, BE.backMenu)]);
  await ctx.editMessageText(items.length ? "📋 <b>Manba kanallar:</b>" : "📭 Manba kanal yo'q.", {
    reply_markup: kb(...rows),
  }).catch(() => {});
});

// ─── Forward-import rejimi ───────────────────────────────────────────────────
sourceChannelsHandler.callbackQuery("src:import", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.scratch = { ...(ctx.session.scratch ?? {}), srcImport: true };
  await ctx.reply(
    `📤 <b>Forward orqali qo'shish</b>\n\n` +
    `Istalgan kanaldagi kino videosini shu yerga <b>forward</b> qiling — men uni bazaga qo'shaman ` +
    `(caption'dagi <code>#kod</code> yoki avtomatik kod bilan).\n\n` +
    `Ketma-ket bir nechta forward qilishingiz mumkin. Tugatgach <b>❌ Bekor qilish</b> bosing.`,
    { reply_markup: new Keyboard().text("❌ Bekor qilish").resized() }
  );
});

sourceChannelsHandler.hears("❌ Bekor qilish", async (ctx, next) => {
  if (!ctx.session.scratch?.srcImport) return next();
  if (ctx.session.scratch) delete ctx.session.scratch.srcImport;
  await ctx.reply("✅ Forward-import to'xtatildi.", { reply_markup: { remove_keyboard: true } });
});

sourceChannelsHandler.on("message:video", async (ctx, next) => {
  if (!ctx.session.scratch?.srcImport) return next();
  if (!can(ctx)) return next();

  const v = ctx.message.video;
  const res = await indexVideoMovie({
    fileId: v.file_id,
    caption: ctx.message.caption ?? null,
    duration: v.duration ?? null,
  });

  if (res.status === "created") {
    await ctx.reply(`✅ Qo'shildi: <b>${e.escapeHtml(res.title ?? "")}</b> · kod <code>${res.code}</code>`);
  } else if (res.status === "exists") {
    await ctx.reply(`ℹ️ Bu kod (<code>${res.code}</code>) allaqachon band: ${e.escapeHtml(res.title ?? "")}`);
  } else {
    await ctx.reply(`❌ Xato: ${e.escapeHtml(res.message ?? "noma'lum")}`);
  }
});
