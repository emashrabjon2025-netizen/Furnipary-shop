#!/usr/bin/env python3
"""FURNIPART avtopost.

  python tools/autopost/autopost.py telegram           # navbatdagi mahsulotni kanalga yuboradi
  python tools/autopost/autopost.py stories [SANA]     # SANA (YYYY-MM-DD) uchun 4 ta istoriya rasmini chizadi

Mahsulotlar saytdagidek olinadi: Firestore'dagi faol mahsulotlar + /catalog/*.json.
Navbat holat saqlamaydi: kun va vaqt bo'yicha hisoblanadi, shuning uchun har gal boshqa mahsulot chiqadi.
"""
import base64, datetime as dt, io, json, os, random, re, sys, textwrap, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SITE = "https://furnipart-shop.vercel.app"
PROJECT, DB = "furbipart", "default"
CATALOGS = ["higold-oshxona", "higold-garderob", "shablonlar"]
CHANNEL_URL = "t.me/Furnipart_uz"
PHONE = "+998 91 125 9000"
TZ = dt.timezone(dt.timedelta(hours=5))  # Toshkent
SLOTS_PER_DAY = 10                        # 08:00 dan 21:30 gacha har 1.5 soat
STORIES_PER_DAY = 4
FONT = ROOT / "tools/autopost/fonts"


