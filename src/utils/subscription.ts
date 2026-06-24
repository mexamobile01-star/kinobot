import { InlineKeyboard } from "grammy";
import { prisma } from "../prisma.js";
import { ce } from "./emoji.js";
import type { MyContext } from "../types.js";
import type { Channel } from "@prisma/client";

const SUBSCRIBED_STATUSES = ["creator", "administrator", "member", "restricted"];

/** Foydalanuvchi a'zo bo'lmagan kanallarni qaytaradi */
export async function getUnsubscribedChannels(
  ctx: MyContext,
  userId: number
): Promise<Channel[]> {
  const channels = await prisma.channel.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  const notJoined: Channel[] = [];

  for (const ch of channels) {
    // So'rovli (REQUEST) kanallarda getChatMember ko'pincha ishlamaydi (so'rov yuborilgan, hali a'zo emas).
    // Shu sabab REQUEST/PRIVATE uchun ham getChatMember sinab ko'ramiz, xato bo'lsa — a'zo emas deb hisoblaymiz.
    try {
      const member = await ctx.api.getChatMember(Number(ch.chatId), userId);
      if (!SUBSCRIBED_STATUSES.includes(member.status)) {
        notJoined.push(ch);
      }
    } catch {
      // Bot kanalda admin emas yoki kanal topilmadi — tekshira olmaymiz, a'zo emas deb hisoblaymiz
      notJoined.push(ch);
    }
  }

  return notJoined;
}

/** Obuna bo'lish taklifi xabarini yuboradi */
export async function sendSubscriptionPrompt(
  ctx: MyContext,
  channels: Channel[]
): Promise<void> {
  const kb = new InlineKeyboard();
  for (const ch of channels) {
    const url = channelUrl(ch);
    if (url) kb.url(`📢 ${ch.title}`, url).row();
  }
  kb.text("✅ Tekshirish", "sub:check");

  await ctx.reply(
    `${ce("fire")} <b>Botdan foydalanish uchun</b> quyidagi kanal(lar)ga a'zo bo'ling:\n\n` +
      `So'ng <b>✅ Tekshirish</b> tugmasini bosing.`,
    { reply_markup: kb }
  );
}

export function channelUrl(ch: Channel): string | null {
  if (ch.username) return `https://t.me/${ch.username.replace(/^@/, "")}`;
  if (ch.inviteLink) return ch.inviteLink;
  return null;
}

/** True qaytarsa — foydalanuvchi hamma kanalga a'zo (yoki kanal yo'q) */
export async function ensureSubscribed(
  ctx: MyContext,
  userId: number
): Promise<boolean> {
  const notJoined = await getUnsubscribedChannels(ctx, userId);
  if (notJoined.length === 0) return true;
  await sendSubscriptionPrompt(ctx, notJoined);
  return false;
}
