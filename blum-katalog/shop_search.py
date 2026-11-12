import re, os, json, urllib.request, urllib.parse, html
UA={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36","Accept-Language":"en-US,en;q=0.9"}
def get(u,t=30): return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=t).read()
Q=[l.strip() for l in open("blum-katalog/img-queries.txt") if l.strip()]
out="blum-katalog/out/shop"; os.makedirs(out,exist_ok=True)
idx={}
SITES=[("hwt","https://www.heimwerkertools.com/en/search?search={q}","heimwerkertools.com"),
       ("hwtpro","https://www.hwt-pro.com/en/search?search={q}","hwt-pro.com")]
for q in Q:
    code=q.replace("Blum ","")
    key=re.sub(r'[^A-Za-z0-9]+','_',code)
    idx[key]=[]; n=0
    for sname,tpl,dom in SITES:
        try:
            h=get(tpl.format(q=urllib.parse.quote(code))).decode('utf-8','ignore')
        except Exception as e:
            print("fail",sname,code,e); continue
        links=[]
        for l in re.findall(r'href="(https://www\.'+re.escape(dom)+r'/en/[^"#?]+/\d+/[^"#?]+)"',h):
            if l not in links: links.append(l)
        print(sname,code,"links",len(links))
        for l in links[:2]:
            try: p=get(l).decode('utf-8','ignore')
            except Exception: continue
            title=re.search(r'<title>(.*?)</title>',p,re.S); title=html.unescape(title.group(1).strip()) if title else ""
            has=code.split('.')[0][:6].lower() in p.lower()
            imgs=re.findall(r'https://[^"\'\s]+/media/[^"\'\s]+?\.(?:jpg|jpeg|png|webp)',p)
            full=[i for i in imgs if '/thumbnail/' not in i]
            big=[i for i in imgs if re.search(r'_(1920|1280|800)x\1',i)]
            cands=list(dict.fromkeys(full+big))[:4]
            for u in cands:
                try: d=get(u)
                except Exception: continue
                if len(d)<6000: continue
                ext=os.path.splitext(u)[1]
                fn=f"{key}__{n:02d}{ext}"; open(os.path.join(out,fn),'wb').write(d)
                idx[key].append({"file":fn,"url":u,"page":l,"title":title,"code_on_page":has}); n+=1
        if n>=6: break
json.dump(idx,open(out+"/index.json","w"),indent=1,ensure_ascii=False)
print({k:len(v) for k,v in idx.items()})
