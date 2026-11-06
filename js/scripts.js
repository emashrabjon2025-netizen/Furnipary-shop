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
Assalomu alaykum, {ism}! FURNIPART'dan {operator}. Divan / bosh tomoni bo'yicha so'ragan ekansiz.

2. SAVOLLAR
• Qaysi o'lchamdagi matras uchun? (160, 180…)
• Qaysi fason yoqdi? Rasmini yuboraymi?
• Rangi va materiali (velyur, rogojka, eko-teri)?

3. TAKLIF
Xohlagan dizayn va rangda tayyorlab beramiz. Narxi … , tayyor bo'lishi … kun.

4. YOPISH
Zaklad bilan zakaz qilamiz, qolganini yetkazganda to'laysiz. Bugun rasmiylashtiraylikmi?`,
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
