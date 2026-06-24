import { Bot, session } from "grammy";
import { conversations } from "@grammyjs/conversations";
import { config } from "./config.js";
import type { MyContext, SessionData } from "./types.js";

export const bot = new Bot<MyContext>(config.botToken);

// Sessiya (conversations uchun shart)
bot.use(
  session({
    initial: (): SessionData => ({}),
  })
);

// Conversations plugin
bot.use(conversations());

// Barcha javoblar uchun standart parse_mode = HTML (custom emoji uchun kerak)
bot.api.config.use((prev, method, payload, signal) => {
  if (
    [
      "sendMessage",
      "editMessageText",
      "sendPhoto",
      "sendVideo",
      "sendDocument",
      "copyMessage",
    ].includes(method) &&
    payload &&
    !("parse_mode" in payload)
  ) {
    // @ts-expect-error — parse_mode'ni standart qo'shamiz
    payload.parse_mode = "HTML";
  }
  return prev(method, payload, signal);
});
