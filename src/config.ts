import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`❌ .env da ${name} topilmadi`);
  return v;
}

export const config = {
  botToken: required("BOT_TOKEN"),
  adminIds: (process.env.ADMIN_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => BigInt(s)),
  // Maxfiy baza kanal (kinolar shu yerda saqlanadi). Bo'sh bo'lsa file_id baribir saqlanadi.
  baseChannelId: process.env.BASE_CHANNEL_ID
    ? Number(process.env.BASE_CHANNEL_ID)
    : null,
  usePremiumEmoji: (process.env.USE_PREMIUM_EMOJI ?? "true") === "true",
};

export function isAdmin(userId?: number | bigint): boolean {
  if (userId === undefined) return false;
  return config.adminIds.includes(BigInt(userId));
}
