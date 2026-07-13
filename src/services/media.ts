import { prisma } from "../prisma.js";
import { contentButtonRow, contentButtonMarkup } from "../utils/contentButton.js";
import { getGlobalButton, getBool, getSetting, KEYS } from "../utils/settings.js";
import { movieChannelCaption } from "./movieChannel.js";
import type { MyContext } from "../types.js";
import type { Movie } from "@prisma/client";

/** Kino caption — kanal posti bilan bir xil premium emojili format */
export function movieCaption(m: Movie): string {
  return movieChannelCaption(m);
}

export async function sendMovie(ctx: MyContext, movie: Movie) {
  const enabled = await getBool(KEYS.movieBtnEnabled, true);
  const globalBtn = enabled ? await getGlobalButton("movie") : null;
  await ctx.replyWithVideo(movie.fileId, {
    caption: movieCaption(movie),
    reply_markup: globalBtn ? contentButtonMarkup(globalBtn) : undefined,
  });
  await prisma.movie.update({
    where: { id: movie.id },
    data: { views: { increment: 1 } },
  });
  await sendPostDeliveryMessage(ctx);
}

/** Kino yuborilgandan keyin qo'shimcha reklama/post xabari (admin sozlaydi, o'chirib/yoqib qo'yiladi) */
async function sendPostDeliveryMessage(ctx: MyContext): Promise<void> {
  const on = await getBool(KEYS.postDeliveryEnabled, false);
  if (!on) return;
  const text = await getSetting(KEYS.postDeliveryText, "");
  if (!text.trim()) return;

  const btnText  = await getSetting(KEYS.postDeliveryBtnText, "");
  const btnUrl   = await getSetting(KEYS.postDeliveryBtnUrl, "");
  const btnStyle = await getSetting(KEYS.postDeliveryBtnStyle, "primary");
  const row = contentButtonRow({ buttonText: btnText, buttonUrl: btnUrl, buttonStyle: btnStyle });

  await ctx.reply(text, {
    reply_markup: row ? { inline_keyboard: [row] } : undefined,
  }).catch(() => {});
}
