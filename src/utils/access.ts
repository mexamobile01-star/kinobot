import { prisma } from "../prisma.js";
import { isAdmin } from "../config.js";
import { ensureSubscribed } from "./subscription.js";
import { getBool, getSetting, KEYS } from "./settings.js";
import { isPremiumActive, premiumEnabled, getFreeLimits } from "./premium.js";
import { sendPremiumPrompt } from "../handlers/premiumUser.js";
import type { MyContext } from "../types.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Kontentga ruxsatni tekshiradi.
 * - Admin → har doim ruxsat.
 * - Premium foydalanuvchi → ruxsat, majburiy obuna va limit YO'Q.
 * - Aks holda: majburiy obuna → keyin bepul limit (so'rov soni / vaqt).
 * `count=true` bo'lsa so'rov hisoblanadi (haqiqiy kontent yetkazishda).
 * false qaytsa — bloklovchi xabar allaqachon ko'rsatilgan.
 */
export async function checkContentAccess(ctx: MyContext, count = true): Promise<boolean> {
  const uid = ctx.from!.id;
  if (isAdmin(uid)) return true;

  const user = await prisma.user.findUnique({ where: { id: BigInt(uid) } });

  // Premium — obunasiz va limitsiz
  if (isPremiumActive(user?.premiumUntil)) return true;

  // Majburiy obuna
  const forceSub = await getBool(KEYS.forceSubEnabled, true);
  if (forceSub) {
    const ok = await ensureSubscribed(ctx, uid);
    if (!ok) return false;
  }

  // Premium/limit tizimi o'chirilgan — cheklovsiz
  if (!(await premiumEnabled())) return true;

  const { requests: freeReq, days: freeDays } = await getFreeLimits();

  // Vaqt cheklovi
  if (freeDays > 0 && user?.firstRequestAt) {
    if (Date.now() - user.firstRequestAt.getTime() > freeDays * DAY_MS) {
      await sendPremiumPrompt(ctx, "⏳ Bepul foydalanish muddati tugadi.");
      return false;
    }
  }

  // So'rov soni cheklovi
  if (freeReq > 0 && (user?.requestCount ?? 0) >= freeReq) {
    await sendPremiumPrompt(ctx, "🔒 Bepul so'rovlar soni tugadi.");
    return false;
  }

  // So'rovni hisoblash
  if (count) {
    await prisma.user.update({
      where: { id: BigInt(uid) },
      data: {
        requestCount: { increment: 1 },
        ...(user?.firstRequestAt ? {} : { firstRequestAt: new Date() }),
      },
    }).catch(() => null);
  }

  return true;
}

/**
 * AI xizmatiga ruxsat (premium funksiya).
 * - Admin/premium → cheksiz.
 * - Aks holda: premium tizimi + freeAiLimit>0 bo'lsa kunlik AI limiti (kun o'zgarsa reset).
 * `count=true` bo'lsa AI so'rovi hisoblanadi. false qaytsa — premium taklifi ko'rsatilgan.
 */
export async function checkAiAccess(ctx: MyContext, count = true): Promise<boolean> {
  const uid = ctx.from!.id;
  if (isAdmin(uid)) return true;

  const user = await prisma.user.findUnique({ where: { id: BigInt(uid) } });
  if (isPremiumActive(user?.premiumUntil)) return true;

  if (!(await premiumEnabled())) return true;

  const limit = parseInt(await getSetting(KEYS.freeAiLimit, "0"), 10) || 0;
  if (limit <= 0) return true; // AI limiti o'chirilgan — cheklovsiz

  const day = today();
  const usedToday = user?.aiRequestDay === day ? (user?.aiRequestCount ?? 0) : 0;

  if (usedToday >= limit) {
    await sendPremiumPrompt(ctx, `🤖 Bugungi bepul AI so'rovlaringiz (${limit} ta) tugadi. Premium bilan cheksiz!`);
    return false;
  }

  if (count) {
    await prisma.user.update({
      where: { id: BigInt(uid) },
      data:
        user?.aiRequestDay === day
          ? { aiRequestCount: { increment: 1 } }
          : { aiRequestDay: day, aiRequestCount: 1 },
    }).catch(() => null);
  }

  return true;
}
