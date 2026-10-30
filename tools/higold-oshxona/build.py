"""HIGOLD oshxona katalogi (PDF) -> sayt uchun rasmlar + Excel import fayli.
Ishlatish: python3 build.py <pdfimages -png -p papkasi> <sayt reposi> <chiqish.xlsx>
"""
import os, sys
from PIL import Image
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

EX, REPO, OUT_XLSX = sys.argv[1], sys.argv[2], sys.argv[3]
SITE = "https://furnipart-shop.vercel.app"
IMG_DIR = os.path.join(REPO, "img", "higold-oshxona")
os.makedirs(IMG_DIR, exist_ok=True)


def src(page, n):
    return os.path.join(EX, f"i-{page:03d}-{n:03d}.png")


def make_img(key, page, n, mask=None):
    out = os.path.join(IMG_DIR, key + ".jpg")
    im = Image.open(src(page, n)).convert("RGB")
    if mask is not None:
        m = Image.open(src(page, mask)).convert("L").resize(im.size)
        bg = Image.new("RGB", im.size, "white")
        bg.paste(im, (0, 0), m)
        im = bg
    im.thumbnail((1000, 1000), Image.LANCZOS)
    im.save(out, "JPEG", quality=82, optimize=True, progressive=True)
    return f"{SITE}/img/higold-oshxona/{key}.jpg"


CAT = "Oshxona mexanizmlar"
rows = []


def add(series, name, art, price, img, base=None, size=None, extra=None, about=None):
    lines = [f"HIGOLD — {series}", f"Artikul: {art}"]
    if base: lines.append(f"Baza (shkaf eni): {base}")
    if size: lines.append(f"O'lchami (E×Ch×B): {size}")
    if extra: lines.append(extra)
    if about: lines += ["", about]
    lines += ["", "Narx AQSh dollarida ko'rsatilgan; to'lov so'mda, xarid kunidagi Markaziy bank kursi bo'yicha."]
    rows.append({
        "Nomi": f"HIGOLD {name} — {art}",
        "Kategoriya": CAT,
        "Narxi": price,
        "Chegirma narxi": "",
        "Tavsif": "\n".join(lines),
        "Soni": "",
        "Rasm (link)": img,
    })


SH = "Shearer seriyasi"
FA = "Fashion seriyasi"

# --- Kolonna (baland) shkaflar ---
i = make_img("pantry-aylanma", 2, 3)
about = ("Aylanadigan kolonna: eshikni ochsangiz, hamma narsa ko'z oldingizda. Polkalar 360° aylanadi, "
         "qo'yib yuborsangiz o'z joyiga qaytadi.")
for art, size, d, p in [("202295", "555x545x(1720-2020) mm", "5 polka", 450),
                        ("202296", "555x545x(2020-2320) mm", "6 polka", 500)]:
    add(SH, f"aylanadigan kolonna (Space Swivel), {d}", art, p, i, "600 mm", size, d, about)

i = make_img("tall-unit", 3, 8)
about = "Baland shkaf uchun to'liq tortib chiqariladigan kolonna — konserva, ichimlik va oziq-ovqat zaxirasi uchun."
for art, base, size, d, p in [("201182", "300 mm", "250x500x(1659-2059) mm", "5 polka", 325),
                              ("201185", "400 mm", "350x500x(1659-2059) mm", "5 polka", 340),
                              ("201186", "400 mm", "350x500x(1959-2359) mm", "6 polka", 385)]:
    add(SH, f"tortma kolonna (Tall Unit), {d}", art, p, i, base, size, d, about)

i = make_img("tandem", 4, 11)
about = "Tandem kolonna: eshik bilan birga ichki polkalar ham chiqadi — shkafning har burchagi ishlaydi."
for art, base, size, d, p in [("202252", "450 mm", "408x500x1625 mm", "5 polka", 325),
                              ("202253", "450 mm", "408x500x1825 mm", "6 polka", 340),
                              ("202255", "600 mm", "558x500x1625 mm", "5 polka", 385),
                              ("202256", "600 mm", "558x500x1825 mm", "6 polka", 385)]:
    add(SH, f"tandem kolonna (Style Tandem), {d}", art, p, i, base, size, d, about)

