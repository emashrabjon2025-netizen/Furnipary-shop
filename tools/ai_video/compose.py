#!/usr/bin/env python3
"""AI kliplar + Charon ovozi + matn + FURNIPART logosi -> tayyor Reels (1080x1920, 30fps, -14 LUFS).

  python3 tools/ai_video/compose.py shots.json CLIPS_DIR AUDIO_DIR out.mp4 [--speed 1.08]
shots.json: veo.py formati ("shots" + "cta"). CLIPS_DIR/clipN.mp4, AUDIO_DIR/sN.wav (N = 1.. , oxirgisi cta).
"show" matnida *so'z* sariq bo'ladi. CTA sahnasi oxirgi klip ustida (xira) logo bilan chiqadi.
"""
import argparse, json, pathlib, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/mebel_video"))
from render import load_voice, music_bed, whoosh, onepole_lp, SR  # noqa: E402

W, H, FPS = 1080, 1920, 30
YEL = (255, 212, 0); WHITE = (255, 255, 255)
FD = "/usr/share/fonts/opentype/inter/"
F_HEAD = ImageFont.truetype(FD + "Inter-ExtraBold.otf", 84)
F_SMALL = ImageFont.truetype(FD + "Inter-Bold.otf", 40)
F_TAG = ImageFont.truetype(FD + "Inter-Bold.otf", 34)


def run(*a): subprocess.run(a, check=True)


def wrap(words, font, maxw, d):
    lines, cur = [], []
    for w in words:
        t = " ".join(x for x, _ in cur + [w])
        if cur and d.textlength(t, font=font) > maxw:
            lines.append(cur); cur = [w]
        else:
            cur.append(w)
    if cur: lines.append(cur)
    return lines


def text_png(show, out, tag=None):
    """Markazdagi katta sarlavha (*sariq*), soya bilan + tepada kichik yorliq."""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    words = []
    hl = False
    for tok in show.split(" "):
        h0 = tok.startswith("*"); h1 = tok.endswith("*")
        if h0: hl = True
        words.append((tok.strip("*").upper(), hl))
        if h1: hl = False
    lines = wrap(words, F_HEAD, W - 160, d)
    lh = 100; y0 = 1180 - len(lines) * lh // 2  # pastki 350px bo'sh qoladi
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0)); sd = ImageDraw.Draw(shadow)
    for li, ln in enumerate(lines):
        total = d.textlength(" ".join(w for w, _ in ln), font=F_HEAD); x = (W - total) / 2; y = y0 + li * lh
        for w, h in ln:
            sd.text((x, y + 4), w, font=F_HEAD, fill=(0, 0, 0, 200))
            d.text((x, y), w, font=F_HEAD, fill=YEL if h else WHITE)
            x += d.textlength(w + " ", font=F_HEAD)
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    im = Image.alpha_composite(shadow, im)
    if tag:
        d = ImageDraw.Draw(im); tw = d.textlength(tag, font=F_TAG)
        d.rounded_rectangle(((W - tw) / 2 - 28, y0 - 110, (W + tw) / 2 + 28, y0 - 50), 30, fill=YEL)
        d.text(((W - tw) / 2, y0 - 102), tag, font=F_TAG, fill=(0, 0, 0))
    im.save(out)


def logo_png(out, size=150):
    lg = Image.open(ROOT / "img/brand-logo-mark.jpg").convert("RGBA").resize((size, size), Image.LANCZOS)
    m = Image.new("L", (size, size), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, size, size), size // 5, fill=255)
    lg.putalpha(m); im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); im.paste(lg, (W - size - 50, 120), lg); im.save(out)


