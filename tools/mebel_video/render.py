#!/usr/bin/env python3
"""FURNIPART "Mebel bilim" — 3D animatsiyali Reels video (1080x1920, 30fps, MP4).

Foydalanish:
  python3 tools/mebel_video/render.py script.json out.mp4 [--audio-dir DIR] [--preview 1.5,8.2] [--fps 30]

script.json:
{
  "rubric": "MEBEL BILIM",
  "scenes": [
    {"head": "*LDSP* nima?",            # tepadagi katta sarlavha (*sariq*, !qizil!, +yashil+)
     "sub":  "qisqa izoh (ixtiyoriy)",
     "say":  "TTS uchun matn (o'zbekcha, ' bilan)",
     "show": "Ekrandagi subtitr matni (*kalit so'z* sariq)",
     "audio": "s1.wav",                  # --audio-dir ichidagi ovoz fayli (yo'q bo'lsa jim, so'z soniga qarab vaqt)
     "visual": {"type": "boards|layers|edge|single|cabinet|mattress|checklist|logo", ...}}
  ]
}
Presetlar parametrlari engine.js da (P.<nom>) yozilgan. Yangi vizual kerak bo'lsa engine.js ga yangi preset qo'shing.
--preview: faqat shu soniyalardagi kadrlarni PNG qilib saqlaydi (tekshirish uchun).
Ovoz: tozalanadi (highpass, de-esser, kompressor), fon musiqasi + whoosh sintez qilinadi, ovoz ostida musiqa pasayadi, yakuniy -14 LUFS.
"""
import json, sys, os, subprocess, threading, argparse, functools, http.server, socketserver, tempfile, pathlib
import numpy as np
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
SR = 48000


def probe_dur(p):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)]).strip())


def load_voice(p, tmp):
    """clean voice -> float32 mono 48k"""
    out = pathlib.Path(tmp) / (pathlib.Path(p).stem + "_clean.f32")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(p), "-af",
                    "highpass=f=75,lowpass=f=15000,deesser=i=0.35,acompressor=threshold=-21dB:ratio=2.6:attack=6:release=120:makeup=2,"
                    "equalizer=f=180:t=q:w=1:g=1.5,equalizer=f=3200:t=q:w=1.2:g=1.2,"
                    "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse",
                    "-ac", "1", "-ar", str(SR), "-f", "f32le", str(out)], check=True)
    return np.fromfile(out, dtype=np.float32)


def onepole_lp(x, a):
    y = np.empty_like(x); s = 0.0
    for i in range(len(x)):
        s += a * (x[i] - s); y[i] = s
    return y


def music_bed(total, seed=1):
    """Soft warm pad (Am-F-C-G) + gentle pluck arpeggio + sub; stereo."""
    rng = np.random.default_rng(seed); n = int(total * SR); t = np.arange(n) / SR
    L = np.zeros(n); R = np.zeros(n)
    chords = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 55, 60, 64], [55, 59, 62, 67]]  # Am F C G
    bar = 4.0; f = lambda m: 440 * 2 ** ((m - 69) / 12)
    for bi in range(int(total / bar) + 2):
        ch = chords[bi % 4]; s0 = int(bi * bar * SR); s1 = min(n, int((bi + 1) * bar * SR + 1.2 * SR))
        if s0 >= n: break
        tt = np.arange(s1 - s0) / SR; env = np.minimum(1, tt / 1.2) * np.exp(-np.maximum(0, tt - bar) * 3)
        for k, m in enumerate(ch):
            for det, pan in ((-0.07, 0.3), (0.07, 0.7)):
                fr = f(m) * 2 ** (det / 12)
                w = 0.6 * np.sin(2 * np.pi * fr * tt) + 0.18 * np.sin(4 * np.pi * fr * tt) + 0.06 * np.sin(6 * np.pi * fr * tt)
                L[s0:s1] += w * env * 0.030 * (1 - pan); R[s0:s1] += w * env * 0.030 * pan
        # sub bass root
        root = f(ch[0] - 12); w = np.sin(2 * np.pi * root * tt) * env * 0.05; L[s0:s1] += w; R[s0:s1] += w
        # pluck arpeggio (8th notes)
        arp = ch + [ch[1] + 12, ch[2] + 12]
        for j in range(8):
            p0 = s0 + int(j * bar / 8 * SR)
            if p0 >= n: break
            m = arp[(j * 3 + bi) % len(arp)] + 12; d = int(0.9 * SR); p1 = min(n, p0 + d); tp = np.arange(p1 - p0) / SR
            w = (np.sin(2 * np.pi * f(m) * tp) + 0.3 * np.sin(4 * np.pi * f(m) * tp)) * np.exp(-tp * 5.5) * 0.020
            pan = 0.5 + 0.35 * np.sin(j); L[p0:p1] += w * (1 - pan); R[p0:p1] += w * pan
    # simple stereo echo
    for dly, g in ((0.375, 0.28), (0.75, 0.14)):
        d = int(dly * SR); L[d:] += R[:-d] * g; R[d:] += L[:-d] * g
    return np.stack([L, R], 1)


