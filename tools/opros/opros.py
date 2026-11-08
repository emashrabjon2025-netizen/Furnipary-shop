#!/usr/bin/env python3
"""FURNIPART kanal oproslari.

  python tools/opros/opros.py ertalab   # 09:00 — qiziqarli / viktorina
  python tools/opros/opros.py kunduz    # 15:00 — og'riq + sotuvga chorlash
  python tools/opros/opros.py auto      # Toshkent soatiga qarab o'zi tanlaydi
  python tools/opros/opros.py check     # faqat tekshiradi, hech narsa yubormaydi

Navbat holat saqlamaydi: kun raqami bo'yicha hisoblanadi, har kuni boshqa opros chiqadi.
"""
import datetime as dt, json, os, sys, urllib.error, urllib.request
from pathlib import Path

TZ = dt.timezone(dt.timedelta(hours=5))
POLLS = json.loads((Path(__file__).parent / "polls.json").read_text(encoding="utf-8"))


def validate():
    for slot in ("ertalab", "kunduz"):
        for i, p in enumerate(POLLS[slot]):
            where = f"{slot}[{i}]"
            assert len(p["question"]) <= 300, where + " savol uzun"
            assert 2 <= len(p["options"]) <= 10, where + " variantlar soni"
            assert all(1 <= len(o) <= 100 for o in p["options"]), where + " variant uzun"
            if p.get("quiz"):
                assert 0 <= p["correct"] < len(p["options"]), where + " correct"
                assert len(p.get("explanation", "")) <= 200, where + " izoh uzun"


def pick(slot, today=None):
    today = today or dt.datetime.now(TZ).date()
    items = POLLS[slot]
    return items[today.toordinal() % len(items)]


def tg(method, payload):
    token = os.environ["TELEGRAM_BOT_TOKEN"]
    req = urllib.request.Request(f"https://api.telegram.org/bot{token}/{method}",
                                 data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=30).read())["result"]
    except urllib.error.HTTPError as e:
        sys.exit(f"Telegram xato {method}: {e.code} {e.read().decode()}")


def main():
    validate()
    slot = sys.argv[1] if len(sys.argv) > 1 else "auto"
    if slot == "check":
        for s in ("ertalab", "kunduz"):
            print(s, len(POLLS[s]), "ta | bugun:", pick(s)["question"])
        return
    if slot == "auto":
        slot = "ertalab" if dt.datetime.now(TZ).hour < 12 else "kunduz"
    p = pick(slot)
    chat = os.environ.get("TELEGRAM_CHANNEL", "@Furnipart_uz")
    payload = {"chat_id": chat, "question": p["question"], "options": p["options"], "is_anonymous": True}
    if p.get("quiz"):
        payload.update(type="quiz", correct_option_id=p["correct"])
        if p.get("explanation"):
            payload["explanation"] = p["explanation"]
    msg = tg("sendPoll", payload)
    print("Opros yuborildi:", slot, p["question"])
    if p.get("cta"):
        tg("sendMessage", {"chat_id": chat, "text": p["cta"], "reply_to_message_id": msg["message_id"],
                           "disable_web_page_preview": True})
        print("CTA yuborildi")


if __name__ == "__main__":
    main()
