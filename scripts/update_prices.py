#!/usr/bin/env python3
"""
update_prices.py — Atualiza preços das cartas com o MENOR PREÇO da Liga Pokémon (BRL).

MUDANÇA (jul/2026): a fonte anterior (TCGWatchtower, USD convertido) refletia o
mercado americano, que fica 3-4x ABAIXO do praticado no Brasil para chase cards
(ex.: Mega Greninja ex GOLD — US$43 convertido ≈ R$248 vs. R$939 mínimo na Liga).
Agora o campo `price` dos cards_*.js representa o menor preço listado na Liga.

Configuração: scripts/liga_sets.json — cole a URL da busca da Liga por set.
Sets sem URL são pulados (preço atual permanece intacto — nunca regride para USD).

Roda via GitHub Actions todo domingo 10h UTC, ou manualmente:
    python scripts/update_prices.py            # atualiza os arquivos
    python scripts/update_prices.py --dry-run  # só mostra o que faria
"""

import json
import os
import re
import sys
import time
from datetime import datetime

MIN_CARDS_PARA_GRAVAR = 20   # segurança: menos que isso = extração falhou, não grava
ALERTA_VARIACAO = 4.0        # loga aviso se preço novo divergir mais de 4x do atual


# ── Registro da data de atualização (price_updated_at.js) ────────────────────
# Consumido pela aba Preço Justo e pelo Fichário no site, pra mostrar pro
# usuário quão fresco é o preço que ele está vendo. Só a entrada do set que
# de fato recebeu preços novos é tocada — sets pulados (sem URL, extração
# insuficiente) mantêm a data anterior.

def update_price_timestamp(repo_root: str, set_key: str) -> None:
    path = os.path.join(repo_root, "price_updated_at.js")
    today = datetime.now().strftime("%Y-%m-%d")
    if not os.path.exists(path):
        print(f"     ⚠️  price_updated_at.js não encontrado em {path} — pulando registro de data")
        return
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    pattern = re.compile(r"(\b" + re.escape(set_key) + r"\s*:\s*)(?:'[^']*'|null)")
    new_content, n = pattern.subn(r"\g<1>'" + today + "'", content, count=1)
    if n == 0:
        print(f"     ⚠️  chave '{set_key}' não encontrada em price_updated_at.js — adicione manualmente")
        return
    with open(path, "w", encoding="utf-8") as f:
        f.write(new_content)


# ── Extração via Playwright ──────────────────────────────────────────────────