def cta_png(show, out):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    s = 420; lg = Image.open(ROOT / "img/brand-logo-mark.jpg").convert("RGBA").resize((s, s), Image.LANCZOS)
    m = Image.new("L", (s, s), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, s, s), 70, fill=255); lg.putalpha(m)
    im.paste(lg, ((W - s) // 2, 420), lg)
    words = [(w.upper(), False) for w in show.split(" ")]
    for li, ln in enumerate(wrap(words, F_HEAD, W - 160, d)):
        t = " ".join(w for w, _ in ln); x = (W - d.textlength(t, font=F_HEAD)) / 2
        d.text((x, 940 + li * 100), t, font=F_HEAD, fill=WHITE)
    for i, t in enumerate(["@furnipart.uz  ·  +998 91 125 9000", "Marg'ilon · O'zbekiston bo'ylab dastavka"]):
        d.text(((W - d.textlength(t, font=F_SMALL)) / 2, 1290 + i * 62), t, font=F_SMALL, fill=YEL if i == 0 else WHITE)
    im.save(out)


def main():
    ap = argparse.ArgumentParser(); [ap.add_argument(x) for x in ("shots", "clips", "audio", "out")]
    ap.add_argument("--speed", type=float, default=1.12); a = ap.parse_args()
    d = json.load(open(a.shots, encoding="utf-8")); scenes = d["shots"] + [d["cta"]]
    tmp = pathlib.Path(tempfile.mkdtemp()); clips = pathlib.Path(a.clips); aud = pathlib.Path(a.audio)
    voices, durs = [], []
    for i in range(1, len(scenes) + 1):
        src = aud / f"s{i}.wav"; fast = tmp / f"v{i}.wav"
        run("ffmpeg", "-v", "error", "-y", "-i", str(src), "-af", f"silenceremove=stop_periods=-1:stop_duration=0.3:stop_threshold=-40dB:stop_silence=0.22,atempo={a.speed}", str(fast))
        v = load_voice(fast, tmp); voices.append(v); durs.append(len(v) / SR + 0.45)
    logo_png(tmp / "logo.png"); Image.new("RGBA", (W, H), (0, 0, 0, 0)).save(tmp / "empty.png"); segs = []
    nclips = len(d["shots"])
    for i, (s, dur) in enumerate(zip(scenes, durs), 1):
        is_cta = i == len(scenes)
        src = clips / f"clip{min(i, nclips)}.mp4"
        ov = tmp / f"t{i}.png"
        (cta_png(s["show"], ov) if is_cta else text_png(s["show"], ov, s.get("tag")))
        base = (f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1,fps={FPS},"
                f"eq=saturation=0.92:contrast=1.04,"
                f"zoompan=z='min(1+0.0009*on,1.12)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s={W}x{H}:fps={FPS}")
        if is_cta: base += ",gblur=sigma=28,eq=brightness=-0.32"
        lgo = tmp / ("empty.png" if is_cta else "logo.png")
        vf = (f"[0:v]{base},trim=0:{dur:.3f},setpts=PTS-STARTPTS[b];"
              f"[1:v]format=rgba,fade=in:st=0.15:d=0.35:alpha=1[t];[2:v]format=rgba[l];"
              f"[b][t]overlay=0:0:shortest=1[x];[x][l]overlay=0:0:shortest=1,format=yuv420p[o]")
        seg = tmp / f"seg{i}.mp4"
        run("ffmpeg", "-v", "error", "-y", "-stream_loop", "-1", "-i", str(src), "-loop", "1", "-i", str(ov), "-loop", "1", "-i", str(lgo),
            "-filter_complex", vf, "-map", "[o]", "-t", f"{dur:.3f}", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-r", str(FPS), str(seg))
        segs.append(seg); print(f"sahna {i}: {dur:.1f}s", flush=True)
    lst = tmp / "l.txt"; lst.write_text("".join(f"file '{x}'\n" for x in segs)); vid = tmp / "v.mp4"
    run("ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(vid))
    total = sum(durs); n = int(total * SR) + SR; vt = np.zeros(n); mix = np.zeros((n, 2)); t = 0.0; bounds = []
    for v, dur in zip(voices, durs):
        bounds.append(t); p0 = int((t + 0.15) * SR); vt[p0:p0 + len(v)] += v[: n - p0]; t += dur
    bed = music_bed(total + 1, seed=7)[:n]
    env = onepole_lp(np.abs(vt), 0.0015); env /= env.max() + 1e-9
    duck = 1 - 0.72 * np.clip(env * 3, 0, 1); ts = np.arange(n) / SR
    fade = np.minimum(1, ts / 1.0) * np.clip((total + .2 - ts) / 1.2, 0, 1)
    mix += bed * (duck * fade * 0.55)[:, None]
    for i, b in enumerate(bounds[1:], 1):
        w = whoosh(seed=i); p0 = int(max(0, b - 0.3) * SR); mix[p0:p0 + len(w)] += (w * 0.35)[:, None]
    mix += np.stack([vt, vt], 1); mix = mix / (np.abs(mix).max() + 1e-9) * 0.9
    raw = tmp / "m.f32"; mix.astype(np.float32).tofile(raw)
    run("ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", str(raw), "-i", str(vid),
        "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-map", "1:v", "-map", "0:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-ar", "48000", "-shortest", "-movflags", "+faststart", a.out)
    print("tayyor:", a.out, f"{total:.1f}s")


if __name__ == "__main__":
    main()
