import { Composer, Keyboard } from "grammy";
import { prisma } from "../../prisma.js";
import { addAdminId, config, isOwner, removeAdminId } from "../../config.js";
import { ce, e } from "../../utils/emoji.js";
import { ADMIN_MENU_TEXT, BE, adminMenuKeyboard, ibtn, kb, rbtn } from "../../utils/keyboard.js";
import type { MyContext } from "../../types.js";
import type { User } from "@prisma/client";

export const adminsHandler = new Composer<MyContext>();

const PAGE = 8;
const REQUEST_USERS = 77;
const BACK_TEXT = "Orqaga";

type AdminAction = "addById" | "addByUsername";

function adminAction(ctx: MyContext): AdminAction | null {
  const action = ctx.session.scratch?.adminAction;
  return action === "addById" || action === "addByUsername" ? action : null;
}

function setAdminAction(ctx: MyContext, action: AdminAction): void {
  ctx.session.scratch = { ...(ctx.session.scratch ?? {}), adminAction: action };
}

function clearAdminAction(ctx: MyContext): void {
  if (!ctx.session.scratch) return;
  delete ctx.session.scratch.adminAction;
}

function isOwnerId(id: bigint): boolean {
  return config.ownerIds.includes(id);
}

function userLabel(user: Pick<User, "id" | "firstName" | "username" | "isAdmin">): string {
  const name = user.firstName?.trim() || "Nomsiz";
  const username = user.username ? ` @${user.username}` : "";
  return `${user.isAdmin ? "👑" : "👤"} ${name}${username} (${user.id})`;
}

async function grantAdmin(
  id: bigint,
  profile: { firstName?: string | null; username?: string | null } = {}
): Promise<User> {
  const user = await prisma.user.upsert({
    where: { id },
    create: {
      id,
      firstName: profile.firstName ?? null,
      username: profile.username ?? null,
      isAdmin: true,
    },
    update: {
      isAdmin: true,
      ...(profile.firstName !== undefined && { firstName: profile.firstName }),
      ...(profile.username !== undefined && { username: profile.username }),
    },
  });
  addAdminId(id);
  return user;
}

async function revokeAdmin(id: bigint): Promise<boolean> {
  if (isOwnerId(id)) return false;
  await prisma.user
    .update({
      where: { id },
      data: { isAdmin: false },
    })
    .catch(() => null);
  removeAdminId(id);
  return true;
}

async function renderAdminMenu(ctx: MyContext, edit = false) {
  const [users, admins] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isAdmin: true } }),
  ]);

  const text =
    `${ce("stats")} <b>Admin boshqaruvi</b>\n\n` +
    `Ownerlar: <b>${config.ownerIds.length}</b>\n` +
    `Qo'shimcha adminlar: <b>${admins}</b>\n` +
    `Bot foydalanuvchilari: <b>${users}</b>\n\n` +
    `Admin qo'shish usulini tanlang:`;

  const markup = kb(
    [
      ibtn("ID orqali", "adm:add:id", "primary", BE.star),
      ibtn("Username orqali", "adm:add:username", "primary", BE.users),
    ],
    [
      ibtn("Tanlash", "adm:pick:0", "success", BE.list),
      ibtn("Telegramdan tanlash", "adm:telegram", "success", BE.check),
    ],
    [ibtn("Adminlar ro'yxati", "adm:list:0", "primary", BE.menu)],
    [ibtn("Menyuga qaytish", "adm:close", undefined, BE.backMenu)]
  );

  if (edit) {
    await ctx.editMessageText(text, { reply_markup: markup }).catch(async () => {
      await ctx.reply(text, { reply_markup: markup });
    });
    return;
  }
  await ctx.reply(text, { reply_markup: markup });
}

adminsHandler.hears(ADMIN_MENU_TEXT, async (ctx) => {
  if (!isOwner(ctx.from?.id)) return;
  clearAdminAction(ctx);
  await renderAdminMenu(ctx);
});

adminsHandler.callbackQuery("adm:close", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.deleteMessage().catch(() => {});
  await ctx.reply("Admin panel:", {
    reply_markup: adminMenuKeyboard(isOwner(ctx.from.id)),
  });
});

adminsHandler.callbackQuery("adm:menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  clearAdminAction(ctx);
  await renderAdminMenu(ctx, true);
});

adminsHandler.callbackQuery("adm:add:id", async (ctx) => {
  if (!isOwner(ctx.from.id)) {
    await ctx.answerCallbackQuery({ text: "Faqat owner uchun.", show_alert: true });
    return;
  }
  setAdminAction(ctx, "addById");
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `${ce("star")} Admin qilinadigan foydalanuvchi <b>Telegram ID</b>sini yuboring.\n` +
      `Masalan: <code>123456789</code>`
  );
});

