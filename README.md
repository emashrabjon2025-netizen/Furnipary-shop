# FURNIPART shop

FURNIPART premium — mebel furnitura, divan va matraslar internet-do'koni.

- `index.html` — mijozlar uchun sayt (katalog, savat, buyurtma)
- `admin.html` — admin panel (`/admin`): mahsulotlar, buyurtmalar, Excel import, zaxira
- `api/notify.js` — yangi buyurtmani Telegram'ga yuboradi
- `firestore.rules` — baza himoyasi

Build kerak emas: oddiy HTML + JavaScript, Firebase CDN orqali ulanadi.

## Birinchi sozlash

### 1. Firebase
1. console.firebase.google.com → **Create a project** → nomi `furnipart-shop`.
2. **Build → Firestore Database → Create database** → joylashuv `eur3` yoki yaqinroq → **production mode**.
3. **Build → Authentication → Get started → Email/Password → Enable**.
4. **Authentication → Users → Add user** — admin email va parol.
5. **Authentication → Settings → User actions** — "Enable create (sign-up)" belgisini olib tashlang.
6. **Project settings → Your apps → Web (`</>`)** — ilova qo'shing, chiqqan `firebaseConfig`ni `js/config.js`ga yozing.
7. Admin foydalanuvchining UID'sini `js/config.js` (`ADMIN_UIDS`) va `firestore.rules` ga yozing.
8. **Firestore → Rules** — `firestore.rules` mazmunini qo'yib **Publish**.

### 2. Vercel
1. vercel.com → **Add New → Project** → shu GitHub repo → **Deploy** (sozlamalarni o'zgartirmang).
2. **Settings → Domains** — kerak bo'lsa o'z domeningizni ulang.
3. Firebase → Authentication → Settings → **Authorized domains** — Vercel domenini qo'shing.

### 3. Telegram xabarnoma (ixtiyoriy)
1. @BotFather'da bot oching, tokenni oling.
2. Botga yoki bot qo'shilgan guruhga biror xabar yozing, so'ng chat ID'ni oling.
3. Vercel → **Settings → Environment Variables**: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` → **Redeploy**.

## Mahsulot rasmlari
Admin panelda rasm telefondan tanlanadi, brauzerda kichraytiriladi va bazada saqlanadi
(Firebase Storage kerak emas, bepul tarifda ishlaydi). Excel'da "Rasm (link)" ustuniga tayyor link ham yozish mumkin.
