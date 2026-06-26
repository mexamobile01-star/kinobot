import { Composer } from "grammy";
import { isOwner } from "../../config.js";
import { prisma } from "../../prisma.js";
import { ce } from "../../utils/emoji.js";
import {
  ADMIN_MENU_BUTTONS,
  adminMenuKeyboard,
  cancelKeyboard,
} from "../../utils/keyboard.js";
import type { MyContext } from "../../types.js";

export const broadcastHandler = new Composer<MyContext>();

const CANCEL = "❌ Bekor qilish";

function isWaitingBroadcast(ctx: MyContext): boolean {
  return ctx.session.scratch?.broadcastMode === "waiting";
}

function setWaitingBroadcast(ctx: MyContext): void {
  ctx.session.scratch = { ...(ctx.session.scratch ?? {}), broadcastMode: "waiting" };
}

function clearWaitingBroadcast(ctx: MyContext): void {
  if (!ctx.session.scratch) return;
  delete ctx.session.scratch.broadcastMode;
}

broadcastHandler.hears(ADMIN_MENU_BUTTONS.broadcast, async (ctx) => {
  if (!isOwner(ctx.from?.id)) return;
  setWaitingBroadcast(ctx);
  await ctx.reply(
    `${ce("fire")} <b>Yuboriladigan xabarni tashlang.</b>\n\n` +
      `Matn, rasm, video yoki fayl yuborsangiz, bot uni barcha foydalanuvchilarga jo'natadi.`,
    { reply_markup: cancelKeyboard() }
  );
});

broadcastHandler.on("message", async (ctx, next) => {
  if (!isOwner(ctx.from?.id) || !isWaitingBroadcast(ctx)) return next();

  if (ctx.message.text === CANCEL || ctx.message.text === "/cancel") {
    clearWaitingBroadcast(ctx);
    await ctx.reply("❌ Xabar yuborish bekor qilindi.", {
      reply_markup: adminMenuKeyboard(true),
    });
    return;
  }

  clearWaitingBroadcast(ctx);
  const users = await prisma.user.findMany({
    where: { isBlocked: false },
    select: { id: true },
  });

  await ctx.reply(`⏳ Xabar ${users.length} ta foydalanuvchiga yuborilmoqda...`, {
    reply_markup: adminMenuKeyboard(true),
  });

  let sent = 0;
  let failed = 0;

  for (const user of users) {
    try {
      await ctx.api.copyMessage(Number(user.id), ctx.chat.id, ctx.message.message_id);
      sent++;
    } catch {
      failed++;
      await prisma.user
        .update({
          where: { id: user.id },
          data: { isBlocked: true },
        })
        .catch(() => null);
    }
  }

  await ctx.reply(
    `${ce("check")} <b>Xabar yuborish tugadi.</b>\n\n` +
      `Yuborildi: <b>${sent}</b>\n` +
      `Yuborilmadi: <b>${failed}</b>`
  );
});
