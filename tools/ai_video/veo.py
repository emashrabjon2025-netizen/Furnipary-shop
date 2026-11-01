#!/usr/bin/env python3
"""Google Gemini Omni Flash bilan qisqa video kliplar (9:16). GEMINI_API_KEY kerak.

  python3 tools/ai_video/veo.py shots.json OUT_DIR [--model gemini-omni-1.1-flash] [--only 1,2]
shots.json: {"shots": [{"prompt": "...", "say": "..."}, ...]}  -> OUT_DIR/clipN.mp4
Mavjud clipN.mp4 qayta yaratilmaydi (limit/pulni tejash).
"""
import argparse, json, os, pathlib, sys, time, urllib.request, urllib.error

API = "https://generativelanguage.googleapis.com/v1beta"
KEY = os.environ.get("GEMINI_API_KEY", "")


def req(url, body=None):
    r = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                               headers={"Content-Type": "application/json", "x-goog-api-key": KEY})
    try:
        return json.loads(urllib.request.urlopen(r, timeout=120).read())
    except urllib.error.HTTPError as e:
        raise SystemExit(f"Veo xato {e.code}: {e.read().decode()[:700]}")


def gen(prompt, out, model, neg):
    """Gemini Omni Flash (Interactions API): 9:16 video, natija fayl URI orqali."""
    body = {"model": model, "input": f"{prompt} Avoid: {neg}. No dialogue, no speech, only quiet natural ambient sound.",
            "response_format": {"type": "video", "aspect_ratio": "9:16", "resolution": "720p", "delivery": "uri"}}
    t0 = time.time()
    resp = req(f"{API}/interactions", body)
    uri = None
    for st in resp.get("steps", []) or []:
        for c in st.get("content", []) or []:
            if c.get("type") == "video" and c.get("uri"):
                uri = c["uri"]
    if not uri:
        raise SystemExit(f"Video qaytmadi (filtr yoki limit?): {json.dumps(resp)[:700]}")
    fid = uri.split("/files/")[1].split(":")[0].split("?")[0]
    while True:
        st = req(f"{API}/files/{fid}").get("state")
        if st == "ACTIVE": break
        if st == "FAILED": raise SystemExit("Video yaratish muvaffaqiyatsiz (FAILED)")
        if time.time() - t0 > 1200: raise SystemExit("Video 20 daqiqada tayyor boʻlmadi")
        time.sleep(10)
    r = urllib.request.Request(f"{API}/files/{fid}:download?alt=media", headers={"x-goog-api-key": KEY})
    with urllib.request.urlopen(r, timeout=300) as f:
        pathlib.Path(out).write_bytes(f.read())
    print(f"{out}: {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("shots"); ap.add_argument("out")
    ap.add_argument("--model", default="gemini-omni-1.1-flash"); ap.add_argument("--only")
    a = ap.parse_args()
    d = json.load(open(a.shots, encoding="utf-8")); out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
    only = {int(x) for x in a.only.split(",")} if a.only else None
    style = d.get("style", "")
    neg = d.get("negative", "text, captions, subtitles, watermark, logo, brand names, distorted hands, extra fingers")
    for i, s in enumerate(d["shots"], 1):
        if only and i not in only: continue
        p = out / f"clip{i}.mp4"
        if p.exists() and p.stat().st_size > 50000:
            print(f"{p}: bor"); continue
        gen(f"{s['prompt']} {style}".strip(), str(p), a.model, neg)
