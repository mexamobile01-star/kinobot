import { InputFile } from "grammy";
import { prisma } from "../prisma.js";
import { config } from "../config.js";
import { getBool, getSetting, setSetting, KEYS } from "../utils/settings.js";
import type { Bot } from "grammy";
import type { MyContext } from "../types.js";

const bigintReplacer = (_key: string, value: unknown) =>
  typeof value === "bigint" ? value.toString() : value;

/** Backup JSON faylini tayyorlaydi */
export async function buildBackupFile(): Promise<{ file: InputFile; fileName: string; counts: Record<string, number> }> {
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

  const counts = {
    movies: movies.length, serials: serials.length, seasons: seasons.length,
    episodes: episodes.length, channels: channels.length, users: users.length,
  };

  const data = {
    exportedAt: new Date().toISOString(),
    version: 2,
    counts,
    data: { movies, serials, seasons, episodes, channels, users, settings },
  };

  const json = JSON.stringify(data, bigintReplacer, 2);
  const fileName = `kinobot-backup-${new Date().toISOString().slice(0, 10)}.json`;
  return { file: new InputFile(Buffer.from(json, "utf-8"), fileName), fileName, counts };
}

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // har soatda tekshirish

/** Avtomatik backup rejalashtiruvchi — har soatda 3 kunlik muddatni tekshiradi */
export function startAutoBackup(bot: Bot<MyContext>): void {
  const tick = async () => {
    try {
      const enabled = await getBool(KEYS.autoBackupEnabled, false);
      if (!enabled) return;

      const lastStr = await getSetting(KEYS.lastBackupAt, "");
      const last = lastStr ? Number(lastStr) : 0;
      if (Date.now() - last < THREE_DAYS_MS) return;

      const { file, counts } = await buildBackupFile();
      const owner = config.ownerIds[0];
      if (!owner) return;

      await bot.api.sendDocument(Number(owner), file, {
        caption:
          `<b>Avtomatik backup</b> (3 kunlik)\n\n` +
          `Kinolar: <b>${counts.movies}</b>\n` +
          `Seriallar: <b>${counts.serials}</b>\n` +
          `Kanallar: <b>${counts.channels}</b>\n` +
          `Foydalanuvchilar: <b>${counts.users}</b>`,
        parse_mode: "HTML",
      });

      await setSetting(KEYS.lastBackupAt, String(Date.now()));
    } catch {
      // xatolik botni to'xtatmasin
    }
  };

  // Ishga tushgach 1 daqiqadan keyin, so'ng har soatda
  setTimeout(tick, 60_000);
  setInterval(tick, CHECK_INTERVAL_MS);
}
