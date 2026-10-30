"""HIGOLD garderob katalogi (PDF) -> sayt uchun rasmlar + Excel import fayli."""
import os, sys
from PIL import Image
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

EX = sys.argv[1]          # pdfimages chiqargan papka (i-PPP-NNN.png)
REPO = sys.argv[2]        # sayt reposi
OUT_XLSX = sys.argv[3]
SITE = "https://furnipart-shop.vercel.app"
IMG_DIR = os.path.join(REPO, "img", "higold")
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
    return f"{SITE}/img/higold/{key}.jpg"

COLOR = {"M": "Moran Green (to'q firuza)", "BV": "Brown Platinum (jigarrang)"}
CAT = "Garderob mexanizmlar"
rows = []

def add(series, name, art, price, img, base=None, size=None, extra=None, color=None, about=None):
    lines = [f"HIGOLD — {series}", f"Artikul: {art}"]
    if color: lines.append(f"Rang: {color}")
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

def colorof(art):
    for k in ("BV", "M"):
        if art.endswith(k): return COLOR[k]
    return None

B = "Lux seriya «B» (Moran Green / Brown Platinum)"

# ---------------- Seriya B ----------------
i_m = make_img("b-poyabzal-m", 4, 6); i_bv = make_img("b-poyabzal-bv", 5, 10)
about = "180° aylanadigan poyabzal javoni: kerakli juftni oson tanlaysiz, shkaf tartibli va chiroyli ko'rinadi."
for art, size, d, p in [("703591M", "685x370x(1910-2110) mm", "12 polka", 690),
                        ("703593M", "685x370x(1350-1550) mm", "8 polka", 525),
                        ("703594M", "685x370x(1070-1270) mm", "6 polka", 415)]:
    add(B, f"aylanadigan poyabzal javoni, {d}", art, p, i_m, "800 mm", size, d, colorof(art), about)
add(B, "aylanadigan poyabzal javoni, 12 polka", "703591BV", 705, i_bv, "800 mm", "685x370x(1910-2110) mm", "12 polka", colorof("703591BV"), about)

i_m = make_img("b-burchak-m", 6, 13); i_bv = make_img("b-burchak-bv", 6, 17)
about = "O-shaklli burchak kiyim tizimi: burchakdagi har santimetrdan foydalanadi, ilgichlar har tomonga aylanadi — kerakli kiyimni topish oson."
add(B, "O-shaklli burchak kiyim tizimi", "706202BV", 295, i_bv, "800 mm", "700x(1900-2100) mm", None, colorof("706202BV"), about)
add(B, "O-shaklli burchak kiyim tizimi", "706202M", 290, i_m, "800 mm", "700x(1900-2100) mm", None, colorof("706202M"), about)

i = make_img("b-oyna", 7, 18)
about = "Tortib chiqariladigan oyna, balandligi ~170 sm — kiyim va aksessuarlarni to'liq ko'rish uchun."
add(B, "tortma (chiqariladigan) oyna", "706161BV", 160, i, None, "400x55x1700 mm", None, colorof("706161BV"), about)
add(B, "tortma (chiqariladigan) oyna", "706161M", 155, i, None, "400x55x1700 mm", None, colorof("706161M"), about)

i_m = make_img("b-sumka-m", 8, 22); i_bv = make_img("b-sumka-bv", 8, 24)
about = "Sumkalar uchun 3 polkali mexanizm: yon savatlarda turli o'lchamdagi narsalarni joylashtirasiz. O'ng yoki chap tomonga ochiladigan variant bor."
for art, side, p in [("703573M", "chap", 280), ("703574M", "o'ng", 280), ("703573BV", "chap", 285), ("703574BV", "o'ng", 285)]:
    add(B, f"sumka uchun 3 polkali mexanizm ({side} mahkamlash)", art, p, i_bv if art.endswith("BV") else i_m,
        "400 mm", "360x475x795 mm", f"Mahkamlash: {side} tomondan", colorof(art), about)

i_m = make_img("b-seyf-m", 9, 27); i_bv = make_img("b-seyf-bv", 9, 30)
about = "Barmoq izi (Touch ID) bilan ochiladigan seyf — soat, zargarlik buyumlari va qimmatbaho narsalar xavfsiz saqlanadi."
for art in ("703297M", "703297BV"):
    add(B, "Touch ID seyf (barmoq izi bilan)", art, 370, i_bv if art.endswith("BV") else i_m, "490 mm", "450x412x205 mm", "Ochilishi: Touch ID", colorof(art), about)

