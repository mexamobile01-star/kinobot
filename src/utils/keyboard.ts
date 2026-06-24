import { InlineKeyboard, Keyboard } from "grammy";

/**
 * Telegram Bot API inline tugmalarning fon rangini o'zgartirishni QO'LLAB-QUVVATLAMAYDI.
 * Rasmlardagidek "rangli" effekt — tugma matni boshiga rangli doira emoji qo'yish bilan beriladi.
 * (Bu — barcha botlar ishlatadigan standart usul.)
 */
export const DOT = {
  green: "🟢",
  blue: "🔵",
  red: "🔴",
  yellow: "🟡",
  orange: "🟠",
  white: "⚪️",
} as const;

// ===================== ADMIN REPLY KEYBOARD =====================
export function adminMenuKeyboard(): Keyboard {
  return new Keyboard()
    .text("📊 Statistika")
    .text("📢 Kanal boshqaruvi")
    .row()
    .text("🎬 Kino boshqaruvi")
    .text("📺 Serial boshqaruvi")
    .row()
    .text("💾 Backup")
    .text("🔄 Yangilash")
    .resized();
}

// ===================== FOYDALANUVCHI REPLY KEYBOARD =====================
export function userMenuKeyboard(): Keyboard {
  return new Keyboard()
    .text("🔎 Kino qidirish")
    .row()
    .text("ℹ️ Yordam")
    .resized();
}

/** Bekor qilish reply tugmasi (conversation ichida) */
export function cancelKeyboard(): Keyboard {
  return new Keyboard().text("❌ Bekor qilish").resized().oneTime();
}

export { InlineKeyboard, Keyboard };
