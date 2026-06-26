import { Composer, Keyboard } from "grammy";
import { isOwner } from "../../config.js";
import { prisma } from "../../prisma.js";
import { ce, e } from "../../utils/emoji.js";
import { ADMIN_MENU_BUTTONS, adminMenuKeyboard, ibtn, BE, kb } from "../../utils/keyboard.js";
import { getBool, setBool, KEYS } from "../../utils/settings.js";
import type { MyContext } from "../../types.js";
import type { ChannelType } from "@prisma/client";

export const channelsHandler = new Composer<MyContext>();

const REQ_CHANNEL = 1;
const REQ_GROUP   = 2;

interface PendingChannel {
  chatId: number;
  title: string;
  username: string | null;
  type: ChannelType;
}

async function channelMenuData() {
  const enabled = await getBool(KEYS.forceSubEnabled, true);
  const count   = await prisma.channel.count();

  const text =
    `${ce("menu")} <b>Kanal boshqaruvi</b>\n\n` +
    `Holat: <b>${enabled ? "Yoqilgan" : "O'chirilgan"}</b>\n` +
    `Kanallar soni: <b>${count}</b>\n\n` +
    `Quyidagi tugmalardan birini tanlang:`;

  const markup = kb(
    [
      ibtn(
        enabled ? "Majburiy obuna: Yoqilgan" : "Majburiy obuna: O'chirilgan",
        "ch:toggle",
        enabled ? "success" : "danger",
        enabled ? BE.subOn : BE.subOff
      ),
      ibtn(`Ro'yxat (${count})`, "ch:list", "primary", BE.chList),
    ],
    [
      ibtn("Qo'shish",  "ch:add", "success", BE.chAdd),
      ibtn("O'chirish", "ch:del", "danger", BE.chDelete),
    ],
    [ibtn("Menyuga qaytish", "ch:close", undefined, BE.backMenu)],
  );

  return { text, markup };
}

channelsHandler.hears(ADMIN_MENU_BUTTONS.channels, async (ctx) => {
  const { text, markup } = await channelMenuData();
  await ctx.reply(text, { reply_markup: markup });
});

async function refreshMenu(ctx: MyContext) {
  const { text, markup } = await channelMenuData();
  await ctx.editMessageText(text, { reply_markup: markup }).catch(async () => {
    await ctx.reply(text, { reply_markup: markup });
  });
}

channelsHandler.callbackQuery("ch:menu",  async (ctx) => { await ctx.answerCallbackQuery(); await refreshMenu(ctx); });
channelsHandler.callbackQuery("ch:close", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.deleteMessage().catch(() => {});
  await ctx.reply("Admin panel:", {
    reply_markup: adminMenuKeyboard(isOwner(ctx.from.id)),
  });
});

// ============ TOGGLE ============
channelsHandler.callbackQuery("ch:toggle", async (ctx) => {
  const cur = await getBool(KEYS.forceSubEnabled, true);
  await setBool(KEYS.forceSubEnabled, !cur);
  await ctx.answerCallbackQuery({ text: !cur ? "Yoqildi" : "O'chirildi" });
  await refreshMenu(ctx);
});

