#!/usr/bin/env python3
"""FURNIPART kanal oproslari.

  python tools/opros/opros.py ertalab   # 09:00 — qiziqarli / viktorina
  python tools/opros/opros.py kunduz    # 15:00 — og'riq + sotuvga chorlash
  python tools/opros/opros.py auto      # Toshkent soatiga qarab o'zi tanlaydi
  python tools/opros/opros.py check     # faqat tekshiradi, hech narsa yubormaydi
  python tools/opros/opros.py natija    # 7 kun bo'lgan oproslarni yopib, foizlarini botga yuboradi

Yuborilgan oproslar sent.json ga yoziladi (message_id), 7 kundan keyin natija shu orqali olinadi.

Navbat holat saqlamaydi: kun raqami bo'yicha hisoblanadi, har kuni boshqa opros chiqadi.
"""
import datetime as dt, json, os, sys, urllib.error, urllib.request
from pathlib import Path

TZ = dt.timezone(dt.timedelta(hours=5))
POLLS = json.loads((Path(__file__).parent / "polls.json").read_text(encoding="utf-8"))
SENT = Path(__file__).parent / "sent.json"
REPORT_AFTER = dt.timedelta(days=7) - dt.timedelta(hours=2)  # GitHub kechikishiga zaxira


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


def load_sent():
    return json.loads(SENT.read_text(encoding="utf-8")) if SENT.exists() else []


def save_sent(items):
    SENT.write_text(json.dumps(items, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def bar(pct):
    full = round(pct / 10)
    return "▓" * full + "░" * (10 - full)


def report(chat):
    admin = os.environ.get("ADMIN_CHAT") or "5345741396"
    items, now, changed = load_sent(), dt.datetime.now(TZ), False
    for it in items:
        if it.get("reported") or now - dt.datetime.fromisoformat(it["sent_at"]) < REPORT_AFTER:
            continue
        token = os.environ["TELEGRAM_BOT_TOKEN"]
        req = urllib.request.Request(f"https://api.telegram.org/bot{token}/stopPoll",
                                     data=json.dumps({"chat_id": chat, "message_id": it["message_id"]}).encode(),
                                     headers={"Content-Type": "application/json"})
        try:
            poll = json.loads(urllib.request.urlopen(req, timeout=30).read())["result"]
        except urllib.error.HTTPError as e:
            print("stopPoll xato:", it["question"], e.code, e.read().decode())
            it["reported"] = "xato"; changed = True
            continue
        total = poll["total_voter_count"]
        opts = sorted(poll["options"], key=lambda o: -o["voter_count"])
        correct = poll.get("correct_option_id")
        right = poll["options"][correct]["text"] if correct is not None else None
        lines = [f"📊 Opros natijasi (7 kun) — {it['date']} {'09:00' if it['slot'] == 'ertalab' else '15:00'}",
                 "", f"❓ {poll['question']}", ""]
        for o in opts:
            pct = 100 * o["voter_count"] / total if total else 0
            mark = " ✅" if o["text"] == right else ""
            lines.append(f"{bar(pct)} {pct:.0f}% — {o['text']}{mark} ({o['voter_count']})")
        lines += ["", f"👥 Jami ovoz: {total}"]
        if total and it["slot"] == "kunduz":
            lines.append(f"🔥 Eng ko'p tanlangan og'riq: «{opts[0]['text']}» — shu mavzuda Reels/reklama qiling")
        link = f"https://t.me/{chat.lstrip('@')}/{it['message_id']}" if chat.startswith("@") else ""
        if link:
            lines.append(f"🔗 {link}")
        tg("sendMessage", {"chat_id": admin, "text": "\n".join(lines), "disable_web_page_preview": True})
        print("Natija yuborildi:", poll["question"], total)
        it["reported"] = now.isoformat(timespec="minutes"); changed = True
    if changed:
        save_sent(items)


def main():
    validate()
    slot = sys.argv[1] if len(sys.argv) > 1 else "auto"
    if slot == "check":
        for s in ("ertalab", "kunduz"):
            print(s, len(POLLS[s]), "ta | bugun:", pick(s)["question"])
        return
    chat = os.environ.get("TELEGRAM_CHANNEL", "@Furnipart_uz")
    if slot == "natija":
        report(chat)
        return
    if slot == "auto":
        slot = "ertalab" if dt.datetime.now(TZ).hour < 12 else "kunduz"
    p = pick(slot)
    payload = {"chat_id": chat, "question": p["question"], "options": p["options"], "is_anonymous": True}
    if p.get("quiz"):
        payload.update(type="quiz", correct_option_id=p["correct"])
        if p.get("explanation"):
            payload["explanation"] = p["explanation"]
    msg = tg("sendPoll", payload)
    print("Opros yuborildi:", slot, p["question"])
    now = dt.datetime.now(TZ)
    items = load_sent()
    items.append({"message_id": msg["message_id"], "slot": slot, "date": now.date().isoformat(),
                  "sent_at": now.isoformat(timespec="minutes"), "question": p["question"]})
    save_sent(items)
    if p.get("cta"):
        tg("sendMessage", {"chat_id": chat, "text": p["cta"], "reply_to_message_id": msg["message_id"],
                           "disable_web_page_preview": True})
        print("CTA yuborildi")


if __name__ == "__main__":
    main()