adminsHandler.callbackQuery("adm:add:username", async (ctx) => {
  if (!isOwner(ctx.from.id)) {
    await ctx.answerCallbackQuery({ text: "Faqat owner uchun.", show_alert: true });
    return;
  }
  setAdminAction(ctx, "addByUsername");
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `${ce("stats")} Admin qilinadigan foydalanuvchi <b>username</b>ini yuboring.\n` +
      `Masalan: <code>@username</code>\n\n` +
      `Eslatma: username orqali faqat botga oldin kirgan foydalanuvchilar topiladi.`
  );
});

adminsHandler.callbackQuery("adm:telegram", async (ctx) => {
  if (!isOwner(ctx.from.id)) {
    await ctx.answerCallbackQuery({ text: "Faqat owner uchun.", show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery();

  const keyboard = new Keyboard()
    .requestUsers(rbtn("Foydalanuvchini tanlash", undefined, BE.users), REQUEST_USERS, {
      user_is_bot: false,
      max_quantity: 10,
      request_name: true,
      request_username: true,
    })
    .row()
    .text(BACK_TEXT, { icon_custom_emoji_id: BE.home })
    .resized()
    .oneTime();

  await ctx.reply(
    `${ce("stats")} Telegram ro'yxatidan foydalanuvchini tanlang.`,
    { reply_markup: keyboard }
  );
});

adminsHandler.hears(BACK_TEXT, async (ctx) => {
  if (!isOwner(ctx.from?.id)) return;
  clearAdminAction(ctx);
  await ctx.reply("Admin boshqaruvi:", { reply_markup: { remove_keyboard: true } });
  await renderAdminMenu(ctx);
});

adminsHandler.on("message:users_shared", async (ctx) => {
  if (!isOwner(ctx.from.id)) return;
  const shared = ctx.message.users_shared;
  if (shared.request_id !== REQUEST_USERS) return;

  const added: string[] = [];
  for (const user of shared.users) {
    const saved = await grantAdmin(BigInt(user.user_id), {
      firstName: user.first_name ?? null,
      username: user.username ?? null,
    });
    added.push(userLabel(saved));
  }

  await ctx.reply(
    `${ce("check")} <b>Admin qo'shildi:</b>\n\n${added.map(e.escapeHtml).join("\n")}`,
    { reply_markup: { remove_keyboard: true } }
  );
  await renderAdminMenu(ctx);
});

adminsHandler.callbackQuery(/^adm:pick:(\d+)$/, async (ctx) => {
  if (!isOwner(ctx.from.id)) {
    await ctx.answerCallbackQuery({ text: "Faqat owner uchun.", show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery();

  const page = Number(ctx.match[1]);
  const total = await prisma.user.count();
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    skip: page * PAGE,
    take: PAGE,
  });

  if (users.length === 0) {
    await ctx.editMessageText("Foydalanuvchilar hali yo'q.", {
      reply_markup: kb([ibtn("Orqaga", "adm:menu", undefined, BE.home)]),
    }).catch(() => {});
    return;
  }

  const rows = users.map((user) => [
    ibtn(
      userLabel(user).slice(0, 60),
      user.isAdmin ? `adm:remove:${user.id}` : `adm:pickadd:${user.id}`,
      user.isAdmin ? "danger" : "success",
      user.isAdmin ? BE.users : BE.check
    ),
  ]);

  const pages = Math.ceil(total / PAGE);
  const nav = [];
  if (page > 0) nav.push(ibtn("⬅️", `adm:pick:${page - 1}`));
  nav.push(ibtn(`${page + 1}/${pages}`, "adm:noop"));
  if (page < pages - 1) nav.push(ibtn("➡️", `adm:pick:${page + 1}`));
  rows.push(nav);
  rows.push([ibtn("Orqaga", "adm:menu", undefined, BE.home)]);

  await ctx.editMessageText(
    `${ce("list")} <b>Foydalanuvchini tanlang</b>\n\n` +
      `👤 bosilsa admin qilinadi, 👑 bosilsa adminlik olinadi.`,
    { reply_markup: kb(...rows) }
  ).catch(() => {});
});

adminsHandler.callbackQuery(/^adm:list:(\d+)$/, async (ctx) => {
  if (!isOwner(ctx.from.id)) {
    await ctx.answerCallbackQuery({ text: "Faqat owner uchun.", show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery();

  const page = Number(ctx.match[1]);
  const total = await prisma.user.count({ where: { isAdmin: true } });
  const admins = await prisma.user.findMany({
    where: { isAdmin: true },
    orderBy: { createdAt: "desc" },
    skip: page * PAGE,
    take: PAGE,
  });

  const rows = admins.map((user) => [
    ibtn(
      `${isOwnerId(user.id) ? "👑 Owner" : "🗑"} ${userLabel(user)}`.slice(0, 60),
      isOwnerId(user.id) ? "adm:noop" : `adm:remove:${user.id}`,
      isOwnerId(user.id) ? "primary" : "danger",
      BE.users
    ),
  ]);

  const ownerLines = config.ownerIds
    .map((id) => `👑 Owner: <code>${id}</code>`)
    .join("\n");
  const adminLines = admins
    .map((user) => `• ${e.escapeHtml(userLabel(user))}`)
    .join("\n");

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const nav = [];
  if (page > 0) nav.push(ibtn("⬅️", `adm:list:${page - 1}`));
  nav.push(ibtn(`${page + 1}/${pages}`, "adm:noop"));
  if (page < pages - 1) nav.push(ibtn("➡️", `adm:list:${page + 1}`));
  rows.push(nav);
  rows.push([ibtn("Orqaga", "adm:menu", undefined, BE.home)]);

  await ctx.editMessageText(
    `${ce("stats")} <b>Adminlar ro'yxati</b>\n\n` +
      `${ownerLines || "Owner yo'q"}\n` +
      (adminLines ? `\n${adminLines}` : ""),
    { reply_markup: kb(...rows) }
  ).catch(() => {});
});

adminsHandler.callbackQuery(/^adm:pickadd:(\d+)$/, async (ctx) => {
  if (!isOwner(ctx.from.id)) {
    await ctx.answerCallbackQuery({ text: "Faqat owner uchun.", show_alert: true });
    return;
  }
  const id = BigInt(ctx.match[1]);
  const user = await grantAdmin(id);
  await ctx.answerCallbackQuery({ text: "Admin qo'shildi." });
  await ctx.reply(`${ce("check")} Admin qilindi: <b>${e.escapeHtml(userLabel(user))}</b>`);
});

adminsHandler.callbackQuery(/^adm:remove:(\d+)$/, async (ctx) => {
  if (!isOwner(ctx.from.id)) {
    await ctx.answerCallbackQuery({ text: "Faqat owner uchun.", show_alert: true });
    return;
  }
  const id = BigInt(ctx.match[1]);
  const ok = await revokeAdmin(id);
  await ctx.answerCallbackQuery({
    text: ok ? "Adminlik olindi." : "Ownerni o'chirib bo'lmaydi.",
    show_alert: !ok,
  });
  if (ok) await ctx.reply(`${ce("check")} <code>${id}</code> adminlikdan olindi.`);
});

adminsHandler.callbackQuery("adm:noop", (ctx) => ctx.answerCallbackQuery());

adminsHandler.on("message:text", async (ctx, next) => {
  if (!isOwner(ctx.from.id)) return next();
  const action = adminAction(ctx);
  if (!action) return next();

  const text = ctx.message.text.trim();
  if (text.startsWith("/")) {
    clearAdminAction(ctx);
    return next();
  }

  if (action === "addById") {
    if (!/^\d+$/.test(text)) {
      await ctx.reply("❌ ID faqat raqam bo'lishi kerak.");
      return;
    }

    const user = await grantAdmin(BigInt(text));
    clearAdminAction(ctx);
    await ctx.reply(`${ce("check")} Admin qo'shildi: <b>${e.escapeHtml(userLabel(user))}</b>`);
    await renderAdminMenu(ctx);
    return;
  }

  const username = text.replace(/^@/, "").trim();
  if (!username) {
    await ctx.reply("❌ Username bo'sh bo'lmasin.");
    return;
  }

  const user = await prisma.user.findFirst({
    where: { username: { equals: username, mode: "insensitive" } },
  });

  if (!user) {
    await ctx.reply(
      `❌ <b>@${e.escapeHtml(username)}</b> bot foydalanuvchilari ichidan topilmadi.\n` +
        `Avval u botga /start bosgan bo'lishi kerak yoki ID orqali qo'shing.`
    );
    return;
  }

  const saved = await grantAdmin(user.id);
  clearAdminAction(ctx);
  await ctx.reply(`${ce("check")} Admin qo'shildi: <b>${e.escapeHtml(userLabel(saved))}</b>`);
  await renderAdminMenu(ctx);
});
