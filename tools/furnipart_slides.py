#!/usr/bin/env python3
"""FURNIPART premium — Instagram karusel slayd generatori.
Foydalanish: python3 furnipart_slides.py content.json out_dir
content.json:
{
  "kategoriya": "BLUM",                      # OSHXONA / GARDEROB / MATRAS / BLUM
  "slides": [
    {"type": "cover", "kicker": "...", "title": "...", "accent": "...", "sub": "..."},
    {"type": "point", "num": "01", "title": "...", "text": "...", "tag": "..."},
    {"type": "list",  "title": "...", "items": ["...", "..."]},
    {"type": "cta",   "title": "...", "text": "..."}
  ]
}
Format: 1080x1350 PNG. Ranglar: limon-sariq #FFE135 va qora.
"""
import json, sys, html, pathlib
from playwright.sync_api import sync_playwright

Y = "#FFE135"; K = "#0E0E0E"; W = "#FFFFFF"

LOGO = f"""
<div class="logo">
  <svg width="64" height="64" viewBox="0 0 64 64">
    <path class="corner" d="M0 0H64V14H14V64H0Z"/>
    <path d="M22 22H52V31H31V37H46V46H31V58H22Z" fill="currentColor"/>
  </svg>
  <div class="lw"><span class="furni">FURNI</span><span class="part">PART</span><div class="prem">premium</div></div>
</div>"""

CSS = f"""
*{{margin:0;padding:0;box-sizing:border-box}}
body{{width:1080px;height:1350px;font-family:Inter,sans-serif;overflow:hidden}}
.s{{width:1080px;height:1350px;position:relative;padding:90px 84px;display:flex;flex-direction:column}}
.dark{{background:{K};color:{W}}} .yel{{background:{Y};color:{K}}} .light{{background:#F6F4EE;color:{K}}}
.logo{{display:flex;align-items:center;gap:16px}}
.lw{{line-height:1}} .furni{{font-weight:900;font-size:34px;color:{Y};letter-spacing:-1px}}
.part{{font-weight:900;font-size:34px;letter-spacing:-1px}} .prem{{font-weight:800;font-size:17px;margin-top:4px;letter-spacing:.5px}}
.corner{{fill:{Y}}} .yel .corner{{fill:{K}}}
.yel .furni{{color:{K}}}
.top{{display:flex;justify-content:space-between;align-items:center}}
.cat{{font-weight:800;font-size:22px;letter-spacing:4px;padding:12px 24px;border-radius:40px;border:2px solid currentColor}}
.dark .cat{{color:{Y}}}
.kicker{{font-weight:700;font-size:30px;letter-spacing:3px;text-transform:uppercase;color:{Y};margin-top:auto}}
.yel .kicker{{color:{K}}}
h1{{font-family:'Inter Display',Inter;font-weight:900;font-size:112px;line-height:.98;letter-spacing:-4px;margin-top:28px}}
h1 .a{{color:{Y}}} .yel h1 .a,.light h1 .a{{background:{K};color:{Y};padding:0 14px}}
.sub{{font-size:36px;font-weight:500;line-height:1.35;margin-top:40px;opacity:.85;max-width:880px}}
.swipe{{margin-top:auto;display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:26px}}
.arrow{{width:96px;height:96px;border-radius:50%;background:{Y};color:{K};display:flex;align-items:center;justify-content:center;font-size:48px;font-weight:900}}
.yel .arrow{{background:{K};color:{Y}}}
.num{{font-family:'Inter Display',Inter;font-weight:900;font-size:300px;line-height:.8;letter-spacing:-14px;margin-top:90px;color:{K}}}
.light .num{{color:{K};text-shadow:12px 12px 0 {Y}}}
h2{{font-family:'Inter Display',Inter;font-weight:900;font-size:88px;line-height:1.02;letter-spacing:-2.5px;margin-top:50px}}
.text{{font-size:42px;line-height:1.42;font-weight:500;margin-top:36px;opacity:.88}}
.tag{{align-self:flex-start;margin-top:40px;background:{Y};color:{K};font-weight:800;font-size:28px;padding:14px 28px;border-radius:40px}}
.yel .tag{{background:{K};color:{Y}}}
.bar{{position:absolute;left:0;bottom:0;height:14px;background:{Y}}}
.yel .bar{{background:{K}}}
.foot{{margin-top:auto;display:flex;justify-content:space-between;font-weight:700;font-size:24px;opacity:.6}}
ul{{list-style:none;margin-top:50px}}
li{{display:flex;gap:28px;align-items:flex-start;font-size:38px;font-weight:600;line-height:1.3;padding:26px 0;border-bottom:2px solid rgba(128,128,128,.25)}}
li b{{flex:none;width:56px;height:56px;border-radius:50%;background:{Y};color:{K};display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;margin-top:-4px}}
.yel li b{{background:{K};color:{Y}}}
.cta h1{{font-size:96px}}
.btn{{margin-top:50px;background:{Y};color:{K};font-weight:900;font-size:40px;padding:30px 44px;border-radius:20px;align-self:flex-start}}
.info{{margin-top:auto;font-size:30px;font-weight:600;line-height:1.7}}
.info span{{color:{Y};font-weight:800}}
"""