i_m = make_img("b-soat-m", 10, 32); i_bv = make_img("b-soat-bv", 10, 35)
about = "Mexanik soatlar uchun aylantirgich (vinder): mikromotor siferblatni sekin aylantiradi, soat to'xtab qolmaydi."
add(B, "mexanik soat aylantirgichi (vinder)", "706154M", 330, i_m, "420 mm", "410x300x205 mm", None, colorof("706154M"), about)
add(B, "mexanik soat aylantirgichi (vinder)", "706154BV", 340, i_bv, "420 mm", "410x300x205 mm", None, colorof("706154BV"), about)

def drawer_set(key, page, nm, nbv, title, items, about, ser=B):
    im_m = make_img(key + "-m", page, nm); im_bv = make_img(key + "-bv", page, nbv)
    for art, base, size, p in items:
        add(ser, title, art, p, im_bv if art.endswith("BV") else im_m, base, size, None, colorof(art), about)

drawer_set("b-aksessuar", 11, 36, 38, "aksessuarlar uchun tortma", [
    ("706011M", "600 mm", "564x465x91 mm", 220), ("706011BV", "600 mm", "564x465x91 mm", 225),
    ("706014M", "900 mm", "864x465x91 mm", 270), ("706014BV", "900 mm", "864x465x91 mm", 275)],
    "Aksessuarlar (kamar, galstuk, ko'zoynak va h.k.) uchun bo'limli tortma.")
drawer_set("b-bijuteriya", 12, 40, 42, "zargarlik buyumlari (bijuteriya) tortmasi", [
    ("706041M", "600 mm", "564x465x45 mm", 220), ("706041BV", "600 mm", "564x465x45 mm", 225),
    ("706044M", "900 mm", "864x465x45 mm", 270), ("706044BV", "900 mm", "864x465x45 mm", 275)],
    "Uzuk, sirg'a, soat va bijuteriya uchun mayda bo'limli tortma.")
drawer_set("b-multi", 13, 46, 47, "multi tortma (universal)", [
    ("706001M", "600 mm", "564x465x45 mm", 170), ("706001BV", "600 mm", "564x465x45 mm", 175),
    ("706004M", "900 mm", "864x465x45 mm", 210), ("706004BV", "900 mm", "864x465x45 mm", 215)],
    "Universal bo'limli tortma — turli mayda buyumlar uchun.")
drawer_set("b-shim", 14, 48, 50, "shim ilgich tortma (bryuchnitsa)", [
    ("706021M", "600 mm", "564x465x45 mm", 205), ("706021BV", "600 mm", "564x465x45 mm", 210),
    ("706024M", "900 mm", "864x465x45 mm", 255), ("706024BV", "900 mm", "864x465x45 mm", 260)],
    "Tortib chiqariladigan shim ilgich — shimlar g'ijimlanmaydi va oson olinadi.")
drawer_set("b-ichkiyim", 15, 54, 55, "ichki kiyim savati (tortma)", [
    ("706051M", "600 mm", "564x465x251 mm", 220), ("706051BV", "600 mm", "564x465x251 mm", 225),
    ("706054M", "900 mm", "864x465x251 mm", 250), ("706054BV", "900 mm", "864x465x251 mm", 255)],
    "Chuqur tortma-savat: ichki kiyim, sharf va yumshoq narsalar uchun.")

i = make_img("b-shim-yuqori", 16, 59)
about = "Shkaf ichiga yuqoridan o'rnatiladigan tortma shim ilgich."
for art in ("703502M", "703502BV"):
    add(B, "yuqori shim ilgich (tortma)", art, 80, i, "400 mm", "350x453x171 mm", None, colorof(art), about)
add(B, "yuqori shim ilgich (tortma)", "706126S", 110, make_img("b-shim-yuqori-700", 17, 60), "700 mm", "683x450x100 mm", None, None, about)
add(B, "pantograf (tushiriladigan kiyim ilgich)", "703156M", 165, make_img("b-pantograf", 18, 64), "900-1100 mm",
    "864-1064x366x792 mm", "Eni sozlanadi", colorof("703156M"),
    "Pantograf — shkafning yuqori qismidagi kiyimni pastga tushirib beradigan lift-ilgich.")

