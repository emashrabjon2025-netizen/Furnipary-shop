import re, os, sys, urllib.request, hashlib, json
B = "https://www.blum.com/kz/ru/products/"
SLUGS = {
 "clip-top-blumotion":"hingesystems/clip-top-blumotion",
 "clip-top":"hingesystems/clip-top",
 "sinkunit":"cabinet-applications/sinkunit",
 "space-corner":"cabinet-applications/space-corner",
 "space-twin":"cabinet-applications/space-twin",
 "orga-line":"innerdividingsystems/orga-line",
 "ambia-line":"innerdividingsystems/ambia-line",
 "aventos-hk-top":"liftsystems/aventos-hk-top",
 "aventos-hf-top":"liftsystems/aventos-hf-top",
 "aventos-hl-top":"liftsystems/aventos-hl-top",
 "aventos-hk-xs":"liftsystems/aventos-hk-xs",
 "servo-drive":"motion-technologies/servo-drive/servo-drive-pullouts",
 "servo-drive-aventos":"motion-technologies/servo-drive/servo-drive-aventos",
 "legrabox":"boxsystems/legrabox",
 "merivobox":"boxsystems/merivobox",
 "tandembox":"boxsystems/tandembox",
 "movento":"runnersystems/movento",
 "tandem":"runnersystems/tandem",
 "tip-on-blumotion":"motion-technologies/tip-on-blumotion",
 "blumotion":"motion-technologies/blumotion",
}
SUBS = ["overview/", "programme/", "assembly/", "applications/", "design/", "technology/"]
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"}
out = "blum-katalog/out/web"; os.makedirs(out, exist_ok=True)
idx = []
seen = set()
def get(u):
    r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=40)
    return r.read()
for name, path in SLUGS.items():
    for s in SUBS:
        u = B + path + "/" + s
        try:
            h = get(u).decode("utf-8", "ignore")
        except Exception as e:
            print("skip", u, e); continue
        imgs = set(re.findall(r'/images/\d+/\d+/\d+/[^"\'\s\)>]+?\.(?:jpg|jpeg|png|webp)', h))
        print(u, len(imgs))
        for im in imgs:
            m = re.match(r'/images/(\d+)/(\d+)/(\d+)/(.+)', im)
            w, hh, iid, rest = m.groups()
            key = iid
            if key in seen: continue
            seen.add(key)
            ratio = int(w) / max(1, int(hh))
            big = f"/images/1600/{int(round(1600/ratio))}/{iid}/{rest}"
            data = None
            for cand in (big, f"/images/1200/{int(round(1200/ratio))}/{iid}/{rest}", im):
                try:
                    data = get("https://www.blum.com" + cand); break
                except Exception as e:
                    pass
            if not data or len(data) < 3000: continue
            fn = f"{name}__{iid}__{os.path.basename(rest)}"
            fn = re.sub(r'[^A-Za-z0-9_.-]', '_', fn)
            if not re.search(r'\.(jpg|jpeg|png|webp)$', fn): fn += ".jpg"
            open(os.path.join(out, fn), "wb").write(data)
            idx.append({"file": fn, "page": u, "src": im, "bytes": len(data)})
json.dump(idx, open(out + "/index.json", "w"), indent=1)
print("total", len(idx))
