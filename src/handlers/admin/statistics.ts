import { Composer } from "grammy";
import { prisma } from "../../prisma.js";
import { ce, e } from "../../utils/emoji.js";
import { ADMIN_MENU_BUTTONS } from "../../utils/keyboard.js";
import type { MyContext } from "../../types.js";

export const statisticsHandler = new Composer<MyContext>();

statisticsHandler.hears(ADMIN_MENU_BUTTONS.stats, async (ctx) => {
  const [
    users,
    blocked,
    movies,
    serials,
    episodes,
    channels,
    movieViews,
    serialViews,
    topMovies,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isBlocked: true } }),
    prisma.movie.count(),
    prisma.serial.count(),
    prisma.episode.count(),
    prisma.channel.count({ where: { isActive: true } }),
    prisma.movie.aggregate({ _sum: { views: true } }),
    prisma.serial.aggregate({ _sum: { views: true } }),
    prisma.movie.findMany({
      orderBy: { views: "desc" },
      take: 5,
      select: { title: true, code: true, views: true },
    }),
  ]);

  const totalViews = (movieViews._sum.views ?? 0) + (serialViews._sum.views ?? 0);

  let top = "";
  if (topMovies.length) {
    top =
      `\n${ce("trendUp")} <b>Top kinolar:</b>\n` +
      topMovies
        .map(
          (m, i) =>
            `${i + 1}. ${e.escapeHtml(m.title)} (<code>${m.code}</code>) — ${m.views} 👁`
        )
        .join("\n");
  }

  await ctx.reply(
    `${ce("chart")} <b>Bot statistikasi</b>\n` +
      `━━━━━━━━━━━━━━━\n` +
      `${ce("stats")} Foydalanuvchilar: <b>${users}</b>\n` +
      `🚫 Bloklangan: <b>${blocked}</b>\n` +
      `${ce("film")} Kinolar: <b>${movies}</b>\n` +
      `${ce("tv")} Seriallar: <b>${serials}</b> (${episodes} qism)\n` +
      `📢 Faol kanallar: <b>${channels}</b>\n` +
      `👁 Jami ko'rishlar: <b>${totalViews}</b>\n` +
      top
  );
});
