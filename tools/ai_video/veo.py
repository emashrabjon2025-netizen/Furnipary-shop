#!/usr/bin/env python3
"""Google Veo bilan qisqa video kliplar (9:16). GEMINI_API_KEY kerak.

  python3 tools/ai_video/veo.py shots.json OUT_DIR [--model veo-3.1-generate-preview] [--only 1,2]
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
    body = {"instances": [{"prompt": prompt}],
            "parameters": {"aspectRatio": "9:16", "negativePrompt": neg, "personGeneration": "allow_all"}}
    op = req(f"{API}/models/{model}:predictLongRunning", body)
    name = op["name"]; t0 = time.time()
    while not op.get("done"):
        if time.time() - t0 > 900:
            raise SystemExit("Veo: 15 daqiqada tayyor boʻlmadi")
        time.sleep(15); op = req(f"{API}/{name}")
    if "error" in op:
        raise SystemExit(f"Veo xato: {op['error']}")
    resp = op.get("response", {})
    samples = (resp.get("generateVideoResponse") or resp).get("generatedSamples") or resp.get("generatedVideos") or []
    if not samples:
        raise SystemExit(f"Veo video qaytarmadi (filtr?): {json.dumps(resp)[:500]}")
    uri = samples[0]["video"]["uri"]
    r = urllib.request.Request(uri, headers={"x-goog-api-key": KEY})
    with urllib.request.urlopen(r, timeout=300) as f:
        pathlib.Path(out).write_bytes(f.read())
    print(f"{out}: {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("shots"); ap.add_argument("out")
    ap.add_argument("--model", default="veo-3.1-generate-preview"); ap.add_argument("--only")
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