i = make_img("tandem-fashion", 20, 52)
add(FA, "tandem kolonna, 5 qavat", "202002", 135, i, "450/500 mm", "385x510x(1659-2059) mm", "5 qavat",
    "Xromlangan simli savatlar: eshikda va korpusda — ziravor, banka va ichimliklar uchun.")

i = make_img("kolonna-polkalar", 7, 18)
about = "Kolonna shkaf uchun tortib chiqariladigan polka (katalogdagi raqam bo'yicha). Har biri alohida sotiladi."
for art, size, t, p in [("303801", "564x480x90 mm", "1-tur: shisha va idishlar uchun bo'limli", 100),
                        ("303802", "564x480x110 mm", "2-tur: vino shishalari yotqizib saqlanadi", 115),
                        ("303803", "564x480x110 mm", "3-tur: yog'och qistirmali, mahsulotlar uchun", 135),
                        ("303804", "564x480x90 mm", "4-tur: ko'p bo'limli organayzer", 170),
                        ("303805", "564x480x90 mm", "5-tur: qoshiq-sanchqi va mayda buyumlar uchun", 115)]:
    add(SH, f"kolonna uchun tortma polka ({t.split(':')[0]})", art, p, i, "600 mm", size, t, about)

# --- Burchak mexanizmlari ---
i = make_img("burchak-magic", 8, 19)
about = ("Burchakdagi \"o'lik zona\"dan to'liq foydalanadi, egilib qidirish kerak emas. "
         "Demferli yo'naltiruvchilar — ravon va jim ochilib-yopiladi.")
add(SH, "burchak mexanizmi (Magic Corner), chap ochilish", "101055", 275, i, "900 mm", "864x490x535 mm", "Ochilishi: chap", about)
add(SH, "burchak mexanizmi (Magic Corner), o'ng ochilish", "101056", 275, i, "900 mm", "864x490x535 mm", "Ochilishi: o'ng", about)

i = make_img("burchak-shearer", 9, 22)
add(SH, "burchak shkaf mexanizmi", "101148", 285, i, "800/900 mm", "680x455x590 mm", "Ochilishi: chap/o'ng",
    "Ajratilgan konstruksiya: barcha savatlar ravon va jim chiqadi, shkafning chuqur qismi ham ko'rinadi.")

i = make_img("eshik-savat", 5, 14)
add(SH, "eshikka biriktirilgan chiqma savat", "309041", 180, i, "600 mm", "550x490x590 mm", "Shkaf balandligi: min 550 mm",
    "Eshik ochilganda savatlar ham birga chiqadi — ziravor, yog' va bankalar qo'l ostida.")

# --- Pastki shkaf: tortma savatlar (kargo) ---
i = make_img("tray-basket", 10, 23)
about = "Tor (200 mm) shkaf uchun tortma kargo — yog', sous va ziravor shishalari uchun."
add(SH, "tor kargo (Tray Basket), chap", "304307L", 110, i, "200 mm", "135x460x580 mm", None, about)
add(SH, "tor kargo (Tray Basket), o'ng", "304307R", 110, i, "200 mm", "135x460x580 mm", None, about)

i = make_img("kargo-4", 11, 25)
for art, base, size, p in [("306271", "300 mm", "245x465x555 mm", 170),
                           ("306272", "350 mm", "305x465x555 mm", 180),
                           ("306274", "450 mm", "395x465x555 mm", 210)]:
    add(SH, "kargo 4.0 (tortma savat)", art, p, i, base, size, None,
        "Pastki shkaf uchun ikki qavatli tortma kargo — shishalar va bankalar uchun.")

