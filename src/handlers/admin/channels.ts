import { Composer, InlineKeyboard, Keyboard } from "grammy";
import type { ChatAdministratorRights } from "grammy/types";
import { prisma } from "../../prisma.js";
import { ce } from "../../utils/emoji.js";
import { DOT } from "../../utils/keyboard.js";
import { getBool, setBool, KEYS } from "../../utils/settings.js";
import type { MyContext } from "../../types.js";
import type { ChannelType } from "@prisma/client";

export const channelsHandler = new Composer<MyContext>();

// request_chat: kanal=1, guruh=2
const REQ_CHANNEL = 1;
const REQ_GROUP = 2;

// Bot qaysi admin huquqlari bilan qo'shilsin
const BOT_RIGHTS: ChatAdministratorRights = {
  is_anonymous: false,
  can_manage_chat: true,
  can_delete_messages: true,
  can_manage_video_chats: false,
  can_restrict_members: true,
  can_promote_members: false,
  can_change_info: false,
  can_invite_users: true,
  can_post_messages: true,
  can_edit_messages: true,
  can_pin_messages: true,
  can_post_stories: false,
  can_edit_stories: false,
  can_delete_stories: false,
  can_manage_topics: false,
};

// ============ ASOSIY MENYU (rasm #1 — 1:1) ============
async function channelMenuText(): Promise<{ text: string; kb: InlineKeyboard }> {
  const enabled = await getBool(KEYS.forceSubEnabled, true);
  const count = await prisma.channel.count();

  const text =
    `${ce("menu")} <b>Kanal boshqaruvi</b>\n\n` +
    `Holat:        <b>${enabled ? "Yoqilgan" : "O'chirilgan"}</b>\n` +
    `Kanallar soni: <b>${count}</b>\n\n` +
    `Quyidagi tugmalardan birini tanlang:`;

  const kb = new InlineKeyboard()
    .text(
      `${DOT.green} Majburiy obuna: ${enabled ? "Yoqilgan" : "O'chirilgan"}`,
      "ch:toggle"
    )
    .text(`${DOT.blue} ☰ Ro'yxat (${count})`, "ch:list")
    .row()
    .text(`${DOT.green} ➕ Qo'shish`, "ch:add")
    .text(`${DOT.red} 🗑 O'chirish`, "ch:del")
    .row()
    .text(`${DOT.white} ≫ Menyuga qaytish`, "ch:close");

  return { text, kb };
}

// Reply keyboard tugmasi orqali ochish
channelsHandler.hears("📢 Kanal boshqaruvi", async (ctx) => {
  const { text, kb } = await channelMenuText();
  await ctx.reply(text, { reply_markup: kb });
});

// Menyuga qaytish (inline yangilash)
async function refreshMenu(ctx: MyContext) {
  const { text, kb } = await channelMenuText();
  await ctx.editMessageText(text, { reply_markup: kb }).catch(async () => {
    await ctx.reply(text, { reply_markup: kb });
  });
}

channelsHandler.callbackQuery("ch:menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  await refreshMenu(ctx);
});

channelsHandler.callbackQuery("ch:close", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.deleteMessage().catch(() => {});
});

// ============ MAJBURIY OBUNANI YOQISH/O'CHIRISH ============
channelsHandler.callbackQuery("ch:toggle", async (ctx) => {
  const cur = await getBool(KEYS.forceSubEnabled, true);
  await setBool(KEYS.forceSubEnabled, !cur);
  await ctx.answerCallbackQuery({
    text: !cur ? "✅ Yoqildi" : "⛔️ O'chirildi",
  });
  await refreshMenu(ctx);
});

// ============ RO'YXAT ============
channelsHandler.callbackQuery("ch:list", async (ctx) => {
  await ctx.answerCallbackQuery();
  const channels = await prisma.channel.findMany({
    orderBy: { sortOrder: "asc" },
  });
  if (channels.length === 0) {
    await ctx.reply("📭 Hozircha kanal qo'shilmagan.");
    return;
  }
  const typeLabel: Record<ChannelType, string> = {
    PUBLIC: "🔒 Ommaviy",
    PRIVATE: "🔗 Maxfiy",
    REQUEST: "📨 So'rovli",
  };
  const lines = channels.map((c, i) => {
    const handle = c.username
      ? `@${c.username}`
      : c.inviteLink ?? "(havola yo'q)";
    return (
      `<b>${i + 1}.</b> ${typeLabel[c.type]} — <b>${c.title}</b>\n` +
      `    ${handle}  ${c.isActive ? "🟢" : "🔴"}`
    );
  });
  await ctx.reply(
    `${ce("list")} <b>Kanallar ro'yxati:</b>\n\n${lines.join("\n\n")}`
  );
});

// ============ QO'SHISH — TUR TANLASH (rasm #2 — 1:1) ============
channelsHandler.callbackQuery("ch:add", async (ctx) => {
  await ctx.answerCallbackQuery();
  const text =
    `➕ <b>Qaysi turdagi kanal/guruh qo'shasiz?</b>\n\n` +
    `🔒 <b>Ommaviy</b> — username bor (masalan: @kanal)\n` +
    `🔗 <b>Maxfiy</b> — havola orqali to'g'ridan-to'g'ri qo'shiladi\n` +
    `📨 <b>So'rovli</b> — havola orqali so'rov yuboriladi, admin tasdiqlaydi`;

  const kb = new InlineKeyboard()
    .text(`${DOT.blue} 🔒 Ommaviy (username bor)`, "ch:type:PUBLIC")
    .row()
    .text(`${DOT.green} 🔗 Maxfiy (havola orqali)`, "ch:type:PRIVATE")
    .row()
    .text(`${DOT.red} 📨 So'rovli (apply to join)`, "ch:type:REQUEST")
    .row()
    .text(`${DOT.white} ≫ Orqaga`, "ch:menu");

  await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {
    return ctx.reply(text, { reply_markup: kb });
  });
});

