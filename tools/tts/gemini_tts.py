#!/usr/bin/env python3
"""Google AI Studio (Gemini) TTS.  GEMINI_API_KEY kerak.

  python3 tools/tts/gemini_tts.py "matn" out.wav [--voice Charon] [--model MODEL] [--style "..."]
  python3 tools/tts/gemini_tts.py --list      # TTS modellar ro'yxati
"""
import argparse, base64, json, os, subprocess, sys, time, urllib.request, urllib.error

API = "https://generativelanguage.googleapis.com/v1beta"
STYLE = "Read the following Uzbek (Latin script) text aloud in natural Uzbek pronunciation, warm friendly male voice, calm pace:"


def call(url, body=None):
    key = os.environ["GEMINI_API_KEY"]
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body else None,
                                 headers={"Content-Type": "application/json", "x-goog-api-key": key})
    for i in range(6):  # 429/500/503 (band) — kutib qayta urinish
        try:
            return json.loads(urllib.request.urlopen(req, timeout=180).read())
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:600]
            if e.code == 429 and "per day" in msg:
                raise SystemExit(f"Gemini kunlik limit tugadi (429): {msg[:300]}")
            if e.code in (429, 500, 503) and i < 5:
                print(f"Gemini {e.code}, {15 * (i + 1)} s dan keyin qayta urinish", file=sys.stderr); time.sleep(15 * (i + 1)); continue
            raise SystemExit(f"Gemini xato {e.code}: {msg}")


def tts_models():
    d = call(f"{API}/models?pageSize=1000")
    return [m["name"].split("/", 1)[1] for m in d.get("models", []) if "tts" in m["name"]]


def best_model():
    """Eng yangi, toʻliq (lite emas, preview emas) TTS model; boʻlmasa eng yangisi."""
    import re
    ms = tts_models() or ["gemini-2.5-flash-preview-tts"]
    ver = lambda m: tuple(int(x) for x in re.findall(r"\d+", m.split("-tts")[0])[:2])
    score = lambda m: ("lite" not in m, "preview" not in m, ver(m), "pro" in m)
    return max(ms, key=score)


def synth(text, out, voice="Charon", model=None, style=STYLE):
    model = model or best_model()
    body = {"contents": [{"parts": [{"text": f"{style}\n\n{text}"}]}],
            "generationConfig": {"responseModalities": ["AUDIO"],
                                 "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}}}}
    for attempt in range(3):
        d = call(f"{API}/models/{model}:generateContent", body)
        parts = d.get("candidates", [{}])[0].get("content", {}).get("parts", [])
        data = next((p["inlineData"]["data"] for p in parts if "inlineData" in p), None)
        if data:
            break
        time.sleep(5)
    else:
        raise SystemExit(f"Audio qaytmadi: {json.dumps(d)[:400]}")
    pcm = base64.b64decode(data)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", "-", out], input=pcm, check=True)
    return model


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("text", nargs="?"); ap.add_argument("out", nargs="?")
    ap.add_argument("--voice", default="Charon"); ap.add_argument("--model"); ap.add_argument("--style", default=STYLE); ap.add_argument("--list", action="store_true")
    a = ap.parse_args()
    if a.list:
        print("\n".join(tts_models())); sys.exit()
    print("model:", synth(a.text, a.out, a.voice, a.model, a.style))