for key, page, n1, n2, art_bar, art_h, pb, ph, m2 in [
        ("b-shtanga-m", 19, 66, 67, "706191M", "703660M", 33, 6, None),
        ("b-shtanga-bv", 20, 69, 70, "706191BV", "703660BV", 33, 6, None),
        ("b-shtanga-bv2", 21, 71, 73, "703181BV", "703640BV", 38, 11, (72, 74))]:
    ib = make_img(key, page, n1, m2[0] if m2 else None)
    ih = make_img(key + "-tutqich", page, n2, m2[1] if m2 else None)
    add(B, "kiyim shtangasi, 3 metr", art_bar, pb, ib, None, None, "Uzunligi: 3 m (kerakli o'lchamda kesiladi)", colorof(art_bar))
    add(B, "shtanga tutqichi (derjatel)", art_h, ph, ih, None, None, None, colorof(art_h))

add(B, "galstuk ilgichi", "703541M", 40, make_img("b-galstuk", 22, 75), None, "85x445x95 mm", None, colorof("703541M"),
    "Tortib chiqariladigan galstuk va kamar ilgichi.")
add(B, "kiyim ilgichlar to'plami (6 dona)", "706051M (ilgich)", 200, make_img("b-ilgich-m", 23, 86), None, None, "6 dona", colorof("706051M"))
add(B, "kiyim ilgichlar to'plami (6 dona)", "706051BV (ilgich)", 230, make_img("b-ilgich-bv", 23, 88), None, None, "6 dona", colorof("706051BV"))

# ---------------- Seriya B 2.0 ----------------
B2 = "Seriya B 2.0 (charm + metall)"
b2about = "B 2.0 seriyasi: hashamatli charm va yaltiroq metall uyg'unligi, chiroyli va funksional saqlash tizimi."
add(B2, "kosmetika tortmasi", "706364B2.0", 195, make_img("b2-kosmetika", 25, 91), "900 mm", "864x475x50 mm", None, None,
    "Kosmetika va teri parvarishi vositalari uchun maxsus bo'limlar. " + b2about)
add(B2, "aksessuarlar uchun charm tortma", "706314B2.0", 195, make_img("b2-aksessuar", 26, 92), "900 mm", "864x475x86 mm", None, None,
    "Shaxsiy buyumlar va ichki kiyim uchun charm organayzer. " + b2about)
add(B2, "zargarlik buyumlari (bijuteriya) tortmasi", "706344B2.0", 195, make_img("b2-bijuteriya", 27, 95), "900 mm", "864x475x50 mm", None, None,
    "Italyancha dizayn, teksturali charm, puxta bo'limlar. " + b2about)
add(B2, "shim ilgich tortma (bryuchnitsa)", "706324B2.0", 145, make_img("b2-shim", 28, 98), "900 mm", "864x475x50 mm", None, None,
    "Silliq va shovqinsiz ochiladi, sirpanmaydigan shim ilgich. " + b2about)
add(B2, "chuqur charm savat (ichki kiyim)", "706351B2.0 (600)", 175, make_img("b2-savat-600", 29, 101), "600 mm", "564x475x256 mm", None, None,
    "Oddiy polka o'rniga charm savat: sumka va qalin kiyimlar uchun qulay. " + b2about)
add(B2, "chuqur charm savat (ichki kiyim)", "706351B2.0 (900)", 190, make_img("b2-savat-900", 29, 102), "900 mm", "864x475x256 mm", None, None,
    "Oddiy polka o'rniga charm savat: sumka va qalin kiyimlar uchun qulay. " + b2about)

# ---------------- Seriya A ----------------
A = "Premium seriya «A»"
aabout = "Premium «A» seriyasi: zamonaviy uslub, nafislik va sifat."
i = make_img("a-poyabzal", 31, 107)
for art, size, d, p in [("703694C", "685x475x(1070-1270) mm", "6 polka", 342), ("703693C", "685x475x(1350-1550) mm", "8 polka", 390),
                        ("703691C", "685x475x(1910-2110) mm", "12 polka", 430), ("703694S", "685x475x(1070-1270) mm", "6 polka", 352),
                        ("703693S", "685x475x(1350-1550) mm", "8 polka", 400), ("703691S", "685x475x(1910-2110) mm", "12 polka", 440)]:
    add(A, f"aylanadigan poyabzal javoni, {d}", art, p, i, "800 mm", size, d, None, aabout)
i = make_img("a-sumka", 32, 111)
for art, p in [("703571C", 215), ("703572C", 215), ("703571S", 225), ("703572S", 225)]:
    add(A, "3 polkali mexanizm (sumka/kiyim)", art, p, i, "400 mm", "356x465x780 mm", None, None, aabout)
