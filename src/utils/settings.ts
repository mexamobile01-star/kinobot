import { prisma } from "../prisma.js";

const cache = new Map<string, string>();

export async function getSetting(key: string, def = ""): Promise<string> {
  if (cache.has(key)) return cache.get(key)!;
  const row = await prisma.setting.findUnique({ where: { key } });
  const val = row?.value ?? def;
  cache.set(key, val);
  return val;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
  cache.set(key, value);
}

export async function getBool(key: string, def = false): Promise<boolean> {
  const v = await getSetting(key, def ? "1" : "0");
  return v === "1" || v === "true";
}

export async function setBool(key: string, value: boolean): Promise<void> {
  await setSetting(key, value ? "1" : "0");
}

export const KEYS = {
  forceSubEnabled: "force_sub_enabled", // majburiy obuna yoqilgan/o'chirilgan
} as const;
