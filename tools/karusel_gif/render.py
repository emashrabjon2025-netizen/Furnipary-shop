#!/usr/bin/env python3
"""FURNIPART — 3D animatsiyali karusel (har slayd: MP4 1080x1350 + GIF).

  python3 tools/karusel_gif/render.py content.json OUT_DIR [--preview 0.5,2.5] [--fps 24] [--only 2]

content.json — tools/slayd-tarix/*.json bilan bir xil, "point" slaydlarga "anim" qo'shiladi:
  susan (karusel polka) | magic (magic corner) | hinge (keng petli) | drawer (burchakli tortma)
Yangi animatsiya kerak bo'lsa scenes.js dagi S.<nom> ga qo'shing.
Instagram karusel GIF qabul qilmaydi — Instagramga MP4, Telegram/boshqa joyga GIF.
"""
import json, sys, argparse, functools, http.server, socketserver, threading, subprocess, pathlib, time
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def serve():
    class H(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    httpd = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(H, directory=str(ROOT / "tools")))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd.server_address[1]


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("content"); ap.add_argument("out")
    ap.add_argument("--preview"); ap.add_argument("--fps", type=int, default=24); ap.add_argument("--only"); ap.add_argument("--rs", default="0.75")
    ap.add_argument("--gif-width", type=int, default=600); ap.add_argument("--gif-fps", type=int, default=12)
    a = ap.parse_args()
    data = json.load(open(a.content, encoding="utf-8")); slides = data["slides"]; n = len(slides)
    out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
    port = serve(); only = {int(x) for x in a.only.split(",")} if a.only else None
    with sync_playwright() as pw:
        br = pw.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        for i, sl in enumerate(slides, 1):
            if only and i not in only: continue
            pg = br.new_page(viewport={"width": 1080, "height": 1350})
            errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.goto(f"http://127.0.0.1:{port}/karusel_gif/engine.html?rs={a.rs}")
            try:
                pg.wait_for_function("window.ENGINE_READY === true", timeout=60000)
            except Exception:
                sys.exit(f"Sahifa yuklanmadi (slayd {i}), JS xato: {errs or 'nomaʼlum'}")
            meta = {"kategoriya": data.get("kategoriya", ""), "page": f"{i:02d} / {n:02d}", "progress": i / n}
            dur = pg.evaluate("([s, m]) => window.setup(s, m)", [sl, meta])
            if errs: sys.exit(f"JS xato (slayd {i}): {errs}")
            stem = f"slayd_{i:02d}"
            if a.preview:
                for ts in a.preview.split(","):
                    pg.evaluate(f"window.renderAt({float(ts)})"); pg.screenshot(path=str(out / f"{stem}_{float(ts):05.2f}.png"))
                pg.close(); continue
            mp4 = out / f"{stem}.mp4"; t0 = time.time()
            ff = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "image2pipe", "-framerate", str(a.fps), "-c:v", "mjpeg", "-i", "-",
                                   "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
                                   "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", str(a.fps),
                                   "-c:a", "aac", "-shortest", "-movflags", "+faststart", str(mp4)], stdin=subprocess.PIPE)
            nf = int(round(dur * a.fps))
            for f in range(nf):
                pg.evaluate(f"window.renderAt({f / a.fps})"); ff.stdin.write(pg.screenshot(type="jpeg", quality=92))
            ff.stdin.close(); ff.wait(); pg.close()
            gif = out / f"{stem}.gif"
            vf = f"fps={a.gif_fps},scale={a.gif_width}:-1:flags=lanczos,split[x][y];[x]palettegen=max_colors=128:stats_mode=diff[p];[y][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(mp4), "-vf", vf, "-loop", "0", str(gif)], check=True)
            print(f"{stem}: {dur:.1f}s, {nf} kadr, {time.time() - t0:.0f}s, gif {gif.stat().st_size // 1024} KB", flush=True)
        br.close()


if __name__ == "__main__":
    main()
