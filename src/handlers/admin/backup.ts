import { Composer, InputFile } from "grammy";
import { prisma } from "../../prisma.js";
import { config } from "../../config.js";
import { ADMIN_MENU_BUTTONS, ibtn, BE, kb } from "../../utils/keyboard.js";
import { clearSettingsCache } from "../../utils/settings.js";
import type { MyContext } from "../../types.js";
import type { ChannelType } from "@prisma/client";

export const backupHandler = new Composer<MyContext>();

// BigInt → string uchun replacer
const bigintReplacer = (_key: string, value: unknown) =>
  typeof value === "bigint" ? value.toString() : value;

function backupMenuWithBack() {
  return kb(
    [ibtn("📥 Backup olish",      "backup:get",     "primary", BE.backup)],
    [ibtn("📤 Backupdan tiklash", "backup:restore", "success", BE.folder)],
    [ibtn("Menyuga qaytish",      "backup:close",   undefined, BE.backMenu)],
  );
}

// ============ MENYU ============
backupHandler.hears(ADMIN_MENU_BUTTONS.backup, async (ctx) => {
  await ctx.reply(
    `<b>Backup</b>\n\nBarcha ma'lumotlarni eksport qilish yoki tiklash.`,
    { reply_markup: backupMenuWithBack() }
  );
});

backupHandler.callbackQuery("backup:close", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.deleteMessage().catch(() => {});
});

// ============ BACKUP OLISH ============
backupHandler.callbackQuery("backup:get", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Backup tayyorlanmoqda..." });

  const [movies, serials, seasons, episodes, channels, users, settings] =
    await Promise.all([
      prisma.movie.findMany(),
      prisma.serial.findMany(),
      prisma.season.findMany(),
      prisma.episode.findMany(),
      prisma.channel.findMany(),
      prisma.user.findMany(),
      prisma.setting.findMany(),
    ]);

  const data = {
    exportedAt: new Date().toISOString(),
    version: 2,
    counts: {
      movies: movies.length,
      serials: serials.length,
      seasons: seasons.length,
      episodes: episodes.length,
      channels: channels.length,
      users: users.length,
    },
    data: { movies, serials, seasons, episodes, channels, users, settings },
  };

  const json = JSON.stringify(data, bigintReplacer, 2);
  const fileName = `kinobot-backup-${new Date().toISOString().slice(0, 10)}.json`;

  await ctx.replyWithDocument(
    new InputFile(Buffer.from(json, "utf-8"), fileName),
    {
      caption:
        `<b>Backup tayyor</b>\n\n` +
        `Kinolar: <b>${movies.length}</b>\n` +
        `Seriallar: <b>${serials.length}</b> (${episodes.length} qism)\n` +
        `Kanallar: <b>${channels.length}</b>\n` +
        `Foydalanuvchilar: <b>${users.length}</b>`,
      reply_markup: backupMenuWithBack(),
    }
  );
});

// ============ TIKLASH — FAYL SO'RASH ============
backupHandler.callbackQuery("backup:restore", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.scratch = { awaitingRestore: true };
  await ctx.reply(
    `📤 <b>Backupdan tiklash</b>\n\n` +
    `Backup <b>.json</b> faylini yuboring.\n\n` +
    `⚠️ Mavjud ma'lumotlar ustiga yoziladi.`,
    { reply_markup: kb([ibtn("❌ Bekor qilish", "backup:cancel", "danger")]) }
  );
});

