import { createServer } from "node:http";
import { run } from "@grammyjs/runner";
import { webhookCallback } from "grammy";
import { bot } from "./bot.js";
import { prisma } from "./prisma.js";
import { config } from "./config.js";
import { trackUser } from "./middlewares/user.js";

import { adminHandler } from "./handlers/admin/index.js";
import { startHandler } from "./handlers/start.js";
import { serialViewHandler } from "./handlers/serialView.js";
import { searchHandler } from "./handlers/search.js";
import { inlineHandler } from "./handlers/inline.js";

// ===== Middleware: foydalanuvchini bazaga yozish =====
bot.use(trackUser);

// ===== "So'rovli" kanallar uchun join so'rovini avtomatik tasdiqlash =====
bot.on("chat_join_request", async (ctx) => {
  const chatId = ctx.chatJoinRequest.chat.id;
  const known = await prisma.channel.findUnique({
    where: { chatId: BigInt(chatId) },
  });
  if (known) {
    await ctx.approveChatJoinRequest(ctx.chatJoinRequest.from.id).catch(() => {});
  }
});

// ===== Handler'lar (tartib muhim!) =====
bot.use(adminHandler);      // admin panel (faqat adminlar)
bot.use(startHandler);      // /start, /help, obuna tekshiruvi
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

  await bot.api.setMyCommands([
    { command: "start", description: "Botni ishga tushirish" },
    { command: "help", description: "Yordam" },
  ]);

  for (const id of config.adminIds) {
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
      allowed_updates: ["message", "callback_query", "inline_query", "chat_join_request"],
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

// Graceful shutdown
const stop = async () => {
  await prisma.$disconnect();
  process.exit(0);
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