def whoosh(dur=0.55, seed=0):
    rng = np.random.default_rng(seed); n = int(dur * SR); x = rng.standard_normal(n)
    tt = np.arange(n) / n; a = 0.02 + 0.25 * np.sin(np.pi * tt) ** 2
    y = np.empty(n); s = 0.0
    for i in range(n):
        s += a[i] * (x[i] - s); y[i] = s
    y = y - onepole_lp(y, 0.01); env = np.sin(np.pi * tt) ** 1.5
    return y * env * 0.5


def pop(seed=0):
    n = int(0.09 * SR); tt = np.arange(n) / SR
    return (np.sin(2 * np.pi * (900 - 4000 * tt) * tt) * np.exp(-tt * 55)) * 0.18


def serve(root):
    class H(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    httpd = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(H, directory=str(root)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd.server_address[1]


def render_range(port, sc, f0, f1, fps, out, verbose):
    with sync_playwright() as pw:
        br = pw.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        pg = br.new_page(viewport={"width": 1080, "height": 1920})
        pg.goto(f"http://127.0.0.1:{port}/engine.html"); pg.wait_for_function("window.ENGINE_READY === true", timeout=60000)
        pg.evaluate("s => window.setup(s)", sc)
        ff = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "image2pipe", "-framerate", str(fps), "-c:v", "mjpeg", "-i", "-",
                               "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", "-r", str(fps), out], stdin=subprocess.PIPE)
        import time; t0 = time.time()
        for i in range(f0, f1):
            pg.evaluate(f"window.renderAt({i / fps})"); ff.stdin.write(pg.screenshot(type="jpeg", quality=93))
            if verbose and (i - f0) % 150 == 0: print(f"kadr {i - f0}/{f1 - f0}  {time.time() - t0:.0f}s", flush=True)
        ff.stdin.close(); ff.wait(); br.close()


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("script"); ap.add_argument("out")
    ap.add_argument("--audio-dir", default=None); ap.add_argument("--preview", default=None); ap.add_argument("--fps", type=int, default=30); ap.add_argument("--workers", type=int, default=2)
    a = ap.parse_args()
    sc = json.load(open(a.script, encoding="utf-8")); tmp = tempfile.mkdtemp()
    adir = pathlib.Path(a.audio_dir) if a.audio_dir else pathlib.Path(a.script).parent
    voices = []
    for s in sc["scenes"]:
        p = adir / s["audio"] if s.get("audio") else None
        if p and p.exists():
            v = load_voice(p, tmp); s["voiceDur"] = len(v) / SR; s["voiceAt"] = 0.25
            s["dur"] = round(s["voiceAt"] + s["voiceDur"] + s.get("tail", 0.45), 3)
        else:
            v = None; words = len((s.get("say") or s.get("show") or "").split())
            s.setdefault("dur", max(2.8, words / 2.4 + 0.8)); s["voiceAt"] = 0.25; s["voiceDur"] = s["dur"] - 0.7
        voices.append(v)
    port = serve(HERE)
    with sync_playwright() as pw:
        br = pw.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--disable-web-security"])
        pg = br.new_page(viewport={"width": 1080, "height": 1920})
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
        pg.goto(f"http://127.0.0.1:{port}/engine.html"); pg.wait_for_function("window.ENGINE_READY === true", timeout=60000)
        total = pg.evaluate("s => window.setup(s)", sc)
        if errs: print("JS xatolar:", errs, file=sys.stderr)
        if a.preview:
            outd = pathlib.Path(a.out); outd.mkdir(parents=True, exist_ok=True)
            for ts in a.preview.split(","):
                pg.evaluate(f"window.renderAt({float(ts)})"); pg.screenshot(path=str(outd / f"preview_{float(ts):06.2f}.png"))
            print("preview ->", outd, "total", total); br.close(); return
        br.close()
    nfr = int(total * a.fps); vid = pathlib.Path(tmp) / "v.mp4"
    nw = max(1, min(a.workers, os.cpu_count() or 1)); per = -(-nfr // nw); segs = []
    import multiprocessing as mp, time
    t0 = time.time(); procs = []
    for w in range(nw):
        f0, f1 = w * per, min(nfr, (w + 1) * per); seg = pathlib.Path(tmp) / f"seg{w}.mp4"; segs.append(seg)
        pr = mp.Process(target=render_range, args=(port, sc, f0, f1, a.fps, str(seg), w == 0)); pr.start(); procs.append(pr)
    for pr in procs:
        pr.join()
        if pr.exitcode != 0: sys.exit("render worker xato")
    print(f"kadrlar tayyor: {nfr} ta, {time.time() - t0:.0f}s", flush=True)
    lst = pathlib.Path(tmp) / "segs.txt"; lst.write_text("".join(f"file '{x}'\n" for x in segs))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(vid)], check=True)
    # ---- audio mix ----
    n = int(total * SR) + SR; mix = np.zeros((n, 2)); vt = np.zeros(n)
    t = 0.0; bounds = []
    for s, v in zip(sc["scenes"], voices):
        bounds.append(t)
        if v is not None:
            p0 = int((t + s["voiceAt"]) * SR); vt[p0:p0 + len(v)] += v[: max(0, n - p0)]
        t += s["dur"]
    bed = music_bed(total + 1, seed=len(sc["scenes"]))[:n]
    # ducking envelope from voice
    env = onepole_lp(np.abs(vt).astype(np.float64), 0.0015); env = env / (env.max() + 1e-9)
    duck = 1 - 0.72 * np.clip(env * 3, 0, 1); fade = np.minimum(1, np.arange(n) / SR / 1.0) * np.clip((total + .2 - np.arange(n) / SR) / 1.2, 0, 1)
    has_voice = any(v is not None for v in voices)
    mgain = 0.55 if has_voice else 0.9
    mix += bed * (duck * fade * mgain)[:, None]
    for i, b in enumerate(bounds[1:], 1):
        w = whoosh(seed=i); p0 = int(max(0, b - 0.3) * SR); mix[p0:p0 + len(w)] += (w * 0.35)[:, None]
    mix += np.stack([vt, vt], 1) * 1.0
    pk = np.abs(mix).max() + 1e-9; mix = mix / pk * 0.9
    raw = pathlib.Path(tmp) / "mix.f32"; mix.astype(np.float32).tofile(raw)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", str(raw), "-i", str(vid),
                    "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-map", "1:v", "-map", "0:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
                    "-shortest", "-movflags", "+faststart", a.out], check=True)
    print("tayyor:", a.out, f"{total:.1f}s")


if __name__ == "__main__":
    main()
