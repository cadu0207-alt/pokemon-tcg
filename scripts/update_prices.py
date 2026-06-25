#!/usr/bin/env python3
"""
update_prices.py — Atualiza preços das cartas via TCGWatchtower
Roda via GitHub Actions toda semana (domingo 10h UTC).

Usa Playwright porque o TCGWatchtower renderiza cards via JavaScript:
- HTML inicial: ~36 cards (chase section)
- Após JS renderizar: ~96 cards
- Após clicar "Load More": 124 cards (todos)
"""

import re
import os
import sys
import time
from datetime import datetime

# ── Configuração dos sets ────────────────────────────────────────────────────
BASE = "https://tcgwatchtower.com"

SETS = [
    {
        "key": "me04",
        "file": "cards_me04.js",
        "url": f"{BASE}/pokemon/sets/mega-evolution/chaos-rising/cards",
    },
    {
        "key": "me03",
        "file": "cards_me03.js",
        "url": f"{BASE}/pokemon/sets/mega-evolution/perfect-order/cards",
    },
    {
        "key": "me02",
        "file": "cards_me02.js",
        "url": f"{BASE}/phantasmal-flames-card-list",
    },
    {
        "key": "meg",
        "file": "cards_meg.js",
        "url": f"{BASE}/pokemon/sets/mega-evolution/base-set/cards",
    },
]

# ── Busca de preços via Playwright ───────────────────────────────────────────

def fetch_prices(url: str) -> dict:
    """
    Abre a página com Playwright (headless Chromium), clica em "Load More"
    e extrai todos os preços. Retorna {card_num_padded: price_float}.

    Por que Playwright? O TCGWatchtower renderiza cards via JS:
    - HTML puro (requests): só ~36 cartas no HTML inicial
    - Após JS: ~96 cartas renderizadas automaticamente
    - Após clicar Load More: 100% das cartas (ex: 124/124 no ME03)
    """
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            )
        )

        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(2000)  # Deixa o JS renderizar

        # Clica em "Load More Cards" se existir
        btn = page.locator("button:has-text('Load More')")
        if btn.count() > 0:
            btn.first.click()
            page.wait_for_timeout(1000)

        # Extrai preços do DOM estruturado (mais confiável que innerText)
        prices = page.evaluate("""
            () => {
                const results = {};
                document.querySelectorAll('*').forEach(el => {
                    if (el.children.length > 0) return;
                    const text = (el.innerText || '').trim();
                    const numM = text.match(/^#?(\\d{3})(?:\\/\\d+)?$/);
                    if (!numM) return;
                    const n = numM[1];
                    if (results[n]) return;
                    // Procura preço nas 3 linhas vizinhas do DOM
                    let sib = el.nextElementSibling;
                    for (let i = 0; i < 5 && sib; i++, sib = sib.nextElementSibling) {
                        const p = (sib.innerText || '').trim().match(/^\\$(\\d+\\.\\d{2})$/);
                        if (p) { results[n] = parseFloat(p[1]); break; }
                    }
                    sib = el.previousElementSibling;
                    if (!results[n]) {
                        for (let i = 0; i < 5 && sib; i++, sib = sib.previousElementSibling) {
                            const p = (sib.innerText || '').trim().match(/^\\$(\\d+\\.\\d{2})$/);
                            if (p) { results[n] = parseFloat(p[1]); break; }
                        }
                    }
                });
                return results;
            }
        """)

        # Fallback: extrai por innerText se DOM estruturado falhar
        if len(prices) < 10:
            text = page.inner_text("body")
            prices = _parse_prices_from_text(text)

        browser.close()
        return prices


def _parse_prices_from_text(text: str) -> dict:
    """Extrai preços de texto plano (fallback)."""
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    prices = {}
    for i, line in enumerate(lines):
        m = re.match(r"^#?(\d{3})(?:/\d+)?$", line)
        if not m or m.group(1) in prices:
            continue
        n = m.group(1)
        for j in range(max(0, i - 2), min(len(lines), i + 3)):
            if j != i:
                pm = re.match(r"^\$(\d+\.\d{2})$", lines[j])
                if pm:
                    prices[n] = float(pm.group(1))
                    break
    return prices


# ── Atualização dos arquivos JS ──────────────────────────────────────────────

def update_js_file(filepath: str, prices: dict) -> tuple:
    """
    Atualiza price: em cada linha do arquivo JS.
    Retorna (updates_count, skipped_list).
    """
    with open(filepath, "r", encoding="utf-8") as f:
        original_lines = f.readlines()

    new_lines = []
    updates = 0
    skipped = []

    for line in original_lines:
        replaced = False
        for card_num, price in prices.items():
            if f"n:'{card_num}'" in line and "price:" in line:
                new_price_str = f"{price:.2f}"
                new_line = re.sub(r"price:[\d.]+", f"price:{new_price_str}", line)
                new_lines.append(new_line)
                updates += 1
                replaced = True
                break
        if not replaced:
            new_lines.append(line)

    # Detecta cards no arquivo sem preço encontrado
    for orig_line in original_lines:
        m = re.search(r"n:'(\d{3})'", orig_line)
        if m and m.group(1) not in prices and "price:" in orig_line:
            skipped.append(m.group(1))

    with open(filepath, "w", encoding="utf-8") as f:
        f.writelines(new_lines)

    return updates, skipped


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    print(f"[{now}] Atualizando preços — MyDeck Pokémon TCG Pocket")
    print(f"Repo: {repo_root}\n")

    total_updates = 0
    all_ok = True

    for s in SETS:
        filepath = os.path.join(repo_root, s["file"])
        if not os.path.exists(filepath):
            print(f"  ⚠️  {s['file']} não encontrado — pulando")
            continue

        print(f"  📡 [{s['key'].upper()}] {s['url']} ...")
        try:
            prices = fetch_prices(s["url"])
            n_found = len(prices)
            print(f"     → {n_found} preços encontrados")

            if n_found < 10:
                print(f"     ⚠️  Poucos resultados — site pode ter mudado. Pulando.")
                all_ok = False
                continue

            updates, skipped = update_js_file(filepath, prices)
            total_updates += updates
            print(f"     ✅ {updates} preços atualizados em {s['file']}")
            if skipped:
                print(f"     ℹ️  {len(skipped)} cards sem preço no TCGWatchtower: {skipped[:5]}")

        except Exception as e:
            print(f"     ❌ Erro em {s['key']}: {type(e).__name__}: {e}")
            all_ok = False

        time.sleep(2)

    print(f"\n{'✅' if all_ok else '⚠️ '} Concluído: {total_updates} preços atualizados.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