i = make_img("a-pantograf", 33, 116, 117)
add(A, "pantograf (tushiriladigan kiyim ilgich)", "703156C", 130, i, "900-1100 mm", "864-1064x366x792 mm", "Eni sozlanadi", None, aabout)
add(A, "pantograf (tushiriladigan kiyim ilgich)", "703156S", 140, i, "900-1100 mm", "864-1064x366x792 mm", "Eni sozlanadi", None, aabout)
i = make_img("a-shim", 34, 119)
for art, base, size, p in [("703721C", "600 mm", "564x465x60 mm", 90), ("703724C", "900 mm", "864x465x60 mm", 105),
                           ("703721S", "600 mm", "564x465x60 mm", 105), ("703724S", "900 mm", "864x465x60 mm", 120)]:
    add(A, "shim ilgich tortma (bryuchnitsa)", art, p, i, base, size, None, None, aabout)
i = make_img("a-aksessuar", 35, 125, 126)
for art, base, size, p in [("703711C", "600 mm", "564x465x90 mm", 137), ("703714C", "900 mm", "864x465x90 mm", 155),
                           ("703711S", "600 mm", "564x465x90 mm", 150), ("703714S", "900 mm", "864x465x90 mm", 170)]:
    add(A, "aksessuarlar uchun tortma", art, p, i, base, size, None, None, aabout)
i = make_img("a-bijuteriya", 36, 131, 132)
for art, base, size, p in [("703741C", "600 mm", "564x465x60 mm", 137), ("703744C", "900 mm", "864x465x60 mm", 155),
                           ("703741S", "600 mm", "564x465x60 mm", 150), ("703744S", "900 mm", "864x465x60 mm", 170)]:
    add(A, "zargarlik buyumlari (bijuteriya) tortmasi", art, p, i, base, size, None, None, aabout)
add(A, "shkaf ichi tortma oyna", "703541C", 80, make_img("a-oyna", 37, 137), None, None, None, None,
    "Shkaf ichiga o'rnatiladigan kichik oyna — atir va kosmetika doim qo'l ostida. " + aabout)
i = make_img("a-ichkiyim", 38, 138)
for art, base, size, p in [("703751C", "600 mm", "564x475x275 mm", 137), ("703754C", "900 mm", "864x475x275 mm", 155),
                           ("703751S", "600 mm", "564x475x275 mm", 150), ("703754S", "900 mm", "864x475x275 mm", 170)]:
    add(A, "ichki kiyim savati (tortma)", art, p, i, base, size, None, None, aabout)
i = make_img("a-shtanga", 39, 141)
for art, nm, p in [("703581C", "kiyim shtangasi", 21), ("703580C", "shtanga tutqichi (derjatel)", 5),
                   ("703581S", "kiyim shtangasi", 21), ("703580S", "shtanga tutqichi (derjatel)", 5)]:
    add(A, nm, art, p, i, None, None, None, None, aabout)

# ---------------- Seriya MUSE ----------------
MU = "Seriya MUSE"
mabout = "MUSE seriyasi — soddalik go'zalligi."
for key, page, n, title, items in [
    ("muse-ichkiyim", 41, 148, "ichki kiyim tortmasi", [("706651MS", "600 mm", 120), ("706654MS", "900 mm", 140)]),
    ("muse-shim", 41, 149, "shim ilgich tortma (bryuchnitsa)", [("706621C", "600 mm", 80), ("706624C", "900 mm", 100)]),
    ("muse-bijuteriya", 42, 150, "zargarlik buyumlari (bijuteriya) tortmasi", [("706641MS", "600 mm", 115), ("706644MS", "900 mm", 135)]),
    ("muse-aksessuar", 42, 151, "aksessuarlar uchun tortma", [("706611C", "600 mm", 115), ("706614C", "900 mm", 135)])]:
    im = make_img(key, page, n)
    for art, base, p in items:
        size = ("564" if base.startswith("600") else "864") + "x480x75 mm"
        add(MU, title, art, p, im, base, size, None, None, mabout)

# ---------------- Excel ----------------
H = ["Nomi", "Kategoriya", "Narxi", "Chegirma narxi", "Tavsif", "Soni", "Rasm (link)"]
wb = Workbook(); ws = wb.active; ws.title = "Mahsulotlar"
ws.append(H)
for c in ws[1]:
    c.font = Font(bold=True); c.fill = PatternFill("solid", fgColor="FFE600")
for r in rows: ws.append([r[h] for h in H])
for col, w in zip("ABCDEFG", [55, 22, 9, 14, 60, 7, 60]): ws.column_dimensions[col].width = w
for row in ws.iter_rows(min_row=2):
    row[4].alignment = Alignment(wrap_text=True, vertical="top")
wb.save(OUT_XLSX)
print(len(rows), "ta mahsulot;", len(os.listdir(IMG_DIR)), "ta rasm")
