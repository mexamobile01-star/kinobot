import { Composer } from "grammy";
import { createConversation } from "@grammyjs/conversations";
import { isAdmin, isOwner } from "../../config.js";
import { ce } from "../../utils/emoji.js";
import { adminMenuKeyboard } from "../../utils/keyboard.js";
import type { MyContext } from "../../types.js";

import { statisticsHandler } from "./statistics.js";
import { channelsHandler } from "./channels.js";
import { moviesHandler, addMovie } from "./movies.js";
import { serialsHandler, addSerial, addEpisode } from "./serials.js";
import { broadcastHandler } from "./broadcast.js";
import { backupHandler } from "./backup.js";
import { adminsHandler } from "./admins.js";
import { joinStatsHandler } from "./joinStats.js";

// Faqat adminlar uchun
export const adminHandler = new Composer<MyContext>();
const admin = adminHandler.filter((ctx) => isAdmin(ctx.from?.id));

// Conversation'larni ro'yxatdan o'tkazish
admin.use(createConversation(addMovie, "addMovie"));
admin.use(createConversation(addSerial, "addSerial"));
admin.use(createConversation(addEpisode, "addEpisode"));

// /admin buyrug'i
admin.command("admin", async (ctx) => {
  await ctx.reply(`${ce("settings")} <b>Admin panel</b>`, {
    reply_markup: adminMenuKeyboard(isOwner(ctx.from?.id)),
  });
});

// Bo'limlar
admin.use(statisticsHandler);
admin.use(channelsHandler);
admin.use(moviesHandler);
admin.use(serialsHandler);
admin.use(broadcastHandler);
admin.use(backupHandler);
admin.use(adminsHandler);
admin.use(joinStatsHandler);
