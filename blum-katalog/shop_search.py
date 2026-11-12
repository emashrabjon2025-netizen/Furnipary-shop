import re, os, json, urllib.request, urllib.parse, html, time
UA={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36","Accept-Language":"en-GB,en;q=0.9"}
def get(u,t=30): return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=t)
Q=[l.strip().replace("Blum ","") for l in open("blum-katalog/img-queries.txt") if l.strip()]
out="blum-katalog/out/shop"; os.makedirs(out,exist_ok=True)
idx={}
def save(key,n,u,meta):
    try: d=get(u).read()
    except Exception as e: print(" dl fail",u,e); return n
    if len(d)<5000: return n
    ext='.png' if d[:4]==b'\x89PNG' else ('.webp' if d[8:12]==b'WEBP' else '.jpg')
    fn=f"{key}__{n:02d}{ext}"; open(os.path.join(out,fn),'wb').write(d)
    idx[key].append(dict(file=fn,url=u,**meta)); return n+1
for code in Q:
    key=re.sub(r'[^A-Za-z0-9]+','_',code); idx[key]=[]; n=0
    # 1) hpponline
    for c in dict.fromkeys([code.lower(), code.split('.')[0].lower() if code[0].isdigit() and code.count('.')>1 else code.lower()]):
        try:
            r=get("https://www.hpponline.co.uk/product/"+urllib.parse.quote(c)); p=r.read().decode('utf-8','ignore')
            t=re.search(r'<title>(.*?)</title>',p,re.S); t=html.unescape(t.group(1).strip()) if t else ''
            og=re.findall(r'property="og:image"\s+content="([^"]+)"',p) or re.findall(r'content="([^"]+)"\s+property="og:image"',p)
            print("hpp",code,r.geturl(),t[:80],len(og))
            for u in og[:1]: n=save(key,n,html.unescape(u),dict(src="hpp",title=t,page=r.geturl()))
        except Exception as e: print("hpp fail",code,e)
        time.sleep(1)
    # 2) kitchenlibrary (Shopify)
    try:
        j=json.loads(get("https://kitchenlibrary.au/search/suggest.json?q="+urllib.parse.quote(code)+"&resources[type]=product&resources[limit]=3").read())
        for pr in j.get("resources",{}).get("results",{}).get("products",[])[:2]:
            print("kl",code,pr.get("title"))
            im=pr.get("image") or (pr.get("featured_image") or {}).get("url")
            if im:
                if im.startswith("//"): im="https:"+im
                n=save(key,n,im,dict(src="kl",title=pr.get("title"),page="https://kitchenlibrary.au"+pr.get("url","")))
    except Exception as e: print("kl fail",code,e)
    time.sleep(1)
json.dump(idx,open(out+"/index.json","w"),indent=1,ensure_ascii=False)
print({k:len(v) for k,v in idx.items()})