i = make_img("kargo-3qavat", 12, 28, 29)
for art, base, size, p in [("306291", "300 mm", "264x450x475 mm", 145),
                           ("306293", "400 mm", "364x450x475 mm", 155),
                           ("306294", "450 mm", "414x450x475 mm", 180)]:
    add(SH, "3 qavatli tortma kargo", art, p, i, base, size, None,
        "Uch qavatli tortma savat, demferli yo'naltiruvchilar bilan.")

# --- Yuqori shkaf: tushadigan savatlar ---
i = make_img("tushuvchi-savat", 13, 30)
for art, base, size, p in [("401221", "600 mm", "564x283x525 mm", 225),
                           ("401223", "800 mm", "764x283x525 mm", 245),
                           ("401224", "900 mm", "864x283x525 mm", 295)]:
    add(SH, "yuqori shkaf uchun tushadigan savat (lift)", art, p, i, base, size, "Dastagi (richag) sozlanadi",
        "Dastakni tortsangiz savat pastga tushadi — baland polkaga chiqish kerak emas.")

i = make_img("tushuvchi-quritgich", 14, 33)
for art, base, size, p in [("401331", "600 mm", "564x283x525 mm", 255),
                           ("401334", "900 mm", "864x283x525 mm", 305)]:
    add(SH, "yuqori shkaf uchun tushadigan idish quritgich (lift)", art, p, i, base, size, "Dastagi (richag) sozlanadi",
        "Likopcha va idishlar uchun tushadigan quritgich — qo'l yetadigan balandlikka tushadi.")

i = make_img("tushuvchi-elektr", 6, 16)
for art, base, size, p in [("401301", "600 mm", "570x190x690 mm", 500),
                           ("401304", "900 mm", "870x190x690 mm", 560)]:
    add(SH, "yuqori shkaf uchun yoritgichli tushadigan savat", art, p, i, base, size,
        "O'rnatish: shkafning yuqori o'ng ichki burchagida Ø30 mm teshik (o'ng yon devordan 28 mm, orqa devordan 170 mm)",
        "Yoritgichli tushadigan savat — yuqori shkafdagi narsalar qulay balandlikka tushadi.")

# --- Tortmalar (yashik ichiga) ---
i = make_img("multi-4", 15, 38)
for art, base, size, p in [("303585", "600 mm", "550x460x265 mm", 200),
                           ("303582", "800 mm", "750x460x265 mm", 240),
                           ("303581", "900 mm", "850x460x265 mm", 255)]:
    add(SH, "ko'p funksiyali tortma savat 4.0 (likopcha + qoshiq-sanchqi)", art, p, i, base, size, None,
        "Likopcha ushlagichi va qoshiq-sanchqi bo'limlari bor tortma savat, soft-stop yopilish.")

i = make_img("pullout-4", 15, 36)
for art, base, size, p in [("303595", "600 mm", "550x460x265 mm", 185),
                           ("303592", "800 mm", "750x460x265 mm", 205),
                           ("303591", "900 mm", "850x460x265 mm", 225)]:
    add(SH, "chuqur tortma savat 4.0 (qozon-tovalar uchun)", art, p, i, base, size, None,
        "Qozon, tova va katta idishlar uchun chuqur tortma savat, soft-stop yopilish.")

i = make_img("likopcha-tortma", 16, 41)
for art, base, size, p in [("303555", "600 mm", "564x450x180 mm", 140),
                           ("303554", "700 mm", "664x450x180 mm", 150),
                           ("303552", "800 mm", "764x450x180 mm", 160),
                           ("303551", "900 mm", "864x450x180 mm", 170)]:
    add(SH, "likopcha ushlagichli tortma savat", art, p, i, base, size, None,
        "Likopcha va kosalar tik turadi, qoshiq-sanchqi uchun alohida bo'lim bor.")

