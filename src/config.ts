import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`❌ .env da ${name} topilmadi`);
  return v;
}

export const config = {
  botToken: required("BOT_TOKEN"),
  ownerIds: (process.env.ADMIN_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => BigInt(s)),
  baseChannelId: process.env.BASE_CHANNEL_ID
    ? Number(process.env.BASE_CHANNEL_ID)
    : null,
  usePremiumEmoji: (process.env.USE_PREMIUM_EMOJI ?? "true") === "true",
};

// Dinamik admin Set — ownerlar + DB'dan yuklangan qo'shimcha adminlar
export const adminIds = new Set<bigint>(config.ownerIds);

export function isOwner(userId?: number | bigint): boolean {
  if (!userId || config.ownerIds.length === 0) return false;
  return config.ownerIds[0] === BigInt(userId);
}

export function isAdmin(userId?: number | bigint): boolean {
  if (!userId) return false;
  return adminIds.has(BigInt(userId));
}

export function addAdminId(id: bigint): void {
  adminIds.add(id);
}

export function removeAdminId(id: bigint): void {
  if (!config.ownerIds.includes(id)) adminIds.delete(id);
}
