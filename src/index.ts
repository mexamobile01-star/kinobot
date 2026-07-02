import { createServer } from "node:http";
import { run } from "@grammyjs/runner";
import { webhookCallback } from "grammy";
import { bot } from "./bot.js";
import { prisma } from "./prisma.js";
import { addAdminId, config } from "./config.js";
import { trackUser } from "./middlewares/user.js";

import { adminHandler } from "./handlers/admin/index.js";
import { startHandler } from "./handlers/start.js";
import { serialViewHandler } from "./handlers/serialView.js";
import { searchHandler } from "./handlers/search.js";
import { inlineHandler } from "./handlers/inline.js";
import { referralHandler } from "./handlers/referral.js";
import { startAutoBackup } from "./services/autoBackup.js";

// ===== Middleware: foydalanuvchini bazaga yozish =====
bot.use(trackUser);

// ===== "So'rovli" kanallar uchun join so'rovini kuzatish va tasdiqlash =====
bot.on("chat_join_request", async (ctx) => {
  const chatId = ctx.chatJoinRequest.chat.id;
  const userId = ctx.chatJoinRequest.from.id;

  // DB'da kanal mavjudligini tekshirish
  const known = await prisma.channel.findUnique({ where: { chatId: BigInt(chatId) } });
  if (!known) return;

  // So'rovni bazaga yozish (yoki mavjud bo'lsa yangilash)
  await prisma.joinRequest.upsert({
    where: { channelId_userId: { channelId: BigInt(chatId), userId: BigInt(userId) } },
    create: {
      channelId: BigInt(chatId),
      userId:    BigInt(userId),
      firstName: ctx.chatJoinRequest.from.first_name ?? null,
      username:  ctx.chatJoinRequest.from.username ?? null,
      status:    "pending",
    },
    update: { status: "pending", date: new Date() },
  }).catch(() => null);

  // Avtomatik tasdiqlash YO'Q — admin joinStats orqali qabul qiladi
});

// ===== Foydalanuvchi kanaldan chiqsa — so'rov yozuvini o'chirish =====
// (Keyingi kirish uchun qaytadan so'rov yubora olsin)
bot.on("chat_member", async (ctx) => {
  const update = ctx.chatMember;
  if (!update) return;
  const newStatus = update.new_chat_member.status;
  const oldStatus = update.old_chat_member.status;
  const userId    = update.new_chat_member.user.id;
  const chatId    = update.chat.id;

  // A'zolikdan chiqqan yoki chiqarib yuborilgan
  const leftStatuses = ["left", "kicked"];
  const wasIn = !leftStatuses.includes(oldStatus);
  const nowOut = leftStatuses.includes(newStatus);
  if (!wasIn || !nowOut) return;

  // Shu kanal REQUEST turida bo'lsa — so'rov yozuvini o'chiramiz
  const ch = await prisma.channel.findUnique({ where: { chatId: BigInt(chatId) } });
  if (ch?.type === "REQUEST") {
    await prisma.joinRequest.deleteMany({
      where: { channelId: BigInt(chatId), userId: BigInt(userId) },
    }).catch(() => null);
  }
});

// ===== Handler'lar (tartib muhim!) =====
bot.use(adminHandler);      // admin panel (faqat adminlar)
bot.use(startHandler);      // /start, obuna tekshiruvi, deep-link
bot.use(referralHandler);   // referal (foydalanuvchi)
bot.use(serialViewHandler); // serial sezon/qism navigatsiya callbacklari
bot.use(inlineHandler);     // inline qidiruv
bot.use(searchHandler);     // matnli qidiruv (kod/nom) — oxirida

// ===== Xatolarni ushlash =====
bot.catch((err) => {
  console.error("🛑 Bot xatosi:", err.error);
});

// ===== Ishga tushirish =====
async function main() {
  await prisma.$connect();
  console.log("✅ DB ulandi");

  const dbAdmins = await prisma.user.findMany({
    where: { isAdmin: true },
    select: { id: true },
  });
  for (const admin of dbAdmins) addAdminId(admin.id);

  // Avtomatik backup rejalashtiruvchi
  startAutoBackup(bot);

  await bot.api.setMyCommands([
    { command: "start", description: "Botni ishga tushirish" },
  ]);

  for (const id of config.ownerIds) {
    await bot.api
      .setMyCommands(
        [
          { command: "start", description: "Bosh menyu" },
          { command: "admin", description: "Admin panel" },
        ],
        { scope: { type: "chat", chat_id: Number(id) } }
      )
      .catch(() => {});
  }

  // Bot nomini o'rnatish
  await bot.api.setMyName("🎬 Kino vaqti bot").catch(() => {});
  await bot.api.setMyDescription(
    "🎬 Kino va seriallarni kod orqali toping. Inline rejimda ham ishlaydi."
  ).catch(() => {});

  const me = await bot.api.getMe();

  // ===== WEBHOOK rejimi (Cloud Run / server) =====
  const webhookUrl = process.env.WEBHOOK_URL;
  const useWebhook = process.env.USE_WEBHOOK === "true" || !!webhookUrl;

  if (useWebhook) {
    const port = Number(process.env.PORT ?? 8080);
    const secret = process.env.WEBHOOK_SECRET ?? "kinobot-secret";

    if (!webhookUrl) throw new Error("WEBHOOK_URL .env da ko'rsatilmagan!");

    await bot.api.setWebhook(webhookUrl, {
      secret_token: secret,
      allowed_updates: ["message", "callback_query", "inline_query", "chat_join_request", "chat_member"],
    });

    const handle = webhookCallback(bot, "http", {
      secretToken: secret,
    });

    createServer(handle).listen(port, () => {
      console.log(`🌐 @${me.username} webhook rejimda: port ${port}`);
      console.log(`🔗 Webhook URL: ${webhookUrl}`);
    });
  } else {
    // ===== POLLING rejimi (lokal ishlatish) =====
    await bot.api.deleteWebhook();
    console.log(`🤖 @${me.username} polling rejimda ishga tushdi`);
    run(bot);
  }
}

main().catch((e) => {
  console.error("Ishga tushirishda xato:", e);
  process.exit(1);
});

// ===== Foydalanuvchi so'rovnomaga javob berish =====
bot.callbackQuery(/^svr:ans:(\d+):(\d+)$/, async (ctx) => {
  const surveyId = Number(ctx.match[1]);
  const optionId = Number(ctx.match[2]);
  const userId   = BigInt(ctx.from.id);

  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: { options: { where: { id: optionId } } },
  });
  if (!survey || !survey.options.length) {
    await ctx.answerCallbackQuery({ text: "So'rovnoma topilmadi.", show_alert: true });
    return;
  }
  const option = survey.options[0];

  const existing = await prisma.surveyResponse.findUnique({
    where: { surveyId_userId: { surveyId, userId } },
  });
  if (existing) {
    await ctx.answerCallbackQuery({ text: "Siz allaqachon javob bergansiz!", show_alert: true });
    return;
  }

  await prisma.surveyResponse.create({ data: { surveyId, optionId, userId } }).catch(() => null);

  if (survey.isRegionSurvey) {
    await prisma.user.update({ where: { id: userId }, data: { region: option.text } }).catch(() => null);
  }

  await ctx.answerCallbackQuery({ text: `✅ Javobingiz qabul qilindi: ${option.text}` });
  await ctx.editMessageText(
    `${survey.question}\n\n✅ <b>Javobingiz:</b> ${option.text}`
  ).catch(() => {});
});

// Graceful shutdown
const stop = async () => {
  await prisma.$disconnect();
  process.exit(0);
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