i = make_img("qozon-tortma", 16, 42)
for art, base, size, p in [("303565", "600 mm", "564x450x180 mm", 120),
                           ("303562", "800 mm", "764x450x180 mm", 127),
                           ("303561", "900 mm", "864x450x180 mm", 130)]:
    add(SH, "qozon-tovalar uchun tortma savat", art, p, i, base, size, None,
        "Tekis tagli tortma savat — qozon, tova va katta idishlar uchun.")

i = make_img("qoshiq-lotok", 19, 49)
for art, base, size, p in [("308267", "600 mm", "530x423x53 mm", 68),
                           ("308268", "700 mm", "630x423x53 mm", 73),
                           ("308271", "800 mm", "730x423x53 mm", 78),
                           ("308273", "900 mm", "830x423x53 mm", 83)]:
    add(SH, "qoshiq-sanchqi lotogi (tortma ichiga)", art, p, i, base, size, None,
        "Tortma ichiga qo'yiladigan bo'limli lotok — qoshiq, sanchqi, pichoq va mayda buyumlar tartibli turadi.")

i = make_img("fashion-pullout", 17, 45)
for art, base, size, p in [("301004", "600 mm", "535x466x186 mm", 70),
                           ("301103", "900 mm", "835x466x186 mm", 80)]:
    add(FA, "simli tortma savat (qozon-tovalar uchun)", art, p, i, base, size, None,
        "Xromlangan simli tortma savat yo'naltiruvchilari bilan.")

i = make_img("fashion-multi", 18, 47)
for art, base, size, p in [("301607", "600 mm", "535x466x186 mm", 70),
                           ("301603", "900 mm", "835x466x186 mm", 80)]:
    add(FA, "simli ko'p funksiyali tortma savat (likopchalar uchun)", art, p, i, base, size, None,
        "Likopcha ushlagichli xromlangan simli tortma savat.")

i = make_img("tor-savat", 21, 55)
add(FA, "tor tortma savat (quritgich)", "304098", 45, i, "150 mm", "95x462x505 mm", None,
    "150 mm tor shkaf uchun ikki qavatli simli savat — yog', ziravor va shishalar uchun.")

i = make_img("rakovina-savat", 22, 58)
add(FA, "rakovina osti savati (Trough Basket)", "308002", 65, i, "900 mm", "794x450x130 mm", None,
    "Rakovina (moyka) quvurlarini aylanib o'tadigan U-shaklli tortma savat.")

i = make_img("musor-chelak", 23, 64)
add("SS seriyasi", "zanglamas po'lat axlat chelagi (eshikka)", "307016", 45, i, "400 mm", "Ø290 x 350 mm", None,
    "Zanglamas po'latdan axlat chelagi — shkaf eshigining ichki tomoniga o'rnatiladi.")

i = make_img("yuvish-vosita-savat", 23, 60)
add("Clear seriyasi", "rakovina osti savati (yuvish vositalari uchun)", "307020", 65, i, "350 mm", "285x467x415 mm", None,
    "Rakovina ostidagi tortma savat — idish yuvish vositalari va shishalar uchun.")

# ---------------- Excel ----------------
H = ["Nomi", "Kategoriya", "Narxi", "Chegirma narxi", "Tavsif", "Soni", "Rasm (link)"]
wb = Workbook(); ws = wb.active; ws.title = "Mahsulotlar"
ws.append(H)
for c in ws[1]:
    c.font = Font(bold=True); c.fill = PatternFill("solid", fgColor="FFE600")
for r in rows: ws.append([r[h] for h in H])
for col, w in zip("ABCDEFG", [60, 22, 9, 14, 60, 7, 60]): ws.column_dimensions[col].width = w
for row in ws.iter_rows(min_row=2):
    row[4].alignment = Alignment(wrap_text=True, vertical="top")
wb.save(OUT_XLSX)
print(len(rows), "ta mahsulot;", len(os.listdir(IMG_DIR)), "ta rasm")
