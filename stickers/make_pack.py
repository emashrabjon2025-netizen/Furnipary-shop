# FURNIPART Telegram stiker to'plamini bot orqali yaratadi (bor bo'lsa — yangilaydi).
# GitHub Actions: .github/workflows/stickers.yml
import json, os, sys, urllib.request, uuid

TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
USER_ID = int(os.environ.get("USER_ID") or "5345741396")
API = f"https://api.telegram.org/bot{TOKEN}/"
HERE = os.path.dirname(os.path.abspath(__file__))

def call(method, fields=None, files=None):
    fields = fields or {}
    if files:
        b = uuid.uuid4().hex
        body = b""
        for k, v in fields.items():
            body += f"--{b}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
        for k, path in files.items():
            body += f"--{b}\r\nContent-Disposition: form-data; name=\"{k}\"; filename=\"{os.path.basename(path)}\"\r\nContent-Type: image/png\r\n\r\n".encode()
            body += open(path, "rb").read() + b"\r\n"
        body += f"--{b}--\r\n".encode()
        req = urllib.request.Request(API + method, data=body, headers={"Content-Type": f"multipart/form-data; boundary={b}"})
    else:
        req = urllib.request.Request(API + method, data=json.dumps(fields).encode(), headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return json.load(e)

me = call("getMe")["result"]["username"]
name = f"furnipart_by_{me}"
title = "FURNIPART premium"
items = json.load(open(os.path.join(HERE, "stickers.json"), encoding="utf-8"))

if call("getStickerSet", {"name": name}).get("ok"):
    print("Eski to'plam o'chirilmoqda:", call("deleteStickerSet", {"name": name}))

stickers, files = [], {}
for i, it in enumerate(items):
    key = f"s{i}"
    files[key] = os.path.join(HERE, "png", it["file"])
    stickers.append({"sticker": f"attach://{key}", "format": "static", "emoji_list": [it["emoji"]]})
r = call("createNewStickerSet", {"user_id": USER_ID, "name": name, "title": title, "stickers": json.dumps(stickers, ensure_ascii=False)}, files)
print(r)
if not r.get("ok"):
    call("sendMessage", {"chat_id": USER_ID, "text": "⚠️ Stiker to'plamini yaratib bo'lmadi: " + str(r.get("description"))})
    sys.exit(1)
link = f"https://t.me/addstickers/{name}"
call("sendMessage", {"chat_id": USER_ID, "text": f"🎉 FURNIPART stikerlari tayyor! ({len(items)} ta)\n\nQo'shish uchun bosing:\n{link}"})
print(link)
