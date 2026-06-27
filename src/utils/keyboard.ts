import { InlineKeyboard, Keyboard } from "grammy";

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
export function adminMenuKeyboard(owner = false): Keyboard {
  const kb = new Keyboard()
    .text(ADMIN_MENU_BUTTONS.stats, { icon_custom_emoji_id: BE.stats })
    .text(ADMIN_MENU_BUTTONS.channels, { icon_custom_emoji_id: BE.channel })
    .row()
    .text(ADMIN_MENU_BUTTONS.movies, { icon_custom_emoji_id: BE.movie })
    .text(ADMIN_MENU_BUTTONS.serials, { icon_custom_emoji_id: BE.serial });

  if (owner) {
    kb.row()
      .text(ADMIN_MENU_BUTTONS.broadcast, { icon_custom_emoji_id: BE.broadcast })
      .text(ADMIN_MENU_BUTTONS.funnel, { icon_custom_emoji_id: BE.trend });
    kb.row()
      .text(ADMIN_MENU_TEXT, { icon_custom_emoji_id: BE.admin });
  }

  return kb.row()
    .text(ADMIN_MENU_BUTTONS.backup, { icon_custom_emoji_id: BE.backup })
    .resized();
}

// ===================== FOYDALANUVCHI REPLY KEYBOARD =====================
export function userMenuKeyboard(): Keyboard {
  return new Keyboard()
    .text("🔎 Kino qidirish", { icon_custom_emoji_id: "5429571366384842791" })
    .resized();
}

export function cancelKeyboard(): Keyboard {
  return new Keyboard().text("❌ Bekor qilish").resized().oneTime();
}

export { InlineKeyboard, Keyboard };
