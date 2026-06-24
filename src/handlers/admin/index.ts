import { Composer } from "grammy";
import { createConversation } from "@grammyjs/conversations";
import { isAdmin } from "../../config.js";
import { ce } from "../../utils/emoji.js";
import { adminMenuKeyboard } from "../../utils/keyboard.js";
import type { MyContext } from "../../types.js";

import { statisticsHandler } from "./statistics.js";
import { channelsHandler } from "./channels.js";
import { moviesHandler, addMovie } from "./movies.js";
import { serialsHandler, addSerial, addEpisode } from "./serials.js";
import { backupHandler } from "./backup.js";

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
    reply_markup: adminMenuKeyboard(),
  });
});

// Bo'limlar
admin.use(statisticsHandler);
admin.use(channelsHandler);
admin.use(moviesHandler);
admin.use(serialsHandler);
admin.use(backupHandler);
