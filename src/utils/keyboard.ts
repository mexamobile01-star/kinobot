import { InlineKeyboard, Keyboard } from "grammy";
import { isOwner, adminCan } from "../config.js";

// ===================== BOT API 9.4 — PREMIUM EMOJI TUGMALAR =====================
// style: "primary" | "success" | "danger" faqat kerak joylarda ishlatiladi.
// icon_custom_emoji_id: premium emoji tugma ichida ko'rinadi

export type BtnStyle = "primary" | "success" | "danger";

// Premium emoji IDlar — tugmalar uchun
export const BE = {
  stats:    "5258391025281408576",
  channel:  "5260268501515377807",
  movie:    "5258077307985207053",
  serial:   "5258391252914676042",
  admin:    "5258011929993026890",
  broadcast:"5258020476977946656",
  backup:   "5258200019495821936",
  subOn:    "5861665979968262792",
  subOff:   "5859494848230334025",
  chList:   "5257965174979042426",
  chAdd:    "5274008024585871702",
  chDelete: "5258130763148172425",
  backMenu: "5193202823411546657",
  editName: "5258331647358540449",
  editUrl:  "5260730055880876557",
  list:     "5210860842714688276",
  film:     "5258331647358540449",
  tv:       "4918438965029110683",
  folder:   "5260416304224936047",
  check:    "5260342697075416641",
  fire:     "5193202823411546657",
  settings: "5258509201306557640",
  home:     "5258501105293205250",
  star:     "5210771709258394044",
  menu:     "5260399854500191689",
  users:    "5258391025281408576",
  trend:    "5258513401784573443",
} as const;

export const ADMIN_MENU_BUTTONS = {
  stats: "Statistika",
  channels: "Kanal boshqaruvi",
  movies: "Kino boshqaruvi",
  serials: "Serial boshqaruvi",
  broadcast: "Xabar yuborish",
  funnel: "Funnel",
  referrals: "Referal",
  premium: "Premium",
  admins: "Admin boshqaruvi",
  backup: "Backup",
} as const;

export const ADMIN_MENU_TEXT = ADMIN_MENU_BUTTONS.admins;

/** Bot API 9.4: rangli + premium emoji'li inline tugma */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ibtn(text: string, data: string, style?: BtnStyle, emojiId?: string): any {
  return {
    text,
    callback_data: data,
    ...(style   && { style }),
    ...(emojiId && { icon_custom_emoji_id: emojiId }),
  };
}

/** Raw inline keyboard — style qo'llab-quvvatlaydi */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function kb(...rows: any[][]): any {
  return { inline_keyboard: rows };
}

export function rbtn(text: string, style?: BtnStyle, emojiId?: string) {
  return {
    text,
    ...(style && { style }),
    ...(emojiId && { icon_custom_emoji_id: emojiId }),
  };
}

// ===================== ADMIN REPLY KEYBOARD =====================
const SECTION_META: { key: string; text: string; emoji: string }[] = [
  { key: "stats",     text: ADMIN_MENU_BUTTONS.stats,     emoji: BE.stats },
  { key: "channels",  text: ADMIN_MENU_BUTTONS.channels,  emoji: BE.channel },
  { key: "movies",    text: ADMIN_MENU_BUTTONS.movies,    emoji: BE.movie },
  { key: "serials",   text: ADMIN_MENU_BUTTONS.serials,   emoji: BE.serial },
  { key: "broadcast", text: ADMIN_MENU_BUTTONS.broadcast, emoji: BE.broadcast },
  { key: "funnel",    text: ADMIN_MENU_BUTTONS.funnel,    emoji: BE.trend },
  { key: "referrals", text: ADMIN_MENU_BUTTONS.referrals, emoji: BE.users },
  { key: "premium",   text: ADMIN_MENU_BUTTONS.premium,   emoji: "5258093637450866522" },
  { key: "backup",    text: ADMIN_MENU_BUTTONS.backup,    emoji: BE.backup },
];

export function adminMenuKeyboard(userId?: number | bigint): Keyboard {
  const owner = isOwner(userId);
  const kb = new Keyboard();

  const allowed = SECTION_META.filter((s) => adminCan(userId ?? 0, s.key));

  let col = 0;
  for (const s of allowed) {
    kb.text(s.text, { icon_custom_emoji_id: s.emoji });
    if (++col % 2 === 0) kb.row();
  }
  if (col % 2 !== 0) kb.row();

  // "Admin boshqaruvi" — faqat owner
  if (owner) {
    kb.text(ADMIN_MENU_TEXT, { icon_custom_emoji_id: BE.admin }).row();
  }

  // AI yordamchi — huquqi bo'lgan barcha adminlar uchun, ko'k rangda
  if (adminCan(userId ?? 0, "ai")) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kb.text("AI yordamchi", { icon_custom_emoji_id: "5258093637450866522", style: "primary" } as any).row();
  }

  return kb.resized();
}

// ===================== FOYDALANUVCHI REPLY KEYBOARD =====================
// Reply (doimiy) klaviaturada FAQAT "AI yordamchi" qoladi — qidiruv (matn
// yozib), referal, mashhur va random kinolar endi / komandalar orqali.
export function userMenuKeyboard(): Keyboard {
  return new Keyboard()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .text("AI yordamchi", { icon_custom_emoji_id: "5258093637450866522", style: "primary" } as any)
    .resized();
}

/** AI suhbati davomida ko'rinadigan doimiy klaviatura — faqat chiqish tugmasi */
export function aiActiveKeyboard(): Keyboard {
  return new Keyboard()
    .text("❌ Chiqish")
    .resized();
}

export function cancelKeyboard(): Keyboard {
  return new Keyboard().text("❌ Bekor qilish").resized().oneTime();
}

export { InlineKeyboard, Keyboard };
