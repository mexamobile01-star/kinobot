import { InlineKeyboard } from "grammy";
import { prisma } from "../prisma.js";
import { ce } from "./emoji.js";
import { getSetting, KEYS } from "./settings.js";
import type { MyContext } from "../types.js";
import type { Channel } from "@prisma/client";

const SUBSCRIBED_STATUSES = ["creator", "administrator", "member", "restricted"];

/** Foydalanuvchi a'zo bo'lmagan (yoki so'rov yubormagan) kanallarni qaytaradi */
export async function getUnsubscribedChannels(
  ctx: MyContext,
  userId: number
): Promise<Channel[]> {
  const channels = await prisma.channel.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  if (channels.length === 0) return [];

  const results = await Promise.all(
    channels.map(async (ch) => {
      // Instagram: API orqali tekshirib bo'lmaydi — har doim ko'rsatiladi
      if (ch.type === "INSTAGRAM") return { channel: ch, isSubscribed: false };

      // Avval Telegram membershipni tekshirish
      const member = await ctx.api
        .getChatMember(Number(ch.chatId), userId)
        .catch(() => null);

      if (member && SUBSCRIBED_STATUSES.includes(member.status)) {
        return { channel: ch, isSubscribed: true };
      }

      // So'rovli kanal: a'zo bo'lmasa ham PENDING so'rov yuborganini tekshirish.
      // "approved" holat hisobga olinmaydi — chunki tasdiqlangandan keyin kanaldan
      // chiqib ketgan bo'lishi mumkin, bunday holda qayta so'rov talab qilinadi.
      if (ch.type === "REQUEST") {
        const pending = await prisma.joinRequest.findUnique({
          where: {
            channelId_userId: {
              channelId: ch.chatId,
              userId: BigInt(userId),
            },
          },
        });
        if (pending?.status === "pending") return { channel: ch, isSubscribed: true };
      }

      return { channel: ch, isSubscribed: false };
    })
  );

  return results.filter((r) => !r.isSubscribed).map((r) => r.channel);
}

/** Obuna so'rovi xabarini yuboradi */
export async function sendSubscriptionPrompt(
  ctx: MyContext,
  channels: Channel[]
): Promise<void> {
  const checkText  = await getSetting(KEYS.subCheckBtnText,    "✅ Tekshirish");
  const checkStyle = await getSetting(KEYS.subCheckBtnStyle,   "success");
  const defLabel   = await getSetting(KEYS.subChannelBtnLabel, "+ Kanalga obuna bo'lish");

  const kb = new InlineKeyboard();
  for (const ch of channels) {
    const url = channelUrl(ch);
    if (!url) continue;
    const label = ch.buttonLabel?.trim() ||
      (ch.type === "INSTAGRAM" ? `📸 ${ch.title}` : defLabel);
    kb.url(label, url).row();
  }

  const hasTg = channels.some((c) => c.type !== "INSTAGRAM");
  if (hasTg) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (kb as any).inline_keyboard.push([{
      text: checkText,
      callback_data: "sub:check",
      style: checkStyle,
      icon_custom_emoji_id: "5861665979968262792",
    }]);
  }

  await ctx.reply(
    `<b>Botdan foydalanish uchun obuna bo'ling:</b>`,
    { reply_markup: kb }
  );
}

export function channelUrl(ch: Channel): string | null {
  if (ch.type === "INSTAGRAM") return ch.inviteLink ?? null;
  if (ch.username) return `https://t.me/${ch.username.replace(/^@/, "")}`;
  if (ch.inviteLink) return ch.inviteLink;
  return null;
}

/** True qaytarsa — foydalanuvchi hamma Telegram kanalga a'zo (yoki kanal yo'q) */
export async function ensureSubscribed(
  ctx: MyContext,
  userId: number
): Promise<boolean> {
  const notJoined = await getUnsubscribedChannels(ctx, userId);
  // Instagram kanallarini obunasiz ham o'tkazib yuboramiz (tekshirish imkonsiz)
  const blocking = notJoined.filter((c) => c.type !== "INSTAGRAM");
  if (blocking.length === 0) return true;
  await sendSubscriptionPrompt(ctx, notJoined);
  return false;
}
