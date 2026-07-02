import { Composer, InlineKeyboard } from "grammy";
import { getReferralCount } from "../utils/referral.js";
import type { MyContext } from "../types.js";

export const referralHandler = new Composer<MyContext>();

referralHandler.hears("Referal / pul ishlash", async (ctx) => {
  const uid  = ctx.from!.id;
  const link = `https://t.me/${ctx.me.username}?start=ref_${uid}`;
  const count = await getReferralCount(uid);

  const shareText = encodeURIComponent(
    `🎬 Eng zo'r kinolar shu botda! Bepul ko'rish uchun kir: ${link}`
  );

  const kb = new InlineKeyboard()
    .url("📤 Do'stlarga yuborish", `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${shareText}`);

  await ctx.reply(
    `<tg-emoji emoji-id="5258513401784573443">📈</tg-emoji> <b>Referal orqali pul ishlang!</b>\n\n` +
    `Do'stlaringizni taklif qiling — har bir a'zo bo'lgan do'stingiz uchun mukofot olasiz.\n\n` +
    `👥 Sizning referallaringiz: <b>${count}</b> ta\n\n` +
    `🔗 Sizning havolangiz:\n<code>${link}</code>\n\n` +
    `<i>Havolani do'stlaringizga yuboring. Ular botga kirib kanallarga a'zo bo'lgach, referal hisoblanadi.</i>`,
    { reply_markup: kb }
  );
});