def http_get(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": "furnipart-autopost"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


# ---------------- mahsulotlar ----------------
def _val(v):
    if not isinstance(v, dict):
        return None
    for k in ("stringValue", "booleanValue"):
        if k in v:
            return v[k]
    if "integerValue" in v:
        return int(v["integerValue"])
    if "doubleValue" in v:
        return float(v["doubleValue"])
    return None


def firestore_products():
    base = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/{DB}/documents/products"
    out, token = [], None
    try:
        while True:
            url = base + "?pageSize=300" + (f"&pageToken={urllib.parse.quote(token)}" if token else "")
            d = json.loads(http_get(url))
            for doc in d.get("documents", []):
                f = {k: _val(v) for k, v in doc.get("fields", {}).items()}
                f["id"] = doc["name"].rsplit("/", 1)[-1]
                f["source"] = "db"
                out.append(f)
            token = d.get("nextPageToken")
            if not token:
                break
    except Exception as e:  # baza ishlamasa ham kataloglar bilan davom etamiz
        print("Firestore o'qilmadi:", e, file=sys.stderr)
    return out


def load_products():
    db = firestore_products()
    names = {(p.get("name") or "").strip().lower() for p in db}
    ids = {p["id"] for p in db}
    cat = []
    for k in CATALOGS:
        try:
            items = json.loads((ROOT / f"catalog/{k}.json").read_text("utf-8"))["items"]
        except Exception:
            continue
        for it in items:
            if it["id"] in ids or it["name"].strip().lower() in names:
                continue
            cat.append({**it, "source": "catalog", "active": True})
    prods = [p for p in db + cat if p.get("active") is not False and p.get("name") and p.get("price")]
    prods = [p for p in prods if p.get("hasImage") or p.get("thumb") or p.get("imgUrl")]
    prods.sort(key=lambda p: p["id"])
    random.Random(2026).shuffle(prods)  # turli kategoriyalar aralash chiqsin
    return prods


def product_image(p):
    """Mahsulot rasmini (bytes) qaytaradi: bazadagi katta rasm → link → kichik rasm."""
    if p.get("hasImage") and p.get("source") == "db":
        try:
            d = json.loads(http_get(
                f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/{DB}/documents/productImages/{p['id']}"))
            data = _val(d["fields"]["data"])
            return base64.b64decode(data.split(",", 1)[1])
        except Exception as e:
            print("katta rasm o'qilmadi:", e, file=sys.stderr)
    url = (p.get("imgUrl") or "").strip()
    if url:
        local = re.sub(r"^https?://furnipart-shop\.vercel\.app", "", url)
        if local.startswith("/") and (ROOT / local.lstrip("/")).exists():
            return (ROOT / local.lstrip("/")).read_bytes()
        try:
            return http_get(url if url.startswith("http") else SITE + url)
        except Exception as e:
            print("rasm yuklanmadi:", url, e, file=sys.stderr)
    t = p.get("thumb") or ""
    if t.startswith("data:"):
        return base64.b64decode(t.split(",", 1)[1])
    return None


def fmt_price(v):
    v = round(float(v), 2)
    s = f"{v:,.2f}".replace(",", " ")
    return "$" + (s[:-3] if s.endswith(".00") else s)


def short_desc(p, limit=420):
    lines = [l for l in (p.get("description") or "").splitlines()
             if not l.startswith("Narx AQSh dollarida")]
    d = "\n".join(lines).strip()
    d = re.sub(r"\n{3,}", "\n\n", d)
    if len(d) > limit:
        d = d[:limit].rsplit(" ", 1)[0] + "…"
    return d


# ---------------- Telegram ----------------
def telegram_slot(now):
    local = now.astimezone(TZ)
    mins = local.hour * 60 + local.minute - 8 * 60
    pos = max(0, min(SLOTS_PER_DAY - 1, round(mins / 90)))
    day = (local.date() - dt.date(2026, 1, 1)).days
    return day * SLOTS_PER_DAY + pos


def telegram_caption(p):
    price = p.get("salePrice") or p["price"]
    old = f" (oldin {fmt_price(p['price'])})" if p.get("salePrice") else ""
    parts = [p["name"].strip()]
    d = short_desc(p)
    if d:
        parts.append(d)
    parts.append(f"Narxi: {fmt_price(price)}{old}\nTo'lov so'mda, Markaziy bank kursi bo'yicha.")
    parts.append(f"Buyurtma va batafsil: {SITE}/#p={p['id']}\nTel: {PHONE}\nO'zbekiston bo'ylab dastavka bor.")
    cap = "\n\n".join(parts)
    return cap[:1020]


def send_telegram(p, img):
    token = os.environ["TELEGRAM_BOT_TOKEN"]
    chat = os.environ.get("TELEGRAM_CHANNEL", "@Furnipart_uz")
    boundary = "----furnipart" + os.urandom(8).hex()
    body = io.BytesIO()
    def part(name, value, filename=None, ctype=None):
        body.write(f"--{boundary}\r\n".encode())
        disp = f'form-data; name="{name}"' + (f'; filename="{filename}"' if filename else "")
        body.write(f"Content-Disposition: {disp}\r\n".encode())
        if ctype:
            body.write(f"Content-Type: {ctype}\r\n".encode())
        body.write(b"\r\n")
        body.write(value if isinstance(value, bytes) else value.encode("utf-8"))
        body.write(b"\r\n")
    part("chat_id", chat)
    part("caption", telegram_caption(p))
    part("photo", img, "photo.jpg", "image/jpeg")
    body.write(f"--{boundary}--\r\n".encode())
    req = urllib.request.Request(f"https://api.telegram.org/bot{token}/sendPhoto", data=body.getvalue(),
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    try:
        resp = json.loads(urllib.request.urlopen(req, timeout=60).read())
    except urllib.error.HTTPError as e:
        resp = json.loads(e.read() or b"{}")
    if not resp.get("ok"):
        print(f"::error::Telegram: {resp.get('description')}")
        sys.exit(1)


def to_jpeg(raw, max_side=1600):
    from PIL import Image, ImageOps
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    im.thumbnail((max_side, max_side))
    b = io.BytesIO(); im.save(b, "JPEG", quality=88); return b.getvalue()


def cmd_telegram():
    prods = load_products()
    if not prods:
        print("::error::Mahsulot topilmadi"); sys.exit(1)
    slot = telegram_slot(dt.datetime.now(dt.timezone.utc))
    for k in range(len(prods)):  # rasmi ochilmasa keyingisiga o'tadi
        p = prods[(slot + k) % len(prods)]
        raw = product_image(p)
        if raw:
            send_telegram(p, to_jpeg(raw))
            print("Yuborildi:", p["id"], p["name"])
            return
    print("::error::Rasmli mahsulot topilmadi"); sys.exit(1)


# ---------------- Istoriya ----------------
def font(w, s):
    return __import__("PIL.ImageFont", fromlist=["x"]).truetype(str(FONT / f"Inter-{w}.otf"), s)


def render_story(p, raw):
    from PIL import Image, ImageDraw, ImageOps, ImageFilter
    W, H = 1080, 1920
    YEL, BLK = (255, 200, 0), (14, 14, 14)
    img = Image.new("RGB", (W, H), BLK)
    # yumshoq sariq nur
    glow = Image.new("L", (W, H), 0); gd = ImageDraw.Draw(glow)
    gd.ellipse((-200, 380, W + 200, 1500), fill=70)
    glow = glow.filter(ImageFilter.GaussianBlur(160))
    img.paste(Image.new("RGB", (W, H), (120, 92, 0)), (0, 0), glow)
    d = ImageDraw.Draw(img)

    # logo
    mark = Image.open(ROOT / "img/logo-mark.png").convert("RGBA").resize((96, 96))
    d.rounded_rectangle((60, 120, 520, 240), radius=36, fill=(0, 0, 0))
    img.paste(mark, (76, 132), mark)
    f = font("ExtraBold", 54)
    d.text((190, 136), "FURNI", font=f, fill=YEL)
    d.text((190 + d.textlength("FURNI", font=f), 136), "PART", font=f, fill="white")
    d.text((193, 196), "premium", font=font("Medium", 26), fill=(220, 220, 220))

    # mahsulot rasmi — oq kartada
    ph = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    box = (90, 300, W - 90, 300 + 900)
    card = Image.new("RGB", (box[2] - box[0], box[3] - box[1]), (255, 255, 255))
    ph.thumbnail((card.width - 60, card.height - 60), Image.LANCZOS)
    card.paste(ph, ((card.width - ph.width) // 2, (card.height - ph.height) // 2))
    mask = Image.new("L", card.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, card.width - 1, card.height - 1), radius=48, fill=255)
    img.paste(card, box[:2], mask)

    # nomi
    name = p["name"].strip()
    name = re.sub(r"\s+—\s+[A-Za-z0-9-]+$", "", name)  # oxiridagi artikulni olib tashlash
    fn = font("ExtraBold", 60)
    lines = textwrap.wrap(name, 26)[:3]
    y = 1250
    for ln in lines:
        w = d.textlength(ln, font=fn)
        d.text(((W - w) / 2, y), ln, font=fn, fill="white")
        y += 74

    # CTA
    y = max(y + 40, 1500)
    t1 = "NARXINI BILISH UCHUN"
    f1 = font("Bold", 40)
    w = d.textlength(t1, font=f1)
    d.text(((W - w) / 2, y), t1, font=f1, fill=YEL)
    y += 70
    d.rounded_rectangle((140, y, W - 140, y + 130), radius=65, fill=YEL)
    t2 = "Telegram kanalga o'ting"
    f2 = font("ExtraBold", 50)
    w = d.textlength(t2, font=f2)
    d.text(((W - w) / 2, y + 34), t2, font=f2, fill=BLK)
    y += 160
    f3 = font("SemiBold", 40)
    w = d.textlength(CHANNEL_URL, font=f3)
    d.text(((W - w) / 2, y), CHANNEL_URL, font=f3, fill="white")
    out = io.BytesIO(); img.save(out, "JPEG", quality=90); return out.getvalue()


def cmd_stories(date_str=None):
    day = dt.date.fromisoformat(date_str) if date_str else dt.datetime.now(TZ).date()
    prods = load_products()
    order = prods[:]
    random.Random(77).shuffle(order)  # telegramdagi navbatdan farqli
    n = (day - dt.date(2026, 1, 1)).days * STORIES_PER_DAY
    outdir = ROOT / "stories" / day.isoformat()
    outdir.mkdir(parents=True, exist_ok=True)
    made, k, meta = 0, 0, []
    while made < STORIES_PER_DAY and k < len(order):
        p = order[(n + k) % len(order)]; k += 1
        raw = product_image(p)
        if not raw:
            continue
        made += 1
        (outdir / f"{made}.jpg").write_bytes(render_story(p, raw))
        meta.append({"n": made, "id": p["id"], "name": p["name"]})
    (outdir / "stories.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), "utf-8")
    print(json.dumps(meta, ensure_ascii=False))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "telegram":
        cmd_telegram()
    elif cmd == "stories":
        cmd_stories(sys.argv[2] if len(sys.argv) > 2 else None)
    else:
        print(__doc__); sys.exit(2)
