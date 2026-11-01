#!/usr/bin/env python3
"""Video ssenariysidagi har sahna "say" matnini Google AI Studio (Gemini) ovoziga aylantiradi.

  python3 tools/tts/script_tts.py <script.json> <out_dir> [--voice Charon]
Natija: out_dir/<sahna "audio" nomi yoki sN.wav>. GEMINI_API_KEY kerak.
"""
import argparse, json, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from gemini_tts import synth, best_model

ap = argparse.ArgumentParser(); ap.add_argument("script"); ap.add_argument("out"); ap.add_argument("--voice", default="Charon"); ap.add_argument("--model")
a = ap.parse_args()
sc = json.load(open(a.script, encoding="utf-8")); out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
model = a.model or best_model()
for i, s in enumerate(sc["scenes"], 1):
    text = (s.get("say") or "").strip()
    if not text:
        continue
    name = s.get("audio") or f"s{i}.wav"
    if (out / name).exists() and (out / name).stat().st_size > 10000:
        print(f"{name}: bor, o'tkazildi"); continue  # qayta ishga tushirishda limitni tejash
    synth(text, str(out / name), a.voice, model)
    print(f"{name}: {text[:60]}…", flush=True)
print("model:", model, "ovoz:", a.voice)
