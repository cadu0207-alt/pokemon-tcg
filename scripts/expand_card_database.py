#!/usr/bin/env python3
"""
expand_card_database.py — Expande o banco de cartas usando a API oficial
pokemontcg.io (https://docs.pokemontcg.io), na ordem mais novo -> mais antigo.

Duas frentes, pedidas pelo Eduardo em 23/07/2026:

  1) RETROFIT — adiciona `dex` (número da Pokédex Nacional) e `artist`
     (ilustrador) nas cartas que JÁ existem no site: cards_me*.js,
     cards_sv*.js, cards_svp.js e legacy_swsh.js. Não mexe em `price`
     (os preços já cadastrados vêm da Liga Pokémon via update_prices.py —
     não sobrescrever com estimativa da API).

  2) POPULATE — usa scripts/legacy_queue.json (fila que já existia, criada
     pra um fluxo manual de scraping via Chrome) pra POVOAR os sets ainda
     vazios: legacy_sm.js, legacy_xy.js, legacy_bw.js, legacy_hgss.js,
     legacy_dp.js, legacy_ex.js, legacy_classic.js — indo da era mais
     recente (Sun & Moon) até a mais antiga (Base Set/Classic, 1999). A
     fila já está na ordem certa (mais novo primeiro); este script apenas
     automatiza o que build_legacy_set.py fazia manualmente, direto pela
     API oficial, sem precisar rodar Chrome/copiar e colar.

REQUISITOS:
  - Rodar numa máquina com acesso à internet (não funciona no sandbox do
    Claude Code — a API não está liberada lá).
  - Python 3.8+, só biblioteca padrão (urllib) — nada pra instalar.
  - Opcional: variável de ambiente POKEMONTCG_API_KEY (cadastro grátis em
    https://dev.pokemontcg.io) pra rate limit mais alto. Sem ela funciona,
    só mais devagar.

USO:
  python3 scripts/expand_card_database.py retrofit
  python3 scripts/expand_card_database.py retrofit --only me04,sv10
  python3 scripts/expand_card_database.py populate
  python3 scripts/expand_card_database.py populate --only sm12 --limit 1
  python3 scripts/expand_card_database.py populate --dry-run

Depois de rodar, conferir com `git diff --stat` e `node --check <arquivo>`
antes de commitar — mesma rotina de sempre.
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API_BASE = "https://api.pokemontcg.io/v2"
API_KEY = os.environ.get("POKEMONTCG_API_KEY", "")
PAGE_SIZE = 250

# ── Mapeamento raridade em inglês (API) -> rótulo em português (mesmo
#    vocabulário já usado no site — ver cards_*.js / legacy_swsh.js /
#    scripts/build_legacy_set.py RAR_PT) ──────────────────────────────
RARITY_EN_PT = {
    "Common": "Comum", "Uncommon": "Incomum", "Rare": "Rara",
    "Rare Holo": "Rara Holo", "Rare Holo EX": "Rara Holo EX",
    "Rare Holo GX": "Rara Holo GX", "Rare Holo V": "Rara Holo V",
    "Rare Holo VMAX": "Rara Holo VMAX", "Rare Holo VSTAR": "Rara Holo VSTAR",
    "Rare Holo LV.X": "Rara Holo LV.X", "Rare Holo Star": "Rara Star",
    "Rare BREAK": "Rara BREAK", "Rare Prism Star": "Prism Star",
    "Rare ACE": "ACE SPEC", "ACE SPEC Rare": "ACE SPEC",
    "Rare Shining": "Rara Shiny", "Rare Shiny": "Rara Shiny",
    "Rare Shiny GX": "Rara Shiny GX", "Rare Shiny V": "Rara Shiny V",
    "Rare Rainbow": "Rara Rainbow", "Rare Secret": "Rara Secreta",
    "Rare Ultra": "Rara Ultra", "Amazing Rare": "Rara Incrível",
    "Radiant Rare": "Rara Radiante", "Double Rare": "Rara Dupla",
    "Illustration Rare": "Ilustr. Rara",
    "Special Illustration Rare": "Ilustr. Esp. Rara",
    "Hyper Rare": "Rara Hyper",
    "Trainer Gallery Rare Holo": "Galeria de Treinador",
    "Classic Collection": "Coleção Clássica", "LEGEND": "LEGEND",
    "Promo": "Promo", "Rare Prime": "Rara Prime",
}

# ── Sets já existentes no site: id interno -> id na API pokemontcg.io.
#    A maioria dos SV bate 1:1 (mesma convenção oficial); só a série ME
#    (Mega Evolução, exclusiva/renomeada em PT-BR) precisa de mapa manual.
#    'mep' fica de fora: numeração própria brasileira (MEP001+), sem
#    equivalente direto na API internacional.
RETROFIT_SET_MAP = {
    "meg": "me1", "me02": "me2", "me03": "me3", "me04": "me4", "me05": "me5",
    "sv1": "sv1", "sv2": "sv2", "sv3": "sv3", "sv3pt5": "sv3pt5",
    "sv4": "sv4", "sv4pt5": "sv4pt5", "sv5": "sv5", "sv6": "sv6",
    "sv6pt5": "sv6pt5", "sv7": "sv7", "sv8": "sv8", "sv8pt5": "sv8pt5",
    "sv9": "sv9", "sv10": "sv10", "svp": "svp",
}
# cards_<id>.js correspondente (padrão do repo)
RETROFIT_FILES = {k: f"cards_{k}.js" for k in RETROFIT_SET_MAP if k != "svp"}
RETROFIT_FILES["svp"] = "cards_svp.js"

LEGACY_FILE = "legacy_swsh.js"  # já populado; ids de LEGACY_SETS batem com a API direto


def log(msg):
    print(msg, flush=True)


def api_get(path, params):
    qs = urllib.parse.urlencode(params)
    url = f"{API_BASE}/{path}?{qs}"
    req = urllib.request.Request(url)
    # Sem User-Agent de navegador, o Cloudflare da API costuma devolver 403
    # pro urllib padrão do Python (identifica como bot) — isso é o que
    # causou o "HTTP Error 403: Forbidden" que o Eduardo viu no PowerShell.
    req.add_header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) expand_card_database.py")
    req.add_header("Accept", "application/json")
    if API_KEY:
        req.add_header("X-Api-Key", API_KEY)
    last_err = None
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 403:
                # 403 não melhora com retry — é bloqueio, não instabilidade.
                raise RuntimeError(
                    "HTTP 403 (bloqueado pela API). Pegue uma API key grátis em "
                    "https://dev.pokemontcg.io e rode de novo com a variável de "
                    "ambiente definida, ex. no PowerShell:\n"
                    "  $env:POKEMONTCG_API_KEY=\"sua-chave-aqui\"\n"
                    "  python scripts/expand_card_database.py retrofit"
                ) from e
            last_err = e
            wait = min(2 ** attempt, 20)
            log(f"     ... erro na API ({e}), retry em {wait}s")
            time.sleep(wait)
        except Exception as e:  # noqa: BLE001 — falha de rede genérica, essa sim vale retry
            last_err = e
            wait = min(2 ** attempt, 20)
            log(f"     ... erro na API ({e}), retry em {wait}s")
            time.sleep(wait)
    raise RuntimeError(f"falhou após 5 tentativas: {url} ({last_err})")


def fetch_all_cards(api_set_id):
    """Busca todas as cartas de um set na API, paginando até acabar."""
    out = []
    page = 1
    while True:
        data = api_get("cards", {"q": f"set.id:{api_set_id}", "pageSize": PAGE_SIZE, "page": page})
        cards = data.get("data", [])
        out.extend(cards)
        total = data.get("totalCount", len(out))
        if len(out) >= total or not cards:
            break
        page += 1
        time.sleep(0.25)
    return out


def norm_num(n):
    """Normaliza número de carta pra int (ignora prefixos tipo 'TG', 'SWSH' etc.)."""
    if n is None:
        return None
    m = re.search(r"(\d+)", str(n))
    return int(m.group(1)) if m else None


def rarity_pt(en):
    return RARITY_EN_PT.get(en, en or "—")


def dex_of(card):
    nats = card.get("nationalPokedexNumbers")
    if not nats:
        return None
    return nats[0] if len(nats) == 1 else ",".join(str(x) for x in nats)


def price_brl(card, usd_brl):
    """Preço estimado em BRL a partir do tcgplayer (market/mid), só usado em
    POPULATE (sets novos, sem preço nenhum ainda) — nunca em RETROFIT."""
    tcg = card.get("tcgplayer", {}).get("prices", {}) or {}
    for variant in ("holofoil", "reverseHolofoil", "normal", "1stEditionHolofoil", "unlimitedHolofoil"):
        v = tcg.get(variant)
        if v and v.get("market"):
            return round(v["market"] * usd_brl, 2)
        if v and v.get("mid"):
            return round(v["mid"] * usd_brl, 2)
    return 0.0


# ═══════════════════════════════════════════════════════════════════
# MODO 1 — RETROFIT (dex + artist em cartas que já existem)
# ═══════════════════════════════════════════════════════════════════

def build_lookup(api_cards):
    """{numero_normalizado: {'artist':..., 'dex':...}} — se houver duplicata
    de número (raro, mas acontece com reimpressões), mantém o primeiro."""
    lut = {}
    for c in api_cards:
        num = norm_num(c.get("number"))
        if num is None or num in lut:
            continue
        artist = c.get("artist")
        dex = dex_of(c)
        if artist or dex:
            lut[num] = {"artist": artist, "dex": dex}
    return lut


def retrofit_file(internal_id, filename, api_set_id):
    path = os.path.join(ROOT, filename)
    if not os.path.exists(path):
        log(f"  [{internal_id}] arquivo {filename} não existe — pulando")
        return
    with open(path, encoding="utf-8") as f:
        content = f.read()
    if '"artist":' in content or "artist:'" in content or 'artist:"' in content:
        log(f"  [{internal_id}] já tem 'artist' — parece já enriquecido, pulando (apague o campo manualmente se quiser refazer)")
        return

    log(f"  [{internal_id}] buscando cartas de '{api_set_id}' na API...")
    api_cards = fetch_all_cards(api_set_id)
    if not api_cards:
        log(f"  [{internal_id}] API não retornou cartas pra '{api_set_id}' (set pode ainda não ter dados publicados) — pulando")
        return
    lut = build_lookup(api_cards)
    log(f"  [{internal_id}] {len(api_cards)} cartas na API, {len(lut)} com artist/dex utilizável")

    # Dois estilos de escrita no repo: JS single-quote (cards_*.js) e
    # JSON-ish double-quote (legacy_swsh.js, gerado por build_legacy_set.py).
    js_style = re.compile(r"n:'(\d+)',")
    json_style = re.compile(r'"n":"(\d+)",')

    matched, total = 0, 0

    def repl_js(m):
        nonlocal matched, total
        total += 1
        num = int(m.group(1))
        info = lut.get(num)
        if not info:
            return m.group(0)
        matched += 1
        extra = ""
        if info["dex"] is not None:
            extra += f"dex:{json.dumps(info['dex'])},"
        if info["artist"]:
            extra += f"artist:{json.dumps(info['artist'], ensure_ascii=False)},"
        return m.group(0) + extra

    def repl_json(m):
        nonlocal matched, total
        total += 1
        num = int(m.group(1))
        info = lut.get(num)
        if not info:
            return m.group(0)
        matched += 1
        extra = ""
        if info["dex"] is not None:
            extra += f'"dex":{json.dumps(info["dex"])},'
        if info["artist"]:
            extra += f'"artist":{json.dumps(info["artist"], ensure_ascii=False)},'
        return m.group(0) + extra

    if js_style.search(content):
        new_content = js_style.sub(repl_js, content)
    elif json_style.search(content):
        new_content = json_style.sub(repl_json, content)
    else:
        log(f"  [{internal_id}] não reconheci o formato de 'n:' no arquivo — pulando (confira manualmente)")
        return

    if new_content == content:
        log(f"  [{internal_id}] nenhuma alteração (0 matches?) — verifique manualmente")
        return

    with open(path, "w", encoding="utf-8") as f:
        f.write(new_content)
    log(f"  [{internal_id}] OK — {matched}/{total} cartas enriquecidas em {filename}")


def cmd_retrofit(only):
    log("=== RETROFIT: adicionando dex + artist nas cartas já existentes ===")
    targets = list(RETROFIT_SET_MAP.items())
    if only:
        wanted = set(only.split(","))
        targets = [(k, v) for k, v in targets if k in wanted]
    for internal_id, api_id in targets:
        try:
            retrofit_file(internal_id, RETROFIT_FILES[internal_id], api_id)
        except Exception as e:  # noqa: BLE001 — um set problemático não pode derrubar os outros
            log(f"  [{internal_id}] falhou ({e}) — seguindo pro próximo set (rode de novo só este com --only {internal_id})")
    if not only or "swsh" in (only or ""):
        # legacy_swsh.js: ids de cada set dentro do LEGACY_SETS batem com a
        # API diretamente (swsh1, swsh12pt5, pgo, cel25, cel25c, etc.) — mas
        # como são MUITOS sets dentro de um arquivo só, roda um por vez.
        retrofit_legacy_swsh()


def retrofit_legacy_swsh():
    path = os.path.join(ROOT, LEGACY_FILE)
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        content = f.read()
    if '"artist":' in content:
        log(f"  [{LEGACY_FILE}] já tem 'artist' — pulando (apague o campo manualmente se quiser refazer)")
        return
    ids = re.findall(r'"id":"([a-z0-9]+)"', content)
    log(f"  [{LEGACY_FILE}] {len(ids)} sets encontrados: {', '.join(ids)}")
    json_style = re.compile(r'"n":"(\d+)",')
    for set_id in ids:
        # Isola só o bloco desse set (do 'push({"id":"X"' até o próximo
        # 'window.LEGACY_SETS.push(' ou fim do arquivo) pra não misturar
        # números de sets diferentes na hora de montar o lookup.
        start = content.index(f'"id":"{set_id}"')
        next_push = content.find("window.LEGACY_SETS.push(", start + 1)
        end = next_push if next_push != -1 else len(content)
        block = content[start:end]
        if '"artist":' in block:
            continue
        log(f"    - {set_id}: buscando na API...")
        try:
            api_cards = fetch_all_cards(set_id)
        except Exception as e:  # noqa: BLE001 — um set problemático não pode derrubar os outros
            log(f"      falhou ({e}) — seguindo pro próximo set (o que já foi feito até aqui já está salvo)")
            continue
        if not api_cards:
            log(f"      sem dados na API pra '{set_id}', pulando")
            continue
        lut = build_lookup(api_cards)
        matched = [0]

        def repl(m, lut=lut, matched=matched):
            num = int(m.group(1))
            info = lut.get(num)
            if not info:
                return m.group(0)
            matched[0] += 1
            extra = ""
            if info["dex"] is not None:
                extra += f'"dex":{json.dumps(info["dex"])},'
            if info["artist"]:
                extra += f'"artist":{json.dumps(info["artist"], ensure_ascii=False)},'
            return m.group(0) + extra

        new_block = json_style.sub(repl, block)
        content = content[:start] + new_block + content[end:]
        log(f"      OK — {matched[0]} cartas enriquecidas")
        # Salva incrementalmente após cada set — se um set mais adiante na
        # lista travar o processo, o que já foi enriquecido não se perde.
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


# ═══════════════════════════════════════════════════════════════════
# MODO 2 — POPULATE (preenche os sets legados vazios via fila existente)
# ═══════════════════════════════════════════════════════════════════

ERA_COLOR = {"SWSH": "#5C6BC0", "SM": "#FF7043", "XY": "#26A69A", "BW": "#8D6E63",
             "HGSS": "#FBC02D", "DP": "#7E57C2", "EX": "#42A5F5", "CLASSIC": "#EF5350"}
ERA_EMOJI = {"SWSH": "⚔️", "SM": "🌙", "XY": "🧬", "BW": "⚫",
             "HGSS": "💛", "DP": "💎", "EX": "🔷", "CLASSIC": "🕰️"}


def load_queue():
    path = os.path.join(ROOT, "scripts", "legacy_queue.json")
    with open(path, encoding="utf-8") as f:
        return f, json.load(open(path, encoding="utf-8"))


def save_queue(q):
    path = os.path.join(ROOT, "scripts", "legacy_queue.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(q, f, ensure_ascii=False, indent=1)


def populate_one(meta, usd_brl, dry_run):
    set_id = meta["id"]
    log(f"  [{set_id}] {meta['name']} ({meta['year']}) — buscando na API...")
    api_cards = fetch_all_cards(set_id)
    if not api_cards:
        log(f"  [{set_id}] API não retornou nada — marcando 'erro' na fila")
        meta["status"] = "erro"
        meta["motivo"] = "sem dados na API"
        return False

    cards = []
    for c in api_cards:
        num_raw = c.get("number", "")
        supertype = c.get("supertype", "")
        num_norm = norm_num(num_raw)
        # 'base' = carta numerada normalmente dentro do total impresso do set
        # (mesmo critério do build_legacy_set.py já usado no repo)
        is_base = bool(num_norm) and str(num_raw) == str(num_norm) and num_norm <= meta["printed"]
        entry = {
            "n": str(num_raw),
            "name": c.get("name", "?"),
            "rare": rarity_pt(c.get("rarity")),
            "price": price_brl(c, usd_brl),
            "base": is_base,
        }
        dex = dex_of(c)
        if dex is not None:
            entry["dex"] = dex
        if c.get("artist"):
            entry["artist"] = c["artist"]
        cards.append(entry)

    expected = meta["total"]
    if len(cards) < expected * 0.8:
        log(f"  [{set_id}] só {len(cards)}/{expected} cartas vieram da API (<80%) — marcando 'erro', confira manualmente")
        meta["status"] = "erro"
        meta["motivo"] = f"{len(cards)}/{expected} cartas"
        return False

    label = f"{set_id.upper()}({c.get('set', {}).get('ptcgoCode', '')}) — {meta['name']}" if api_cards else f"{set_id.upper()} — {meta['name']}"
    entry = {
        "id": set_id, "label": label, "emoji": ERA_EMOJI[meta["series"]],
        "cards": len(cards), "color": ERA_COLOR[meta["series"]],
        "series": meta["series"], "releaseDate": meta["year"], "data": cards,
    }

    if dry_run:
        log(f"  [{set_id}] DRY-RUN — {len(cards)} cartas prontas, nada escrito")
        return True

    era_file = os.path.join(ROOT, meta["file"])
    js = "\nwindow.LEGACY_SETS.push(" + json.dumps(entry, ensure_ascii=False, separators=(",", ":")) + ");\n"
    with open(era_file, "a", encoding="utf-8") as f:
        f.write(js)
    meta["status"] = "done"
    meta["cards_importados"] = len(cards)
    log(f"  [{set_id}] OK — {len(cards)} cartas → {meta['file']}")
    return True


def cmd_populate(only, limit, dry_run):
    log("=== POPULATE: preenchendo sets legados vazios (mais novo -> mais antigo) ===")
    qpath = os.path.join(ROOT, "scripts", "legacy_queue.json")
    with open(qpath, encoding="utf-8") as f:
        q = json.load(f)
    usd_brl = q.get("usd_brl_padrao", 5.7)
    wanted = set(only.split(",")) if only else None
    done_count = 0
    for meta in q["queue"]:
        if meta["status"] == "done":
            continue
        if wanted and meta["id"] not in wanted:
            continue
        try:
            ok = populate_one(meta, usd_brl, dry_run)
        except Exception as e:  # noqa: BLE001 — um set problemático não pode derrubar a fila inteira
            log(f"  [{meta['id']}] falhou ({e}) — marcando 'erro' e seguindo pro próximo set")
            meta["status"] = "erro"
            meta["motivo"] = str(e)
            ok = False
        if ok and not dry_run:
            save_queue(q)  # salva incrementalmente — se cair no meio, não perde progresso
        if ok:
            done_count += 1
        if limit and done_count >= limit:
            break
        time.sleep(0.3)
    log(f"=== fim: {done_count} set(s) processado(s) ===")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p1 = sub.add_parser("retrofit", help="adiciona dex+artist nas cartas que já existem (ME/SV/legacy_swsh)")
    p1.add_argument("--only", help="lista separada por vírgula de ids internos (ex: me04,sv10)")

    p2 = sub.add_parser("populate", help="povoa os sets legados vazios via scripts/legacy_queue.json")
    p2.add_argument("--only", help="lista separada por vírgula de ids da fila (ex: sm12,sm11)")
    p2.add_argument("--limit", type=int, default=0, help="processa no máximo N sets nesta execução")
    p2.add_argument("--dry-run", action="store_true", help="só mostra o que faria, não escreve nada")

    args = ap.parse_args()
    if args.cmd == "retrofit":
        cmd_retrofit(args.only)
    elif args.cmd == "populate":
        cmd_populate(args.only, args.limit, args.dry_run)


if __name__ == "__main__":
    main()
