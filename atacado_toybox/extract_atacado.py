import re, io, json, glob, os, base64, html, collections, sys
sys.stdout.reconfigure(encoding='utf-8')
src = glob.glob(r'C:\Users\cadu0\.claude\uploads\9b9f7124-fbd5-4f14-a7b3-846f59c4845a\*Catalogo_TOYBOX*.html')[0]
s = io.open(src, encoding='utf-8').read()
OUT = r'C:\Users\cadu0\Documents\GitHub\pokemon-tcg\atacado_toybox'
os.makedirs(OUT, exist_ok=True)

EXT = {'jpeg': 'jpg', 'jpg': 'jpg', 'png': 'png', 'webp': 'webp'}
def save_img(name, mime, b64):
    fn = name + '.' + EXT.get(mime, mime)
    with open(os.path.join(OUT, fn), 'wb') as f:
        f.write(base64.b64decode(b64))
    return fn

parts = re.split(r'(?=<div class="card" data-id=)', s)[1:]
items = []
for pos, p in enumerate(parts):
    m = re.match(r'<div class="card" data-id="([^"]+)" data-name="([^"]*)" data-cat="([^"]+)" data-extra=\'([^\']*)\'', p)
    pid, name_l, cat, extra = m.groups()
    nm = re.search(r'<div class="name"[^>]*>(.*?)</div>', p, re.S)
    name = html.unescape(nm.group(1).strip()) if nm else html.unescape(name_l)
    desc = re.search(r'<div class="desc-panel"[^>]*>(.*?)</div>', p, re.S)
    desc = html.unescape(re.sub(r'<br\s*/?>', '\n', desc.group(1)).strip()) if desc else None
    sel = re.search(r'<option value="(\w+)" selected', p)
    sub = re.search(r'<div class="subtitle"[^>]*>(.*?)</div>', p, re.S)
    img = re.search(r'<img src="data:image/([a-z0-9]+);base64,([A-Za-z0-9+/=]+)"', p)
    imgs = []
    if img:
        imgs.append(save_img(pid, img.group(1), img.group(2)))
    try:
        ex = json.loads(html.unescape(extra))
    except Exception:
        ex = []
    for i, e in enumerate(ex, start=2):
        mm = re.match(r'data:image/([a-z0-9]+);base64,(.+)', e)
        if mm:
            imgs.append(save_img(f'{pid}_{i}', mm.group(1), mm.group(2)))
    items.append({'ref': pid, 'cat': cat, 'name': name, 'sub': html.unescape(sub.group(1).strip()) if sub else None,
                  'desc': desc, 'status': sel.group(1) if sel else 'encomenda', 'images': imgs})

secs = {}
for m in re.finditer(r'<div id="section-(\w+)">\s*<h2 class="section">(.*?)</h2>\s*<p class="section-sub">(.*?)</p>', s, re.S):
    secs[m.group(1).upper()] = {'title': html.unescape(m.group(2).strip()), 'sub': html.unescape(m.group(3).strip())}

catalog = {'updated': '2026-10-22', 'sections': secs, 'items': items}
with io.open(os.path.join(OUT, 'catalogo.json'), 'w', encoding='utf-8') as f:
    json.dump(catalog, f, ensure_ascii=False, separators=(',', ':'))

print(len(items), collections.Counter(i['cat'] for i in items), collections.Counter(i['status'] for i in items))
print('secoes:', secs)
print('varias imagens:', [(i['ref'], len(i['images'])) for i in items if len(i['images']) > 1], '| com subtitulo:', sum(1 for i in items if i['sub']))
print('arquivos:', len(os.listdir(OUT)), '| MB:', round(sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT)) / 1e6, 2))
print('catalogo.json KB:', os.path.getsize(os.path.join(OUT, 'catalogo.json')) // 1024)
