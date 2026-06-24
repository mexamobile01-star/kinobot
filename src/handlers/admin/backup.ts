import { Composer, InputFile } from "grammy";
import { prisma } from "../../prisma.js";
import { ce } from "../../utils/emoji.js";
import type { MyContext } from "../../types.js";

export const backupHandler = new Composer<MyContext>();

backupHandler.hears("💾 Backup", async (ctx) => {
  await ctx.reply("⏳ Backup tayyorlanmoqda...");

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
    version: 1,
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

  // BigInt'lar prisma.ts dagi toJSON patch tufayli string sifatida yoziladi
  const json = JSON.stringify(data, null, 2);
  const fileName = `kinobot-backup-${new Date().toISOString().slice(0, 10)}.json`;

  await ctx.replyWithDocument(
    new InputFile(Buffer.from(json, "utf-8"), fileName),
    {
      caption:
        `${ce("check")} <b>Backup tayyor</b>\n\n` +
        `🎬 Kinolar: ${movies.length}\n` +
        `📺 Seriallar: ${serials.length} (${episodes.length} qism)\n` +
        `📢 Kanallar: ${channels.length}\n` +
        `👥 Foydalanuvchilar: ${users.length}`,
    }
  );
});

// Yangilash tugmasi — admin menyusini qayta chiqaradi
backupHandler.hears("🔄 Yangilash", async (ctx) => {
  const { adminMenuKeyboard } = await import("../../utils/keyboard.js");
  await ctx.reply(`${ce("settings")} Menyu yangilandi.`, {
    reply_markup: adminMenuKeyboard(),
  });
});
