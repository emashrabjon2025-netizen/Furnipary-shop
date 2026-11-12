import re, os, json, urllib.request, urllib.parse, html
UA={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36","Accept-Language":"en-US,en;q=0.9"}
Q=[l.strip() for l in open("blum-katalog/img-queries.txt") if l.strip()]
out="blum-katalog/out/search"; os.makedirs(out,exist_ok=True)
idx={}
def get(u,t=25):
    return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=t).read()
for q in Q:
    key=re.sub(r'[^A-Za-z0-9]+','_',q)[:40]
    urls=[]
    try:
        h=get("https://www.bing.com/images/search?form=HDRSC2&first=1&q="+urllib.parse.quote(q)).decode('utf-8','ignore')
        for m in re.findall(r'm="(\{[^"]+\})"',h):
            try:
                d=json.loads(html.unescape(m)); urls.append((d.get("murl"),d.get("purl"),d.get("t")))
            except Exception: pass
    except Exception as e:
        print("bing fail",q,e)
    print(q,len(urls))
    n=0; idx[key]=[]
    for mu,pu,t in urls[:14]:
        if not mu: continue
        try:
            data=get(mu,20)
        except Exception: continue
        if len(data)<8000: continue
        ext='.png' if data[:4]==b'\x89PNG' else ('.webp' if data[8:12]==b'WEBP' else '.jpg')
        fn=f"{key}__{n:02d}{ext}"
        open(os.path.join(out,fn),'wb').write(data)
        idx[key].append({"file":fn,"url":mu,"page":pu,"title":t})
        n+=1
        if n>=8: break
json.dump(idx,open(out+"/index.json","w"),indent=1,ensure_ascii=False)