def fetch_liga_prices(url: str, debug_key: str = "") -> dict:
    """
    Abre a página de busca da Liga Pokémon e extrai {numero_3dig: menor_preco}.
    A Liga renderiza a grade via JS e pagina — rola até o fim antes de extrair.
    """
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1600, "height": 1000},
        )
        page.goto(url, wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(3500)

        # Fecha banner de cookies/consentimento se existir — pode estar bloqueando
        # cliques/scroll e impedindo o carregamento da grade de cards.
        for txt in ("Aceitar", "Aceitar todos", "Concordo", "OK", "Entendi"):
            try:
                btn = page.locator(f"button:has-text('{txt}')")
                if btn.count() > 0:
                    btn.first.click(timeout=1500)
                    page.wait_for_timeout(500)
            except Exception:
                pass

        # DEBUG: se não achar nenhum card já de cara, salva screenshot + HTML pra
        # diagnosticar (bloqueio anti-bot, captcha, tela de login, layout mudou etc.)
        # Os artefatos aparecem na aba Actions -> essa execução -> Artifacts.
        early_count = page.locator("a[href*='view=cards/card']").count()
        if early_count == 0 and debug_key:
            os.makedirs("debug_screenshots", exist_ok=True)
            try:
                page.screenshot(path=f"debug_screenshots/{debug_key}.png", full_page=True)
                with open(f"debug_screenshots/{debug_key}.html", "w", encoding="utf-8") as f:
                    f.write(page.content())
                print(f"     🩺 Debug salvo: debug_screenshots/{debug_key}.png (título da página: '{page.title()}')")
            except Exception as e:
                print(f"     🩺 Falha ao salvar debug: {e}")

        # Rola para carregar todos os cards (grade com lazy-load / paginação)
        prev = -1
        for _ in range(30):
            page.mouse.wheel(0, 2500)
            page.wait_for_timeout(700)
            # clica "mostrar mais / carregar mais" se existir
            for txt in ("Mostrar mais", "Carregar mais", "Ver mais"):
                btn = page.locator(f"button:has-text('{txt}'), a:has-text('{txt}')")
                if btn.count() > 0:
                    try:
                        btn.first.click()
                        page.wait_for_timeout(900)
                    except Exception:
                        pass
            count = page.locator("a[href*='view=cards/card']").count()
            if count == prev:
                break
            prev = count

        # Extrai número da carta + menor preço de cada tile
        prices = page.evaluate(r"""
            () => {
                const out = {};
                // Cada carta na grade é (ou contém) um link para a página da carta.
                document.querySelectorAll("a[href*='view=cards/card']").forEach(a => {
                    const href = decodeURIComponent(a.getAttribute('href') || '');
                    // número da carta: "(Edição 122)" no fim do parâmetro card=, ou &num=122
                    let n = null;
                    let m = href.match(/[&?]num=(\d{1,3})\b/);
                    if (!m) m = href.match(/\((?:[^()]*\s)?(\d{1,3})\)\s*$/);
                    if (!m) m = href.match(/\s(\d{1,3})\)/);
                    if (m) n = m[1].padStart(3, '0');
                    if (!n) return;

                    // menor preço: primeiro "R$ x,xx" dentro do tile (container pai)
                    let tile = a;
                    for (let i = 0; i < 4 && tile.parentElement; i++) {
                        tile = tile.parentElement;
                        const txt = tile.innerText || '';
                        const pm = txt.match(/R\$\s?([\d.]+,\d{2})/);
                        if (pm) {
                            const val = parseFloat(pm[1].replace(/\./g, '').replace(',', '.'));
                            if (val > 0 && (!(n in out) || val < out[n])) out[n] = val;
                            break;
                        }
                    }
                });
                return out;
            }
        """)

        browser.close()
        return {k: float(v) for k, v in prices.items()}


# ── Atualização dos arquivos JS ──────────────────────────────────────────────
# ATUALIZADO 24/jul/2026: agora que expand_card_database.py populou os sets
# legados (legacy_*.js), este arquivo passou a ter dois "sotaques" diferentes
# de card no repo — e o update_prices.py precisa entender os dois:
#   • cards_*.js (ME/SV): 1 carta por linha, aspas simples, número sempre
#     zero-padded de 3 dígitos — n:'001'. Ordem dos campos pode variar
#     (dex/artist podem vir antes ou depois de name/price) desde o retrofit.
#   • legacy_*.js: objetos JSON (aspas duplas) gerados via json.dumps, vários
#     por linha/arquivo, número SEM zero à esquerda — "n":"1". Ordem dos
#     campos também varia (populate bota dex/artist no fim; o retrofit do
#     legacy_swsh.js bota logo depois de "n").
# `normalize_num()` faz as duas convenções de numeração se encontrarem, e a
# extração por regex de objeto inteiro (`CARD_OBJ_RE`) elimina a dependência
# de ordem de campos no estilo JSON.

CARD_OBJ_RE = re.compile(r'\{"n":"(\d+)"[^{}]*\}')


def normalize_num(n) -> str:
    """'001' e '1' viram a mesma chave, pra casar as duas convenções de numeração."""
    m = re.search(r"\d+", str(n))
    return str(int(m.group())) if m else str(n)


def _check_alerta(n: str, old_price: float, new_price: float, alertas: list) -> None:
    if old_price > 0 and (new_price > old_price * ALERTA_VARIACAO or
                           new_price < old_price / ALERTA_VARIACAO):
        alertas.append(f"#{n}: R${old_price:.2f} → R${new_price:.2f}")


def _update_json_style(content: str, norm_prices: dict) -> tuple:
    """legacy_*.js — objetos JSON (aspas duplas), número sem zero à esquerda,
    ordem de campos livre. Casa o objeto inteiro (sem nested braces nos cards
    gerados) e troca só o "price" de dentro dele."""
    updates, skipped, alertas = 0, [], []

    def repl(m):
        nonlocal updates
        obj = m.group(0)
        num = normalize_num(m.group(1))
        if num not in norm_prices:
            skipped.append(m.group(1))
            return obj
        pm = re.search(r'"price":([\d.]+)', obj)
        if not pm:
            return obj
        new_price = norm_prices[num]
        old_price = float(pm.group(1))
        _check_alerta(m.group(1), old_price, new_price, alertas)
        updates += 1
        return re.sub(r'"price":[\d.]+', f'"price":{new_price:.2f}', obj, count=1)

    new_content = CARD_OBJ_RE.sub(repl, content)
    return new_content, updates, skipped, alertas


def _update_singlequote_style(content: str, norm_prices: dict) -> tuple:
    """cards_*.js — 1 carta por linha, aspas simples (n:'001'). Continua
    linha-a-linha (mais legível pro diff), mas agora casando por número
    normalizado em vez de exigir exatamente 3 dígitos."""
    updates, skipped, alertas = 0, [], []
    lines = content.splitlines(keepends=True)
    new_lines = []
    for line in lines:
        m = re.search(r"n:'(\d+)'", line)
        if m and "price:" in line:
            num = normalize_num(m.group(1))
            if num in norm_prices:
                new_price = norm_prices[num]
                old_m = re.search(r"price:([\d.]+)", line)
                old_price = float(old_m.group(1)) if old_m else 0
                _check_alerta(m.group(1), old_price, new_price, alertas)
                new_lines.append(re.sub(r"price:[\d.]+", f"price:{new_price:.2f}", line))
                updates += 1
                continue
            else:
                skipped.append(m.group(1))
        new_lines.append(line)
    return "".join(new_lines), updates, skipped, alertas


def update_js_file(filepath: str, prices: dict, dry: bool) -> tuple:
    """Detecta o estilo do arquivo (JSON legado vs. aspas simples ME/SV) e
    atualiza o campo de preço de cada carta. Retorna (updates, skipped, alertas)."""
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    norm_prices = {normalize_num(k): v for k, v in prices.items()}
    is_legacy_json = '"n":"' in content

    if is_legacy_json:
        new_content, updates, skipped, alertas = _update_json_style(content, norm_prices)
    else:
        new_content, updates, skipped, alertas = _update_singlequote_style(content, norm_prices)

    if not dry:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(new_content)

    return updates, skipped, alertas


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    dry = "--dry-run" in sys.argv
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cfg_path = os.path.join(repo_root, "scripts", "liga_sets.json")

    with open(cfg_path, encoding="utf-8") as f:
        cfg = json.load(f)

    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    print(f"[{now}] Atualizando preços — fonte: Liga Pokémon (menor preço, BRL)")
    if dry:
        print("MODO DRY-RUN — nada será gravado\n")

    total, all_ok = 0, True

    for s in cfg["sets"]:
        filepath = os.path.join(repo_root, s["file"])
        if not s.get("url"):
            print(f"  ⏭️  [{s['key'].upper()}] sem URL em liga_sets.json — pulado (preços atuais preservados)")
            continue
        if not os.path.exists(filepath):
            print(f"  ⚠️  {s['file']} não encontrado — pulando")
            continue

        print(f"  📡 [{s['key'].upper()}] {s['url']}")
        try:
            prices = fetch_liga_prices(s["url"], debug_key=s["key"])
            print(f"     → {len(prices)} preços extraídos")

            if len(prices) < MIN_CARDS_PARA_GRAVAR:
                print(f"     ⚠️  Menos de {MIN_CARDS_PARA_GRAVAR} cards — layout da Liga pode ter mudado. NÃO gravando.")
                all_ok = False
                continue

            updates, skipped, alertas = update_js_file(filepath, prices, dry)
            total += updates
            print(f"     ✅ {updates} preços {'simulados' if dry else 'atualizados'} em {s['file']}")
            if updates > 0 and not dry:
                update_price_timestamp(repo_root, s["key"])
                print(f"     🗓️  price_updated_at.js atualizado para '{s['key']}'")
            if alertas:
                print(f"     🔔 Variações >4x (conferir): {alertas[:8]}")
            if skipped:
                print(f"     ℹ️  {len(skipped)} cards sem preço na Liga: {skipped[:6]}")

        except Exception as e:
            print(f"     ❌ Erro em {s['key']}: {type(e).__name__}: {e}")
            all_ok = False

        time.sleep(2)

    print(f"\n{'✅' if all_ok else '⚠️ '} Concluído: {total} preços.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
