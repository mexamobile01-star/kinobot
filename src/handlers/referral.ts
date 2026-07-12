import { Composer } from "grammy";
import { getReferralCount } from "../utils/referral.js";
import { kb } from "../utils/keyboard.js";
import type { MyContext } from "../types.js";

export const referralHandler = new Composer<MyContext>();

export async function sendReferralInfo(ctx: MyContext): Promise<void> {
  const uid  = ctx.from!.id;
  const link = `https://t.me/${ctx.me.username}?start=ref_${uid}`;
  const count = await getReferralCount(uid);

  const markup = kb([
    { text: "Do'stlarga yuborish", switch_inline_query: `ref_${uid}`, icon_custom_emoji_id: "5260450573768990626" },
  ]);

  await ctx.reply(
    `<tg-emoji emoji-id="5258513401784573443">📈</tg-emoji> <b>Referal orqali pul ishlang!</b>\n\n` +
    `Do'stlaringizni taklif qiling — har bir a'zo bo'lgan do'stingiz uchun mukofot olasiz.\n\n` +
    `👥 Sizning referallaringiz: <b>${count}</b> ta\n\n` +
    `<tg-emoji emoji-id="5260730055880876557">🔗</tg-emoji> Sizning havolangiz:\n<code>${link}</code>\n\n` +
    `<i>Tugma orqali do'stlaringizga yuboring yoki havolani ulashing. Ular botga kirib kanallarga a'zo bo'lgach, referal hisoblanadi.</i>`,
    { reply_markup: markup }
  );
}

referralHandler.command("referal", sendReferralInfo);
