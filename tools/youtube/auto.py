#!/usr/bin/env python3
"""img/video/<sana>/reel.mp4 larni YouTube Shorts'ga avtomatik yuklash.

Har bir papka (sana >= START) uchun: reel.mp4 bor, youtube.txt yo'q bo'lsa — yuklaydi
va havolani youtube.txt ga yozadi (takror yuklanmasin).
Sarlavha = caption.txt ning 1-qatori, tavsif = caption.txt to'liq.
Chiqish vaqti: papka sanasidan keyingi kun 12:30 (Toshkent) — Instagram Reels bilan bir vaqtda;
bu vaqt o'tib ketgan bo'lsa, darhol ochiq chiqadi.

  python3 tools/youtube/auto.py            # hammasini tekshir
  python3 tools/youtube/auto.py 2026-11-15 # faqat shu papka
"""
import datetime as dt, os, pathlib, re, subprocess, sys

ROOT = pathlib.Path("img/video")
START = os.environ.get("YT_START", "2026-11-14")
TZ = dt.timezone(dt.timedelta(hours=5))
TAGS = "furnipart,mebel,furnitura,mebel bilim,margilon,fargona,uzbekistan,shorts"


def title_from(caption: str, folder: str) -> str:
    for line in caption.splitlines():
        t = re.sub(r"#\S+", "", line).strip()
        if t:
            return t[:90]
    return f"Mebelda hamma bilishi kerak — {folder}"


def publish_at(folder: str):
    d = dt.date.fromisoformat(folder[:10]) + dt.timedelta(days=1)
    at = dt.datetime(d.year, d.month, d.day, 12, 30, tzinfo=TZ)
    if at <= dt.datetime.now(TZ) + dt.timedelta(minutes=20):
        return None  # darhol
    return at.isoformat()


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else ""
    done = []
    for reel in sorted(ROOT.glob("*/reel.mp4")):
        f = reel.parent
        name = f.name
        if not re.match(r"\d{4}-\d{2}-\d{2}", name) or name[:10] < START:
            continue
        if only and name != only:
            continue
        if (f / "youtube.txt").exists():
            print(f"{name}: allaqachon yuklangan — {(f / 'youtube.txt').read_text().strip()}")
            continue
        cap_file = f / "caption.txt"
        caption = cap_file.read_text("utf-8") if cap_file.exists() else ""
        args = [sys.executable, "tools/youtube/upload.py", str(reel), "--title", title_from(caption, name), "--tags", TAGS]
        if cap_file.exists():
            args += ["--desc-file", str(cap_file)]
        at = publish_at(name)
        if at:
            args += ["--at", at]
        print(f"{name}: yuklanmoqda ({'chiqish ' + at if at else 'darhol'}) …", flush=True)
        out = subprocess.run(args, capture_output=True, text=True)
        if out.returncode != 0:
            print(out.stdout, out.stderr, sep="\n")
            raise SystemExit(f"{name}: yuklanmadi")
        url = out.stdout.strip().splitlines()[-1]
        (f / "youtube.txt").write_text(url + (f"\nchiqish: {at}" if at else "") + "\n", "utf-8")
        print(f"{name}: {url}")
        done.append(f"{name}: {url}" + (f" (chiqadi {at[:16].replace('T', ' ')})" if at else ""))
    pathlib.Path("yt_result.txt").write_text("\n".join(done), "utf-8")


if __name__ == "__main__":
    main()
