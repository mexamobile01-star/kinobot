import { prisma } from "../prisma.js";
import { contentButtonMarkup } from "../utils/contentButton.js";
import { getGlobalButton, getBool, KEYS } from "../utils/settings.js";
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
}