// ============ FAYLNI QABUL QILISH ============
backupHandler.on("message:document", async (ctx, next) => {
  if (!ctx.session.scratch?.awaitingRestore) return next();

  const doc = ctx.message.document;
  if (!doc.file_name?.endsWith(".json")) {
    await ctx.reply("❌ Faqat <b>.json</b> formatdagi fayl yuboring.");
    return;
  }

  await ctx.reply("⏳ Fayl tekshirilmoqda...");

  let backupData: Record<string, unknown>;
  try {
    const file = await ctx.api.getFile(doc.file_id);
    const url  = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
    const res  = await fetch(url);
    const text = await res.text();
    backupData = JSON.parse(text);
  } catch {
    await ctx.reply("❌ Faylni o'qib bo'lmadi. Qayta urinib ko'ring.");
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const counts = (backupData as any).counts ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(backupData as any).data) {
    await ctx.reply("❌ Bu to'g'ri backup fayli emas (version 2 kerak).");
    return;
  }

  // Faylni sessiyada saqlaymiz
  ctx.session.scratch = { restoreFileId: doc.file_id };

  await ctx.reply(
    `📦 <b>Backup mazmuni:</b>\n\n` +
    `🎬 Kinolar: <b>${counts.movies ?? 0}</b>\n` +
    `📺 Seriallar: <b>${counts.serials ?? 0}</b> (<b>${counts.episodes ?? 0}</b> qism)\n` +
    `📢 Kanallar: <b>${counts.channels ?? 0}</b>\n` +
    `👥 Foydalanuvchilar: <b>${counts.users ?? 0}</b>\n\n` +
    `⚠️ <b>Diqqat!</b> Mavjud ma'lumotlar ustiga yoziladi. Davom etasizmi?`,
    {
      reply_markup: kb(
        [ibtn("✅ Ha, tiklayman",  "backup:confirm", "success", BE.check)],
        [ibtn("❌ Bekor qilish",   "backup:cancel",  "danger")],
      ),
    }
  );
});

// ============ TASDIQLASH VA TIKLASH ============
backupHandler.callbackQuery("backup:confirm", async (ctx) => {
  const fileId = ctx.session.scratch?.restoreFileId as string | undefined;
  if (!fileId) {
    await ctx.answerCallbackQuery({ text: "Ma'lumot eskirdi. Qaytadan faylni yuboring.", show_alert: true });
    return;
  }

  ctx.session.scratch = {};
  await ctx.answerCallbackQuery({ text: "Tiklanmoqda..." });
  await ctx.editMessageText("⏳ <b>Tiklanmoqda, iltimos kuting...</b>").catch(() => {});

  try {
    const file = await ctx.api.getFile(fileId);
    const url  = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
    const res  = await fetch(url);
    const text = await res.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const backup = JSON.parse(text) as any;

    const result = await performRestore(backup.data);

    clearSettingsCache();

    await ctx.editMessageText(
      `<b>Tiklash yakunlandi!</b>\n\n` +
      `🎬 Kinolar: <b>${result.movies}</b>\n` +
      `📺 Seriallar: <b>${result.serials}</b> (<b>${result.episodes}</b> qism)\n` +
      `📢 Kanallar: <b>${result.channels}</b>\n` +
      `👥 Foydalanuvchilar: <b>${result.users}</b>`,
      { reply_markup: backupMenuWithBack() }
    ).catch(() => {});
  } catch (err) {
    await ctx.editMessageText(
      `❌ Tiklashda xato: <code>${(err as Error).message}</code>`,
      { reply_markup: backupMenuWithBack() }
    ).catch(() => {});
  }
});

// ============ BEKOR QILISH ============
backupHandler.callbackQuery("backup:cancel", async (ctx) => {
  ctx.session.scratch = {};
  await ctx.answerCallbackQuery({ text: "Bekor qilindi." });
  await ctx.editMessageText(
    `<tg-emoji emoji-id="${BE.backup}">💾</tg-emoji> <b>Backup</b>\n\nBekor qilindi.`,
    { reply_markup: backupMenuWithBack() }
  ).catch(() => {});
});

