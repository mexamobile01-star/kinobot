import { Composer } from "grammy";
import { isOwner } from "../../config.js";
import { prisma } from "../../prisma.js";
import { e } from "../../utils/emoji.js";
import { ADMIN_MENU_BUTTONS, adminMenuKeyboard, ibtn, BE, kb } from "../../utils/keyboard.js";
import type { MyContext } from "../../types.js";

export const referralsHandler = new Composer<MyContext>();

const PAGE = 10;

referralsHandler.hears(ADMIN_MENU_BUTTONS.referrals, async (ctx) => {
  if (!isOwner(ctx.from?.id)) return;
  await renderTop(ctx, 0, false);
});

async function renderTop(ctx: MyContext, page: number, edit: boolean) {
  // Referrerlar bo'yicha guruhlash (tasdiqlangan)
  const grouped = await prisma.user.groupBy({
    by: ["referredById"],
    where: { referredById: { not: null }, referralConfirmed: true },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    skip: page * PAGE,
    take: PAGE,
  });

  const totalGroups = await prisma.user.groupBy({
    by: ["referredById"],
    where: { referredById: { not: null }, referralConfirmed: true },
    _count: { id: true },
  });
  const totalReferrers = totalGroups.length;
  const totalReferrals = totalGroups.reduce((a, g) => a + g._count.id, 0);

  if (grouped.length === 0) {
    const text = `<tg-emoji emoji-id="${BE.users}">👥</tg-emoji> <b>Referal bo'lim</b>\n\nHozircha referal yo'q.`;
    const markup = kb([ibtn("Menyuga qaytish", "ref:close", undefined, BE.backMenu)]);
    if (edit) await ctx.editMessageText(text, { reply_markup: markup }).catch(() => {});
    else await ctx.reply(text, { reply_markup: markup });
    return;
  }

  const rows: ReturnType<typeof ibtn>[][] = [];
  for (const g of grouped) {
    const refId = g.referredById!;
    const u = await prisma.user.findUnique({ where: { id: refId } });
    const name = u?.firstName || (u?.username ? `@${u.username}` : `ID ${refId}`);
    rows.push([ibtn(`${name} — ${g._count.id} ta`, `ref:view:${refId}`, "primary")]);
  }

  const pages = Math.ceil(totalReferrers / PAGE);
  const nav: ReturnType<typeof ibtn>[] = [];
  if (page > 0) nav.push(ibtn("⬅️", `ref:page:${page - 1}`));
  if (pages > 1) nav.push(ibtn(`${page + 1}/${pages}`, "noop:ref"));
  if (page < pages - 1) nav.push(ibtn("➡️", `ref:page:${page + 1}`));
  if (nav.length) rows.push(nav);
  rows.push([ibtn("Menyuga qaytish", "ref:close", undefined, BE.backMenu)]);

  const text =
    `<tg-emoji emoji-id="${BE.users}">👥</tg-emoji> <b>Referal bo'lim</b>\n\n` +
    `Jami referrerlar: <b>${totalReferrers}</b>\n` +
    `Jami referallar: <b>${totalReferrals}</b>\n\n` +
    `Batafsil ko'rish va xabar yuborish uchun tanlang:`;

  if (edit) await ctx.editMessageText(text, { reply_markup: kb(...rows) }).catch(() => {});
  else await ctx.reply(text, { reply_markup: kb(...rows) });
}

referralsHandler.callbackQuery("noop:ref", (ctx) => ctx.answerCallbackQuery());

referralsHandler.callbackQuery(/^ref:page:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await renderTop(ctx, Number(ctx.match[1]), true);
});

referralsHandler.callbackQuery("ref:close", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.deleteMessage().catch(() => {});
  await ctx.reply("Admin panel:", { reply_markup: adminMenuKeyboard(isOwner(ctx.from.id)) });
});

referralsHandler.callbackQuery(/^ref:view:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const refId = BigInt(ctx.match[1]);
  const u = await prisma.user.findUnique({ where: { id: refId } });
  const count = await prisma.user.count({
    where: { referredById: refId, referralConfirmed: true },
  });

  const name = u?.firstName || "—";
  const uname = u?.username ? `@${u.username}` : "—";

  await ctx.editMessageText(
    `<tg-emoji emoji-id="${BE.users}">👥</tg-emoji> <b>Referrer ma'lumoti</b>\n\n` +
    `Ism: <b>${e.escapeHtml(name)}</b>\n` +
    `Username: ${uname}\n` +
    `ID: <code>${refId}</code>\n` +
    `Referallar: <b>${count}</b> ta\n\n` +
    `<i>Bu foydalanuvchiga pul haqida xabar yuborishingiz mumkin.</i>`,
    {
      reply_markup: kb(
        [ibtn("✉️ Xabar yuborish", `ref:msg:${refId}`, "success", BE.broadcast)],
        [ibtn("Orqaga", "ref:page:0", undefined, BE.backMenu)],
      ),
    }
  ).catch(() => {});
});

referralsHandler.callbackQuery(/^ref:msg:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const refId = ctx.match[1];
  ctx.session.scratch = { ...(ctx.session.scratch ?? {}), refMsgTarget: refId };
  await ctx.reply(
    `✉️ Ushbu foydalanuvchiga yuboriladigan <b>xabarni</b> yozing (matn, rasm, video):`,
  );
});

referralsHandler.on("message", async (ctx, next) => {
  if (!isOwner(ctx.from?.id)) return next();
  const target = ctx.session.scratch?.refMsgTarget as string | undefined;
  if (!target) return next();

  const text = ctx.message.text?.trim();
  if (text === "❌ Bekor qilish" || text === "/cancel") {
    if (ctx.session.scratch) delete ctx.session.scratch.refMsgTarget;
    await ctx.reply("❌ Bekor qilindi.");
    return;
  }

  if (ctx.session.scratch) delete ctx.session.scratch.refMsgTarget;
  try {
    await ctx.api.copyMessage(Number(target), ctx.chat.id, ctx.message.message_id);
    await ctx.reply("✅ Xabar yuborildi.");
  } catch {
    await ctx.reply("❌ Yuborilmadi (foydalanuvchi botni bloklagan bo'lishi mumkin).");
  }
});