// ============ TUR TANLANDI → request_chat reply keyboard (rasm #3) ============
channelsHandler.callbackQuery(/^ch:type:(PUBLIC|PRIVATE|REQUEST)$/, async (ctx) => {
  const type = ctx.match[1] as ChannelType;
  await ctx.answerCallbackQuery();

  // Tanlangan turni sessiyada saqlaymiz
  ctx.session.scratch = { addChannelType: type };

  const requirePublic = type === "PUBLIC";

  const kb = new Keyboard()
    .requestChat("📣 Kanalni tanlash", REQ_CHANNEL, {
      chat_is_channel: true,
      chat_has_username: requirePublic ? true : undefined,
      bot_is_member: true,
      bot_administrator_rights: BOT_RIGHTS,
      request_title: true,
      request_username: true,
    })
    .row()
    .requestChat("👥 Guruhni tanlash", REQ_GROUP, {
      chat_is_channel: false,
      chat_has_username: requirePublic ? true : undefined,
      bot_is_member: true,
      bot_administrator_rights: BOT_RIGHTS,
      request_title: true,
      request_username: true,
    })
    .row()
    .text("❌ Bekor qilish")
    .resized()
    .oneTime();

  const typeName =
    type === "PUBLIC" ? "🔒 Ommaviy" : type === "PRIVATE" ? "🔗 Maxfiy" : "📨 So'rovli";

  await ctx.reply(
    `➕ <b>${typeName} qo'shish</b>\n\n` +
      `Quyidagi tugma orqali kanal yoki guruhni tanlang.\n\n` +
      `ℹ️ Faqat <b>siz admin yoki ega</b> bo'lgan joylar ko'rinadi.\n` +
      `Tanlaganingizda bot avtomatik <b>admin</b> qilib qo'shiladi.`,
    { reply_markup: kb }
  );
});

// Bekor qilish
channelsHandler.hears("❌ Bekor qilish", async (ctx) => {
  ctx.session.scratch = {};
  await ctx.reply("❌ Bekor qilindi.", {
    reply_markup: { remove_keyboard: true },
  });
  const { text, kb } = await channelMenuText();
  await ctx.reply(text, { reply_markup: kb });
});

// ============ CHAT TANLANDI (chat_shared) → bazaga qo'shish ============
channelsHandler.on("message:chat_shared", async (ctx) => {
  const shared = ctx.message.chat_shared;
  const type = (ctx.session.scratch?.addChannelType as ChannelType) ?? "PUBLIC";
  ctx.session.scratch = {};

  const chatId = shared.chat_id;
  let title = shared.title ?? "Noma'lum";
  let username = shared.username ?? null;
  let inviteLink: string | null = null;

  // Username yo'q bo'lsa va PRIVATE/REQUEST bo'lsa — havola yaratamiz
  if (!username && (type === "PRIVATE" || type === "REQUEST")) {
    try {
      const link = await ctx.api.createChatInviteLink(chatId, {
        name: "Kino bot majburiy obuna",
        creates_join_request: type === "REQUEST",
      });
      inviteLink = link.invite_link;
    } catch (err) {
      await ctx.reply(
        `⚠️ Havola yaratib bo'lmadi. Bot kanalda admin (havola yaratish huquqi bilan) ekanini tekshiring.\n` +
          `Xato: ${(err as Error).message}`
      );
    }
  }

  try {
    await prisma.channel.upsert({
      where: { chatId: BigInt(chatId) },
      create: {
        chatId: BigInt(chatId),
        title,
        username,
        inviteLink,
        type,
        sortOrder: (await prisma.channel.count()) + 1,
      },
      update: { title, username, inviteLink, type, isActive: true },
    });
  } catch (err) {
    await ctx.reply(`❌ Bazaga yozishda xato: ${(err as Error).message}`, {
      reply_markup: { remove_keyboard: true },
    });
    return;
  }

  await ctx.reply(
    `${ce("check")} <b>Qo'shildi!</b>\n\n` +
      `📢 ${title}\n` +
      `🆔 <code>${chatId}</code>\n` +
      (username ? `🔗 @${username}\n` : inviteLink ? `🔗 ${inviteLink}\n` : "") +
      `Tur: <b>${type}</b>`,
    { reply_markup: { remove_keyboard: true } }
  );

  const { text, kb } = await channelMenuText();
  await ctx.reply(text, { reply_markup: kb });
});

// ============ O'CHIRISH ============
channelsHandler.callbackQuery("ch:del", async (ctx) => {
  await ctx.answerCallbackQuery();
  const channels = await prisma.channel.findMany({
    orderBy: { sortOrder: "asc" },
  });
  if (channels.length === 0) {
    await ctx.reply("📭 O'chirish uchun kanal yo'q.");
    return;
  }
  const kb = new InlineKeyboard();
  for (const c of channels) {
    kb.text(`🗑 ${c.title}`, `ch:delconf:${c.id}`).row();
  }
  kb.text(`${DOT.white} ≫ Orqaga`, "ch:menu");
  await ctx.editMessageText(`🗑 <b>Qaysi kanalni o'chirasiz?</b>`, {
    reply_markup: kb,
  });
});

channelsHandler.callbackQuery(/^ch:delconf:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await prisma.channel.delete({ where: { id } }).catch(() => {});
  await ctx.answerCallbackQuery({ text: "🗑 O'chirildi" });
  await refreshMenu(ctx);
});
