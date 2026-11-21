// Operator uchun sotuv skriptlari (standart). Admin "Operatorlar" bo'limida o'zgartiradi → crmSettings/scripts
export const DEFAULT_SCRIPTS = {
  matras: `1. SALOM
Assalomu alaykum, {ism}! FURNIPART premium'dan {operator}. Matras bo'yicha so'ragan ekansiz — 2 daqiqa vaqtingiz bormi?

2. SAVOLLAR (javobini izohga yozing)
• Matras kim uchun — o'zingizgami, ota-onangizgami, bolagami?
• Karavotingiz o'lchami qancha? (160×200, 180×200…)
• Belingiz yoki umurtqangizdan shikoyat bormi? Qattiqroq yoqadimi, yumshoqroq?

3. TAKLIF
Sizga ortopedik matras to'g'ri keladi — 5 yil kafolat. {o'lcham} — narxi …
Vodiy bo'ylab yetkazib berish bepul, O'zbekiston bo'ylab dastavka bor.

4. E'TIROZLAR
• "Qimmat" → Matras 8–10 yil xizmat qiladi: kuniga 1 000 so'mga ham yetmaydi. Arzonrog'i ham bor — ko'rsataymi?
• "O'ylab ko'raman" → Albatta. Qaysi savol qolyapti — o'lchammi, narxmi, qattiqligimi? Ertaga soat nechada qo'ng'iroq qilay?
• "Ko'rishim kerak" → Do'konimiz Marg'ilonda, Marg'ilon sitiy ro'parasida. Bugun kelasizmi? Kelolmasangiz video yuboraman.

5. YOPISH
Qaysi kuni olib boraylik — ertagami yoki indinga? Manzilni yozib olay.`,
  furnitura: `1. SALOM
Assalomu alaykum, {ism}! FURNIPART'dan {operator}. {mahsulot} bo'yicha yozgan ekansiz.

2. SAVOLLAR
• O'zingiz mebel yasaysizmi yoki uyingiz uchunmi?
• Qancha kerak bo'ladi — 1 tami yoki zakazlar uchun ko'proqmi?
• Shkaf/korpus o'lchami qancha? (mexanizm to'g'ri tushishi uchun)

3. TAKLIF
Narxi … Bundan tashqari … ham bor — ko'p olsangiz narxni kelishamiz.
O'zbekiston bo'ylab dastavka bor (BTS / pochta).

4. E'TIROZLAR
• "Qimmat" → Bu original, kafolatli. Arzon analogi ham bor — farqini aytib beraymi?
• "Keyinroq" → Zakazingiz qachon? Shu kunga tayyorlab qo'yamiz.

5. YOPISH
Hozir rasmiylashtiraylikmi? Qaysi shaharga yuboramiz?
Har safar kerak bo'lsa — to'g'ridan-to'g'ri menga yozing.`,
  divan: `1. SALOM
Assalomu alaykum, {ism}! FURNIPART premium'dan {operator}. Divan bo'yicha so'ragan ekansiz — 2 daqiqa vaqtingiz bormi?

2. SAVOLLAR (javobini izohga yozing)
• Matrasingiz o'lchami qancha? (bizda tayyori 170×210 matras uchun)
• Faqat bosh tomoni kerakmi yoki to'liq komplekt (bosh + yon + oyoq tomoni)?
• Qaysi rang yoqadi: sutli (malochniy) velyur yoki bordo koja?
• Qaysi shahardasiz? (yetkazishni aytish uchun)

3. TAKLIF — 2 xil variant
• Divan bosh tomoni (bo'yi 110 sm) — 580 000 so'm
• To'liq komplekt: bosh + yon + oyoq tomonlari — 1 600 000 so'm (4 ta qotirish ugolnigi bilan)
  Ugolniksiz — 1 500 000 so'm
"Ko'pchilik to'liq komplektni oladi — karavot butunlay yangi, chiroyli ko'rinadi."

4. MAHSULOT HAQIDA (savol bo'lsa)
• Tayyori 2 rangda bor: sutli rang velyur va bordo rang koja.
• Koja suv o'tkazmaydi — ho'l latta bilan bemalol artib ishlatasiz, dog' qolmaydi.
• Ichida 17 zichlikdagi porolon — yumshoq, lekin cho'kib qolmaydi.
• Karkasi yangi DSP dan.
• O'zimiz ishlab chiqaramiz, jo'natishdan oldin tekshiramiz. Brak chiqsa — almashtirib beramiz.
• Kafolat 1 yil — porolon cho'kib, buzilib qolsa.
• Boshqa o'lcham yoki rang kerak bo'lsa — zakaz bo'yicha tayyorlaymiz, muddatini kelishamiz (admin bilan aniqlang).

5. YETKAZISH VA TO'LOV
• Farg'ona vodiysi bo'ylab — o'zimiz uyingizgacha olib boramiz.
• Boshqa viloyatlarga — taksi yoki pochta orqali jo'natamiz, yo'l kirani mijoz to'laydi.
• O'rnatib berish (ustanovka) yo'q — ugolniklar bilan o'zingiz oson qotirasiz.
• Bo'lib to'lash yo'q. Mahsulot to'liq to'lovdan keyin jo'natiladi.
• Katta zakazda (5–6 tadan ko'p) zaklad olinadi, tayyor bo'lgach qolgani to'liq to'lanadi.

6. E'TIROZLAR
• "Qimmat" → "Arzonida porolon 1 yilda cho'kib qoladi. Bizda 17 zichlikdagi porolon va 1 yil kafolat — bir marta olib, yillab ishlatasiz. Faqat bosh tomoni ham bor — 580 000 so'm."
• "O'ylab ko'raman / maslahatlashaman" → "Albatta. Rasm va narxlarni yozib yuboraman, oilangizga ko'rsating. Ertaga soat nechada qo'ng'iroq qilay?" (keyingi qo'ng'iroq sana+soatini qo'ying)
• "Bozorda arzon" → "Bozorda kafolat yo'q, sifatini bilmaysiz. Biz o'zimiz ishlab chiqaramiz, tekshirib jo'natamiz, brak bo'lsa almashtiramiz."
• "Rasmdagidek keladimi?" → "Ha, xohlasangiz do'kondan aynan shu mahsulotni videoga olib yuboraman."
• "Kelib ko'rsam bo'ladimi?" → "Albatta: Marg'ilon, Marg'ilon sitiy ro'parasida (Sto Tex yonida). Tel: +998 91 125 9000."
• Ko'p dona (5 tadan ko'p) → komplekt 1 450 000 so'mgacha tushirish mumkin. Undan pastini faqat admin bilan kelishib ayting.

7. YOPISH
"Qaysi rangini rasmiylashtiraylik — sutli velyurmi yoki bordo kojami? Manzilingizni yozib olay, ertaga yetkazib beramiz."
→ Sotildi bo'lsa: 💰 Sotildi tugmasini bosing, rang va variantni izohga yozing.`,
  umumiy: `1. SALOM
Assalomu alaykum, {ism}! FURNIPART premium'dan {operator}. Bizga yozgan ekansiz — qanday yordam bera olaman?

2. SAVOLLAR
• Aynan nima kerak, qaysi o'lchamda?
• Qachongacha kerak?
• Qaysi shahardasiz? (dastavkani hisoblash uchun)

3. TAKLIF → narx → bonus (dastavka / kafolat)

4. YOPISH
Qaysi kuni olib boraylik? Manzilni yozib olay.`,
};