def e(t): return html.escape(str(t or ""))

def render(sl, i, n, cat):
    t = sl["type"]
    prog = f'<div class="bar" style="width:{int(1080*(i+1)/n)}px"></div>'
    foot = f'<div class="foot"><span>@furnipart.uz</span><span>{i+1:02d} / {n:02d}</span></div>'
    head = f'<div class="top">{LOGO}<div class="cat">{e(cat)}</div></div>'
    if t == "cover":
        title = e(sl["title"])
        if sl.get("accent"): title = title.replace(e(sl["accent"]), f'<span class="a">{e(sl["accent"])}</span>', 1)
        return f'''<div class="s dark">{head}<div class="kicker">{e(sl.get("kicker"))}</div>
<h1>{title}</h1><div class="sub">{e(sl.get("sub"))}</div>
<div class="swipe"><span>Varaqlang</span><div class="arrow">→</div></div>{prog}</div>'''
    if t == "point":
        theme = "yel" if i % 2 == 0 else "light"
        tag = f'<div class="tag">{e(sl["tag"])}</div>' if sl.get("tag") else ""
        return f'''<div class="s {theme}">{head}<div class="num">{e(sl.get("num"))}</div>
<h2>{e(sl["title"])}</h2><div class="text">{e(sl.get("text"))}</div>{tag}{foot}{prog}</div>'''
    if t == "list":
        lis = "".join(f'<li><b>{k+1}</b><span>{e(x)}</span></li>' for k, x in enumerate(sl["items"]))
        return f'''<div class="s light">{head}<h2>{e(sl["title"])}</h2><ul>{lis}</ul>{foot}{prog}</div>'''
    if t == "cta":
        return f'''<div class="s dark cta">{head}<h1 style="margin-top:110px">{e(sl["title"])}</h1>
<div class="sub">{e(sl.get("text"))}</div><div class="btn">Direktga yozing →</div>
<div class="info"><span>☎</span> +998 91 125 9000<br><span>⌂</span> Margʻilon, Margʻilon sitiy roʻparasida<br>
<span>✓</span> Oʻzbekiston boʻylab dastavka</div>{prog}</div>'''
    raise ValueError(t)

def main(src, out):
    d = json.load(open(src, encoding="utf-8"))
    out = pathlib.Path(out); out.mkdir(parents=True, exist_ok=True)
    slides = d["slides"]; n = len(slides); paths = []
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1080, "height": 1350})
        for i, sl in enumerate(slides):
            pg.set_content(f"<html><head><meta charset='utf-8'><style>{CSS}</style></head><body>{render(sl,i,n,d['kategoriya'])}</body></html>")
            pg.wait_for_timeout(150)
            f = out / f"slayd_{i+1:02d}.png"; pg.screenshot(path=str(f)); paths.append(str(f))
        b.close()
    print("\n".join(paths))

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
