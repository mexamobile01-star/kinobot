# 🎬 Kino Bot

TypeScript + Node.js + **grammY** + **Prisma** (PostgreSQL) asosida qurilgan Telegram kino boti.

Foydalanuvchi **kod** yoki **nom** yozsa — kino tushadi. Adminlar reply-keyboard panel orqali kino/serial qo'shadi, kanallarni boshqaradi, statistikani ko'radi va backup oladi.

## ✨ Imkoniyatlar

- 🔎 **Qidiruv:** kino kodi, nomi (qisman moslik) va **inline** (`@bot nom`)
- 🎬 **Kino qo'shish:** video yuboriladi → bot `file_id` ni eslab qoladi va **maxfiy baza kanalga** avtomatik tashlaydi
- 📺 **Serial:** Serial → Sezon → Qism tuzilishi, qulay navigatsiya tugmalari
- 📢 **Kanal boshqaruvi (rasmlardagidek 1:1):** Ommaviy / Maxfiy / So'rovli (apply-to-join)
  - Kanal `request_chat` tugmasi orqali tanlanadi → bot **avtomatik admin** qilib qo'shiladi
  - "So'rovli" kanallarda join so'rovlari avtomatik tasdiqlanadi
  - Majburiy obunani bitta tugma bilan yoqish/o'chirish
- 📊 **Statistika:** foydalanuvchilar, kinolar, ko'rishlar, top kinolar
- 💾 **Backup:** butun baza JSON fayl sifatida yuklab beriladi
- ⭐ **Premium (custom) emoji** qo'llab-quvvatlash (`<tg-emoji>` HTML tegi orqali)

## 🚀 O'rnatish

### 1. Talablar
- Node.js 18+
- PostgreSQL bazasi

### 2. Sozlash
```bash
npm install
cp .env.example .env   # va .env ni to'ldiring
```

`.env` ichidagi muhim qiymatlar:
| O'zgaruvchi | Tavsif |
|---|---|
| `BOT_TOKEN` | @BotFather dan olingan token |
| `ADMIN_IDS` | Admin Telegram ID'lar (vergul bilan) |
| `BASE_CHANNEL_ID` | Kinolar saqlanadigan **maxfiy** kanal ID (`-100...`). Bot u yerda admin bo'lsin |
| `DATABASE_URL` | PostgreSQL ulanish satri |
| `USE_PREMIUM_EMOJI` | `true`/`false` — premium emoji'larni yoqish |

### 3. Baza
```bash
npx prisma migrate dev --name init   # yoki: npx prisma db push
```

### 4. Ishga tushirish
```bash
npm run dev     # development (tsx watch)
# yoki
npm run build && npm start
```

## 🧭 Foydalanish

**Foydalanuvchi:** botga kod (masalan `123`) yoki kino nomini yuboradi.

**Admin:** `/admin` yoki `/start` → reply-keyboard panel:
- `📊 Statistika`
- `📢 Kanal boshqaruvi`
- `🎬 Kino boshqaruvi`
- `📺 Serial boshqaruvi`
- `💾 Backup`

### Kino qo'shish tartibi
1. `🎬 Kino boshqaruvi` → `➕ Kino qo'shish`
2. Videoni yuboring → kod → nom → qo'shimcha → tayyor.

### Serial qo'shish tartibi
1. `📺 Serial boshqaruvi` → `➕ Serial qo'shish` (kod, nom)
2. So'ng `🎞 Qism qo'shish` → serial kodi → sezon → qism → video.

## 🎨 "Rangli tugmalar" haqida

Telegram Bot API inline tugmalarning **fon rangini** o'zgartirishni qo'llab-quvvatlamaydi.
Rasmlardagidek rangli effekt — har bir tugma boshiga 🟢🔵🔴 rangli emoji qo'yish orqali beriladi (barcha botlar shu usuldan foydalanadi).

Kanal qo'shishdagi "API imkoniyati" — bu **`KeyboardButtonRequestChat`**: foydalanuvchi o'zi admin bo'lgan kanalni tanlaydi va bot avtomatik admin qilib qo'shiladi.

## 📁 Struktura
```
src/
├── index.ts              # kirish nuqtasi, handlerlarni ulash
├── config.ts             # .env
├── prisma.ts             # Prisma client
├── bot.ts                # bot + session + conversations
├── types.ts              # MyContext
├── middlewares/user.ts   # foydalanuvchini bazaga yozish
├── services/media.ts     # kino yuborish
├── utils/                # emoji, keyboard, subscription, settings
└── handlers/
    ├── start.ts          # /start, obuna tekshiruvi
    ├── search.ts         # kod/nom qidiruv
    ├── serialView.ts     # serial navigatsiya
    ├── inline.ts         # inline qidiruv
    └── admin/            # statistics, channels, movies, serials, backup
```