// ============ RO'YXAT ============
channelsHandler.callbackQuery("ch:list", async (ctx) => {
  const channels = await prisma.channel.findMany({ orderBy: { sortOrder: "asc" } });
  if (channels.length === 0) {
    await ctx.answerCallbackQuery({ text: "Hozircha kanal qo'shilmagan.", show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery({ text: "Ro'yxat ochildi." });

  const label: Record<ChannelType, string> = {
    PUBLIC: "Ommaviy", PRIVATE: "Maxfiy", REQUEST: "So'rovli",
  };
  const lines = channels.map((c, i) => {
    const handle = c.username ? `@${c.username}` : c.inviteLink ?? "(havola yo'q)";
    return `<b>${i + 1}.</b> ${label[c.type]} - <b>${e.escapeHtml(c.title)}</b>\n<code>${e.escapeHtml(handle)}</code> ${c.isActive ? "faol" : "nofaol"}`;
  });
  await ctx.editMessageText(
    `${ce("list")} <b>Kanallar ro'yxati:</b>\n\n${lines.join("\n\n")}`,
    { reply_markup: kb([ibtn("Orqaga", "ch:menu", undefined, BE.backMenu)]) }
  ).catch(async () => {
    await ctx.reply(`${ce("list")} <b>Kanallar ro'yxati:</b>\n\n${lines.join("\n\n")}`);
  });
});

// ============ QO'SHISH — TUR TANLASH ============
channelsHandler.callbackQuery("ch:add", async (ctx) => {
  await ctx.answerCallbackQuery();
  const text =
    `<b>Qaysi turdagi kanal/guruh qo'shasiz?</b>\n\n` +
    `<b>Ommaviy</b> — username bor (@kanal). Forward yoki @username bilan ham qo'shish mumkin.\n` +
    `<b>Maxfiy</b> — havola orqali to'g'ridan-to'g'ri qo'shiladi.\n` +
    `<b>So'rovli</b> — so'rov yuboriladi, admin tasdiqlaydi. Taklif havolasi kerak.`;

  await ctx.editMessageText(text, {
    reply_markup: kb(
      [ibtn("Ommaviy (username bor)",   "ch:type:PUBLIC",  "primary", BE.chList)],
      [ibtn("Maxfiy (havola orqali)",   "ch:type:PRIVATE", "success", BE.chAdd)],
      [ibtn("So'rovli (apply to join)", "ch:type:REQUEST", "danger",  BE.subOn)],
      [ibtn("Orqaga", "ch:menu", undefined, BE.backMenu)],
    ),
  }).catch(() => {});
});

channelsHandler.callbackQuery(/^ch:type:(PUBLIC|PRIVATE|REQUEST)$/, async (ctx) => {
  const type = ctx.match[1] as ChannelType;
  await ctx.answerCallbackQuery();
  ctx.session.scratch = { addChannelType: type };

  const requirePublic = type === "PUBLIC";
  const typeName = type === "PUBLIC" ? "Ommaviy" : type === "PRIVATE" ? "Maxfiy" : "So'rovli";

  // user_administrator_rights va bot_administrator_rights yo'q —
  // foydalanuvchi admin/ega bo'lgan BARCHA kanallar ko'rinadi
  const rkb = new Keyboard()
    .requestChat("📢 Kanalni tanlash", REQ_CHANNEL, {
      chat_is_channel: true,
      chat_has_username: requirePublic ? true : undefined,
      request_title: true, request_username: true,
    })
    .row()
    .requestChat("👥 Guruhni tanlash", REQ_GROUP, {
      chat_is_channel: false,
      chat_has_username: requirePublic ? true : undefined,
      request_title: true, request_username: true,
    })
    .row()
    .text("❌ Bekor qilish")
    .resized().oneTime();

  let extra = "";
  if (type === "PUBLIC") {
    extra = `\n\n<i>Yoki kanaldan xabar <b>forward</b> qiling, yoxud <code>@username</code> / <code>https://t.me/username</code> yuboring.</i>`;
  }

  await ctx.reply(
    `<b>${typeName} qo'shish</b>\n\n` +
    `Tugma orqali kanal/guruhni tanlang yoki ega/admin bo'lgan kanalingizni tanlang.${extra}`,
    { reply_markup: rkb }
  );
});

// ============ SO'ROVLI UCHUN AVTOMATIK INVITE ============
channelsHandler.callbackQuery("ch:autoinvite", async (ctx) => {
  await ctx.answerCallbackQuery();
  const pending = ctx.session.scratch?.pendingRequestChannel as PendingChannel | undefined;
  if (!pending) {
    await ctx.reply("❌ Ma'lumot eskirdi. Qaytadan urinib ko'ring.");
    const { text, markup } = await channelMenuData();
    await ctx.reply(text, { reply_markup: markup });
    return;
  }

  try {
    const link = await ctx.api.createChatInviteLink(pending.chatId, {
      name: "Kino bot majburiy obuna",
      creates_join_request: true,
    });
    await finishAddChannel(ctx, { ...pending, inviteLink: link.invite_link });
  } catch (err) {
    await ctx.reply(`❌ Havola yaratib bo'lmadi: ${(err as Error).message}\n\nBotda <b>can_invite_users</b> huquqi borligini tekshiring.`);
  }
});

channelsHandler.callbackQuery("ch:cancelinvite", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.scratch = {};
  await refreshMenu(ctx);
});

// ============ BARCHA XABARLARNI USHLAB OLISH ============
channelsHandler.on("message", async (ctx, next) => {
  const hasPending  = !!ctx.session.scratch?.pendingRequestChannel;
  const hasAddType  = !!ctx.session.scratch?.addChannelType;

  if (!hasPending && !hasAddType) return next();

  // chat_shared — o'z handleriga o'tadi
  if (ctx.message?.chat_shared) return next();

  const msgText = ctx.message?.text?.trim();

  // Bekor qilish
  if (msgText === "❌ Bekor qilish" || msgText === "/cancel") {
    ctx.session.scratch = {};
    await ctx.reply("❌ Bekor qilindi.", { reply_markup: { remove_keyboard: true } });
    const { text, markup } = await channelMenuData();
    await ctx.reply(text, { reply_markup: markup });
    return;
  }

  // --- SO'ROVLI KANAL uchun invite link kutilmoqda ---
  if (hasPending) {
    if (!msgText) { await ctx.reply("❌ Matn yuboring."); return; }

    if (!msgText.startsWith("https://t.me/+") && !msgText.startsWith("https://t.me/joinchat/")) {
      await ctx.reply(
        "❌ Bu to'g'ri join-request havolasi emas.\n\n" +
        "<code>https://t.me/+</code> yoki <code>https://t.me/joinchat/</code> bilan boshlanishi kerak."
      );
      return;
    }

    const pending = ctx.session.scratch!.pendingRequestChannel as PendingChannel;
    await finishAddChannel(ctx, { ...pending, inviteLink: msgText });
    return;
  }

  // --- KANAL TANLASH bosqichida ---
  const type = ctx.session.scratch!.addChannelType as ChannelType;

  // Forward from channel
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const origin = (ctx.message as any)?.forward_origin;
  if (origin?.type === "channel") {
    await processChannelInfo(ctx, {
      chatId:   origin.chat.id,
      title:    origin.chat.title ?? "Noma'lum",
      username: origin.chat.username ?? null,
      type,
    });
    return;
  }

  // @username yoki https://t.me/username (faqat PUBLIC uchun)
  if (type === "PUBLIC" && msgText && (msgText.startsWith("@") || msgText.includes("t.me/"))) {
    let target: string | null = null;
    if (msgText.startsWith("@")) {
      target = msgText;
    } else {
      // https://t.me/username yoki https://t.me/username/123
      const m = msgText.match(/t\.me\/([^/?+\s]+)/);
      if (m && !m[1].startsWith("+") && m[1] !== "joinchat") {
        target = "@" + m[1];
      }
    }

    if (!target) {
      await ctx.reply("❌ Username yoki havola noto'g'ri.");
      return;
    }

    try {
      const chat = await ctx.api.getChat(target);
      await processChannelInfo(ctx, {
        chatId:   chat.id,
        title:    (chat as { title?: string }).title ?? "Noma'lum",
        username: (chat as { username?: string }).username ?? null,
        type,
      });
    } catch (err) {
      await ctx.reply(`❌ Kanal topilmadi: ${(err as Error).message}`);
    }
    return;
  }

  return next();
});

// ============ CHAT TANLANDI (requestChat orqali) ============
channelsHandler.on("message:chat_shared", async (ctx) => {
  const shared = ctx.message.chat_shared;
  const type   = (ctx.session.scratch?.addChannelType as ChannelType) ?? "PUBLIC";
  ctx.session.scratch = {};

  const chatId = shared.chat_id;
  const chat   = await ctx.api.getChat(chatId).catch(() => null);
  const title    = shared.title ?? (chat && "title" in chat ? chat.title : undefined) ?? "Noma'lum";
  const username = shared.username ?? (chat && "username" in chat ? chat.username : undefined) ?? null;

  await processChannelInfo(ctx, { chatId, title, username, type });
});

// ============ KANAL MA'LUMOTLARINI TEKSHIRISH VA SAQLASH ============
async function processChannelInfo(ctx: MyContext, info: PendingChannel) {
  const { chatId, title, username, type } = info;

  // Bot admin ekanligini tekshirish
  const botMember = await ctx.api.getChatMember(chatId, ctx.me.id).catch(() => null);
  if (!botMember || !["administrator", "creator"].includes(botMember.status)) {
    await ctx.reply(
      `❌ Bot <b>${e.escapeHtml(title)}</b> kanalida admin emas.\n\n` +
      `Avval botni admin qilib qo'shing, keyin qayta urinib ko'ring.`,
      { reply_markup: { remove_keyboard: true } }
    );
    const { text, markup } = await channelMenuData();
    await ctx.reply(text, { reply_markup: markup });
    return;
  }

  // Ommaviy: username majburiy
  if (type === "PUBLIC" && !username) {
    await ctx.reply(
      `❌ Ommaviy kanal uchun <b>username</b> bo'lishi kerak.\n\n` +
      `Bu kanal maxfiy ko'rinadi — Maxfiy yoki So'rovli turini tanlang.`,
      { reply_markup: { remove_keyboard: true } }
    );
    const { text, markup } = await channelMenuData();
    await ctx.reply(text, { reply_markup: markup });
    return;
  }

  // So'rovli: invite link so'rash yoki avtomatik yaratish
  if (type === "REQUEST") {
    ctx.session.scratch = { pendingRequestChannel: info };
    await ctx.reply(
      `✅ Kanal aniqlandi: <b>${e.escapeHtml(title)}</b>\n\n` +
      `So'rovli kanal uchun <b>join-request havolasi</b> kerak.\n\n` +
      `Havolani yuboring (https://t.me/+ ...) yoki avtomatik yarating:`,
      {
        reply_markup: kb(
          [ibtn("🔗 Avtomatik yaratish", "ch:autoinvite", "success", BE.chAdd)],
          [ibtn("❌ Bekor qilish",        "ch:cancelinvite", "danger", BE.backMenu)],
        ),
      }
    );
    return;
  }

  // Maxfiy: invite link avtomatik yaratish
  let inviteLink: string | null = null;
  if (!username) {
    try {
      const link = await ctx.api.createChatInviteLink(chatId, {
        name: "Kino bot majburiy obuna",
        creates_join_request: false,
      });
      inviteLink = link.invite_link;
    } catch (err) {
      await ctx.reply(
        `❌ Havola yaratib bo'lmadi: ${(err as Error).message}`,
        { reply_markup: { remove_keyboard: true } }
      );
      const { text, markup } = await channelMenuData();
      await ctx.reply(text, { reply_markup: markup });
      return;
    }
  }

  await finishAddChannel(ctx, { ...info, inviteLink });
}

async function finishAddChannel(
  ctx: MyContext,
  info: PendingChannel & { inviteLink: string | null }
) {
  ctx.session.scratch = {};
  const { chatId, title, username, type, inviteLink } = info;

  try {
    await prisma.channel.upsert({
      where:  { chatId: BigInt(chatId) },
      create: {
        chatId: BigInt(chatId), title, username, inviteLink, type,
        sortOrder: (await prisma.channel.count()) + 1,
      },
      update: { title, username, inviteLink, type, isActive: true },
    });
  } catch (err) {
    await ctx.reply(`❌ Xato: ${(err as Error).message}`, {
      reply_markup: { remove_keyboard: true },
    });
    return;
  }

  await ctx.reply(
    `${ce("check")} <b>Qo'shildi!</b>\n\n` +
    `<b>${e.escapeHtml(title)}</b>\n<code>${chatId}</code>\n` +
    (username ? `@${e.escapeHtml(username)}\n` : inviteLink ? `${e.escapeHtml(inviteLink)}\n` : "") +
    `Tur: <b>${type}</b>`,
    { reply_markup: { remove_keyboard: true } }
  );
  const { text, markup } = await channelMenuData();
  await ctx.reply(text, { reply_markup: markup });
}

// ============ O'CHIRISH ============
channelsHandler.callbackQuery("ch:del", async (ctx) => {
  const channels = await prisma.channel.findMany({ orderBy: { sortOrder: "asc" } });
  if (channels.length === 0) {
    await ctx.answerCallbackQuery({ text: "O'chirish uchun kanal yo'q.", show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery({ text: "Kanalni tanlang." });
  const rows = channels.map((c) => [ibtn(c.title, `ch:delconf:${c.id}`, "danger", BE.chDelete)]);
  rows.push([ibtn("Orqaga", "ch:menu", undefined, BE.backMenu)]);
  await ctx.editMessageText(`<b>Qaysi kanalni o'chirasiz?</b>`, { reply_markup: kb(...rows) });
});

channelsHandler.callbackQuery(/^ch:delconf:(\d+)$/, async (ctx) => {
  await prisma.channel.delete({ where: { id: Number(ctx.match[1]) } }).catch(() => {});
  await ctx.answerCallbackQuery({ text: "O'chirildi" });
  await refreshMenu(ctx);
});
