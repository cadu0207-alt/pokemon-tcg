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


# ── Extração via Playwright ──────────────────────────────────────────────────

def fetch_liga_prices(url: str) -> dict:
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

def update_js_file(filepath: str, prices: dict, dry: bool) -> tuple:
    """Atualiza price: em cada linha. Retorna (updates, skipped, alertas)."""
    with open(filepath, "r", encoding="utf-8") as f:
        original_lines = f.readlines()

    new_lines, updates, skipped, alertas = [], 0, [], []

    for line in original_lines:
        m = re.search(r"n:'(\d{3})'", line)
        if m and "price:" in line and m.group(1) in prices:
            n = m.group(1)
            new_price = prices[n]
            old_m = re.search(r"price:([\d.]+)", line)
            old_price = float(old_m.group(1)) if old_m else 0
            if old_price > 0 and (new_price > old_price * ALERTA_VARIACAO or
                                  new_price < old_price / ALERTA_VARIACAO):
                alertas.append(f"#{n}: R${old_price:.2f} → R${new_price:.2f}")
            new_lines.append(re.sub(r"price:[\d.]+", f"price:{new_price:.2f}", line))
            updates += 1
        else:
            if m and "price:" in line and m.group(1) not in prices:
                skipped.append(m.group(1))
            new_lines.append(line)

    if not dry:
        with open(filepath, "w", encoding="utf-8") as f:
            f.writelines(new_lines)

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
            prices = fetch_liga_prices(s["url"])
            print(f"     → {len(prices)} preços extraídos")

            if len(prices) < MIN_CARDS_PARA_GRAVAR:
                print(f"     ⚠️  Menos de {MIN_CARDS_PARA_GRAVAR} cards — layout da Liga pode ter mudado. NÃO gravando.")
                all_ok = False
                continue

            updates, skipped, alertas = update_js_file(filepath, prices, dry)
            total += updates
            print(f"     ✅ {updates} preços {'simulados' if dry else 'atualizados'} em {s['file']}")
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