// ============ RESTORE LOGIC ============
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function performRestore(data: any) {
  let movies = 0, serials = 0, episodes = 0, channels = 0, users = 0;

  // Movies
  for (const m of data.movies ?? []) {
    await prisma.movie.upsert({
      where:  { code: m.code },
      create: {
        code: m.code, title: m.title, caption: m.caption ?? null,
        fileId: m.fileId, baseMsgId: m.baseMsgId ?? null,
        year: m.year ?? null, genre: m.genre ?? null,
        quality: m.quality ?? null, language: m.language ?? null,
        buttonText: m.buttonText ?? null, buttonUrl: m.buttonUrl ?? null,
        buttonStyle: m.buttonStyle ?? "primary", views: m.views ?? 0,
      },
      update: {
        title: m.title, caption: m.caption ?? null, fileId: m.fileId,
        baseMsgId: m.baseMsgId ?? null, year: m.year ?? null,
        genre: m.genre ?? null, quality: m.quality ?? null,
        language: m.language ?? null, buttonText: m.buttonText ?? null,
        buttonUrl: m.buttonUrl ?? null, buttonStyle: m.buttonStyle ?? "primary",
      },
    }).catch(() => null);
    movies++;
  }

  // Serials (ID mapping kerak)
  const serialIdMap: Record<number, number> = {};
  for (const s of data.serials ?? []) {
    const saved = await prisma.serial.upsert({
      where:  { code: s.code },
      create: {
        code: s.code, title: s.title, caption: s.caption ?? null,
        posterId: s.posterId ?? null, year: s.year ?? null, genre: s.genre ?? null,
        buttonText: s.buttonText ?? null, buttonUrl: s.buttonUrl ?? null,
        buttonStyle: s.buttonStyle ?? "primary", views: s.views ?? 0,
      },
      update: {
        title: s.title, caption: s.caption ?? null, posterId: s.posterId ?? null,
        year: s.year ?? null, genre: s.genre ?? null,
        buttonText: s.buttonText ?? null, buttonUrl: s.buttonUrl ?? null,
        buttonStyle: s.buttonStyle ?? "primary",
      },
    }).catch(() => null);
    if (saved) { serialIdMap[Number(s.id)] = saved.id; serials++; }
  }

  // Seasons (serial ID mapping)
  const seasonIdMap: Record<number, number> = {};
  for (const season of data.seasons ?? []) {
    const newSerialId = serialIdMap[Number(season.serialId)];
    if (!newSerialId) continue;
    const saved = await prisma.season.upsert({
      where:  { serialId_number: { serialId: newSerialId, number: season.number } },
      create: { serialId: newSerialId, number: season.number, title: season.title ?? null },
      update: { title: season.title ?? null },
    }).catch(() => null);
    if (saved) seasonIdMap[Number(season.id)] = saved.id;
  }

  // Episodes
  for (const ep of data.episodes ?? []) {
    const newSeasonId = seasonIdMap[Number(ep.seasonId)];
    if (!newSeasonId) continue;
    await prisma.episode.upsert({
      where:  { seasonId_number: { seasonId: newSeasonId, number: ep.number } },
      create: {
        seasonId: newSeasonId, number: ep.number, fileId: ep.fileId,
        title: ep.title ?? null, baseMsgId: ep.baseMsgId ?? null,
      },
      update: { fileId: ep.fileId, title: ep.title ?? null, baseMsgId: ep.baseMsgId ?? null },
    }).catch(() => null);
    episodes++;
  }

  // Channels
  for (const c of data.channels ?? []) {
    await prisma.channel.upsert({
      where:  { chatId: BigInt(c.chatId) },
      create: {
        chatId: BigInt(c.chatId), title: c.title, username: c.username ?? null,
        inviteLink: c.inviteLink ?? null, type: c.type as ChannelType,
        isActive: c.isActive ?? true, sortOrder: c.sortOrder ?? 0,
      },
      update: {
        title: c.title, username: c.username ?? null,
        inviteLink: c.inviteLink ?? null, type: c.type as ChannelType,
        isActive: c.isActive ?? true, sortOrder: c.sortOrder ?? 0,
      },
    }).catch(() => null);
    channels++;
  }

  // Settings
  for (const s of data.settings ?? []) {
    await prisma.setting.upsert({
      where:  { key: s.key },
      create: { key: s.key, value: s.value },
      update: { value: s.value },
    }).catch(() => null);
  }

  // Users
  for (const u of data.users ?? []) {
    await prisma.user.upsert({
      where:  { id: BigInt(u.id) },
      create: {
        id: BigInt(u.id), firstName: u.firstName ?? null,
        username: u.username ?? null, isBlocked: u.isBlocked ?? false,
        isAdmin: u.isAdmin ?? false,
      },
      update: {
        firstName: u.firstName ?? null, username: u.username ?? null,
        isAdmin: u.isAdmin ?? false,
      },
    }).catch(() => null);
    users++;
  }

  return { movies, serials, episodes, channels, users };
}
