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

export function clearSettingsCache(): void {
  cache.clear();
}

export const KEYS = {
  forceSubEnabled:  "force_sub_enabled",
  movieBtnText:     "movie_btn_text",
  movieBtnUrl:      "movie_btn_url",
  movieBtnStyle:    "movie_btn_style",
  serialBtnText:    "serial_btn_text",
  serialBtnUrl:     "serial_btn_url",
  serialBtnStyle:   "serial_btn_style",
  subCheckBtnText:  "sub_check_btn_text",
  subCheckBtnStyle: "sub_check_btn_style",
  subChannelBtnLabel: "sub_channel_btn_label",
  movieBtnEnabled:  "movie_btn_enabled",
  serialBtnEnabled: "serial_btn_enabled",
} as const;

export async function getGlobalButton(prefix: "movie" | "serial") {
  const textKey  = prefix === "movie" ? KEYS.movieBtnText  : KEYS.serialBtnText;
  const urlKey   = prefix === "movie" ? KEYS.movieBtnUrl   : KEYS.serialBtnUrl;
  const styleKey = prefix === "movie" ? KEYS.movieBtnStyle : KEYS.serialBtnStyle;
  const [text, url, style] = await Promise.all([
    getSetting(textKey),
    getSetting(urlKey),
    getSetting(styleKey, "primary"),
  ]);
  return {
    buttonText:  text  || null,
    buttonUrl:   url   || null,
    buttonStyle: style || "primary",
  };
}
