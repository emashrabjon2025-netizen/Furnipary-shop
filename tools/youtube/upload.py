#!/usr/bin/env python3
"""YouTube'ga (Shorts) toʻgʻridan-toʻgʻri yuklash — Metricool'siz.
Kerak: YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN (GitHub secrets).

  python3 tools/youtube/upload.py video.mp4 --title "..." [--desc-file caption.txt] [--tags a,b] [--privacy public] [--at 2026-11-03T12:30:00+05:00]
--at berilsa video "private" boʻlib yuklanadi va oʻsha vaqtda YouTube oʻzi ommaviy qiladi.
"""
import argparse, json, os, pathlib, sys, urllib.parse, urllib.request, urllib.error


def http(url, data=None, headers=None, method=None):
    r = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(r, timeout=600) as f:
            return f.status, dict(f.headers), f.read()
    except urllib.error.HTTPError as e:
        raise SystemExit(f"YouTube xato {e.code}: {e.read().decode()[:600]}")


def token():
    body = urllib.parse.urlencode({"client_id": os.environ["YT_CLIENT_ID"], "client_secret": os.environ["YT_CLIENT_SECRET"],
                                   "refresh_token": os.environ["YT_REFRESH_TOKEN"], "grant_type": "refresh_token"}).encode()
    return json.loads(http("https://oauth2.googleapis.com/token", body, {"Content-Type": "application/x-www-form-urlencoded"})[2])["access_token"]


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("video"); ap.add_argument("--title", required=True)
    ap.add_argument("--desc", default=""); ap.add_argument("--desc-file"); ap.add_argument("--tags", default="")
    ap.add_argument("--privacy", default="public"); ap.add_argument("--at"); ap.add_argument("--category", default="26")  # 26 = Howto & Style
    a = ap.parse_args()
    desc = pathlib.Path(a.desc_file).read_text("utf-8") if a.desc_file else a.desc
    title = a.title if "#shorts" in a.title.lower() else (a.title[:90] + " #shorts")
    status = {"privacyStatus": a.privacy, "selfDeclaredMadeForKids": False}
    if a.at:
        status = {"privacyStatus": "private", "publishAt": a.at, "selfDeclaredMadeForKids": False}
    meta = {"snippet": {"title": title[:100], "description": desc[:4900], "categoryId": a.category, "defaultLanguage": "uz",
                        "tags": [t.strip() for t in a.tags.split(",") if t.strip()]}, "status": status}
    tok = token(); size = pathlib.Path(a.video).stat().st_size
    _, h, _ = http("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
                   json.dumps(meta).encode(), {"Authorization": f"Bearer {tok}", "Content-Type": "application/json; charset=UTF-8",
                                               "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": str(size)})
    loc = h.get("Location") or h.get("location")
    _, _, b = http(loc, pathlib.Path(a.video).read_bytes(), {"Authorization": f"Bearer {tok}", "Content-Type": "video/mp4"}, "PUT")
    vid = json.loads(b)["id"]
    print(f"https://www.youtube.com/shorts/{vid}")


if __name__ == "__main__":
    main()
