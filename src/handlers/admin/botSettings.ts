import { Composer } from "grammy";
import { isOwner, adminCan } from "../../config.js";
import { ADMIN_MENU_BUTTONS, adminMenuKeyboard, ibtn, kb, BE } from "../../utils/keyboard.js";
import type { MyContext } from "../../types.js";

export const botSettingsHandler = new Composer<MyContext>();

function buildMenu(userId: number | bigint) {
  const owner = isOwner(userId);
  const rows: ReturnType<typeof ibtn>[][] = [];
  if (owner) rows.push([ibtn("👑 Admin boshqaruvi", "adm:menu", "primary", BE.admin)]);
  if (adminCan(userId, "premium")) rows.push([ibtn("💎 Premium", "prm:menu", "primary", "5258093637450866522")]);
  if (adminCan(userId, "ai")) rows.push([ibtn("🤖 AI sozlamalari (model, limit)", "aiset:open", "primary")]);
  if (adminCan(userId, "backup")) rows.push([ibtn("💾 Backup", "backup:menu", "primary", BE.backup)]);
  rows.push([ibtn("Menyuga qaytish", "botset:close", undefined, BE.backMenu)]);
  return kb(...rows);
}

const HEAD = `<tg-emoji emoji-id="${BE.settings}">⚙️</tg-emoji> <b>Bot sozlamalari</b>\n\nKerakli bo'limni tanlang:`;

botSettingsHandler.hears(ADMIN_MENU_BUTTONS.botSettings, async (ctx) => {
  const uid = ctx.from!.id;
  const canAny = isOwner(uid) || adminCan(uid, "premium") || adminCan(uid, "ai") || adminCan(uid, "backup");
  if (!canAny) return;
  await ctx.reply(HEAD, { reply_markup: buildMenu(uid) });
});

// Sub-bo'limlardan qaytish uchun (edit)
botSettingsHandler.callbackQuery("botset:menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(HEAD, { reply_markup: buildMenu(ctx.from.id) }).catch(() => {});
});

botSettingsHandler.callbackQuery("botset:close", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.deleteMessage().catch(() => {});
  await ctx.reply("Admin panel:", { reply_markup: adminMenuKeyboard(ctx.from.id) });
});
