#!/usr/bin/env python3
"""Qo'ng'iroq bot ssenariysini Google AI Studio ovozlarida yozadi (namuna qo'ng'iroq).
  python3 tools/callbot/demo.py tools/callbot/scenario.json out.mp3
"""
import json, os, subprocess, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tts"))
from gemini_tts import synth, best_model

STYLES = {
    "bot": "Read aloud in natural Uzbek (Latin script). You are a polite, warm, confident female sales assistant of a furniture shop speaking on the phone. Natural pace, friendly smile in the voice:",
    "client": "Read aloud in natural Uzbek (Latin script). You are an ordinary male customer answering a phone call, relaxed and casual:",
}

def main(src, out):
    sc = json.load(open(src, encoding="utf-8"))
    model = best_model()
    voices = {"bot": sc.get("bot_voice", "Kore"), "client": sc.get("client_voice", "Charon")}
    parts = []
    for i, (who, text) in enumerate(sc["turns"]):
        f = f"t{i:02d}.wav"
        synth(text, f, voices[who], model, STYLES[who])
        parts.append(f)
    # bo'laklar orasida 0.45 s jimlik, telefon ovoziga yaqinlashtirish uchun yengil filtr
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "0.45", "gap.wav"], check=True)
    with open("list.txt", "w") as fh:
        for p in parts:
            fh.write(f"file '{p}'\nfile 'gap.wav'\n")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", "list.txt",
                    "-af", "highpass=f=200,lowpass=f=3800", "-c:a", "libmp3lame", "-b:a", "128k", out], check=True)
    print("model:", model)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
