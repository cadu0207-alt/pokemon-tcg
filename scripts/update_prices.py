#!/usr/bin/env python3
"""
update_prices.py — Atualiza preços das cartas com o MENOR PREÇO da Liga Pokémon (BRL).

MUDANÇA (jul/2026): a fonte anterior (TCGWatchtower, USD convertido) refletia o
mercado americano, que fica 3-4x ABAIXO do praticado no Brasil para chase cards
(ex.: Mega Greninja ex GOLD — US$43 convertido ≈ R$248 vs. R$939 mínimo na Liga).
Agora o campo `price` dos cards_*.js representa o menor preço listado na Liga.

Configuração: scripts/liga_sets.json — cole a URL da busca da Liga por set.
Sets sem URL são pulados (preço atual permanece intacto — nunca regride para USD).

FONTE ALTERNATIVA (ago/2026): scripts/mypcards_sets.json (mypcards.com/MYP Cards).
A Liga só filtra idioma carta-a-carta (sem URL), o que impedia pegar preço em
inglês em lote. O MYP filtra por EDIÇÃO + IDIOMA via parâmetro de URL
(ProdutoSearch[edicoesSelecionadas][] + ProdutoSearch[idiomasSelecionados][]),
então dá pra rodar com --source myp (PT-BR, mesmo campo `price` de sempre) ou
--source myp --idioma en (preço em inglês — hoje só imprime no dry-run, ainda
não existe onde gravar preço por idioma nos cards_*.js). Ver mypcards_sets.json
pros edicaoId já mapeados (hoje só a família Mega Evolução).
ATENÇÃO: fetch_myp_prices() foi escrito a partir da estrutura DOM confirmada
via inspeção manual no Chrome (não via execução real do Playwright — o sandbox
onde isso foi escrito não tinha Playwright instalado). Rode com --dry-run
primeiro pra confirmar que a extração está pegando os cards certos antes de
usar pra valer.

Roda via GitHub Actions todo domingo 10h UTC, ou manualmente:
    python scripts/update_prices.py                      # Liga, atualiza os arquivos
    python scripts/update_prices.py --dry-run             # só mostra o que faria
    python scripts/update_prices.py --source myp          # MYP Cards, PT-BR
    python scripts/update_prices.py --source myp --idioma en --dry-run   # preço em inglês (só teste)
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


# ── Extração via Playwright — MYP Cards (mypcards.com) ───────────────────────
# Estrutura confirmada em 07-08/08/2026 inspecionando o DOM no Chrome (não via
# execução do Playwright — validar com --dry-run antes de confiar de olhos
# fechados). Cada carta na grade de resultados é um <li> contendo:
#   • um elemento folha com o nome da carta e o número entre parênteses —
#     "Nome (NNN/DDD)" nos sets numerados (DDD é uma constante de exibição
#     do set, não o total real — ignorar) ou só "Nome (NNN)" nos sets de
#     promo/kit sem denominador (ex.: MEP — confirmado que NÃO tem "/DDD");
#   • um <a href=".../pokemon/produto/{id}/{slug}"> pra página do produto;
#   • um elemento com texto "R$ X.XXX,XX" que já é o MENOR preço entre
#     vendedores pra aquela carta — não precisa abrir a página de cada carta.
# A URL usa parâmetros GET normais (edição + idioma opcional):
#   https://mypcards.com/pokemon?ProdutoSearch[edicoesSelecionadas][]={edicaoId}&ProdutoSearch[idiomasSelecionados][]={idiomaId}
# idiomaId é global (não muda por edição) — ver scripts/mypcards_sets.json.
#
# PAGINAÇÃO (confirmado manualmente 08/08/2026): a página carrega 30 cartas
# de cada vez. O botão "Carregar mais produtos" busca a próxima leva via
# AJAX e ANEXA ao DOM (a URL muda pra .../?page=2 via pushState, mas isso é
# só cosmético — navegar direto pra ?page=2 NÃO pagina server-side, volta a
# mostrar a página 1. Só o clique de verdade no botão funciona). A 1ª versão
# desse fetcher (07/08) ficava travada em exatamente 30 cartas em todo set —
# bug era o critério de parada (contava TODOS os <li> com "R$" da página,
# inclusive filtros da sidebar que nunca mudam) mascarando o crescimento
# real. Reescrito pra contar só os leafs que batem o próprio regex de card.

def build_myp_url(edicao_id, idioma_id=None) -> str:
    url = f"https://mypcards.com/pokemon?ProdutoSearch%5BedicoesSelecionadas%5D%5B%5D={edicao_id}"
    if idioma_id:
        url += f"&ProdutoSearch%5BidiomasSelecionados%5D%5B%5D={idioma_id}"
    return url


_MYP_COUNT_JS = r"""
    () => Array.from(document.querySelectorAll("*"))
        .filter(el => el.children.length === 0 && /\(\d{1,4}(\/\d+)?\)\s*$/.test((el.textContent||"").trim()))
        .length
"""

_MYP_EXTRACT_JS = r"""
    () => {
        const out = {};
        document.querySelectorAll("li").forEach(li => {
            const leaves = Array.from(li.querySelectorAll("*")).filter(el => el.children.length === 0);
            const nameEl = leaves.find(el => /\(\d{1,4}(\/\d+)?\)\s*$/.test((el.textContent||"").trim()));
            if (!nameEl) return;
            const nm = nameEl.textContent.trim().match(/\((\d{1,4})(?:\/\d+)?\)\s*$/);
            if (!nm) return;
            const n = nm[1].padStart(3, "0");

            const priceEl = leaves.find(el => /R\$\s?[\d.]+,\d{2}/.test(el.textContent || ""));
            if (!priceEl) return;
            const pm = priceEl.textContent.match(/R\$\s?([\d.]+,\d{2})/);
            if (!pm) return;
            const val = parseFloat(pm[1].replace(/\./g, "").replace(",", "."));
            if (val > 0 && (!(n in out) || val < out[n])) out[n] = val;
        });
        return out;
    }
"""


def fetch_myp_prices(edicao_id, idioma_id=None, debug_key: str = "") -> dict:
    """
    Abre a página de busca do MYP Cards pra uma edição (+ idioma opcional) e
    extrai {numero_3dig: menor_preco}. Paginação: clica "Carregar mais
    produtos" em loop, usando a CONTAGEM DE CARTAS DE VERDADE (não de <li>
    genéricos) como critério de crescimento/parada — ver nota acima.
    """
    from playwright.sync_api import sync_playwright

    url = build_myp_url(edicao_id, idioma_id)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1600, "height": 1000},
            locale="pt-BR",
        )
        # Disfarce básico contra detecção de automação (navigator.webdriver
        # é o sinal mais óbvio que sites checam). Não custa nada ter.
        page.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
        )

        # 08/08/2026 (3ª rodada): duas tentativas anteriores (critério de
        # contagem, depois wait_until=networkidle) não resolveram — no
        # ambiente do Eduardo o clique 1 "funciona" (sem exception) mas não
        # cresce, e o clique 2 trava com TimeoutError. Como isso NUNCA
        # reproduziu no Chrome real que uso pra inspecionar, paro de tentar
        # adivinhar um 4º fix às cegas e coleto evidência de dentro do
        # próprio ambiente que falha: console do navegador (erros JS podem
        # revelar que hidratação quebrou por algum script bloqueado) +
        # estado real do botão (disabled? aria-busy? classe de loading
        # travada?) + screenshot/HTML no exato momento da falha.
        console_logs = []
        page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda exc: console_logs.append(f"[pageerror] {exc}"))

        def _dump_debug(tag: str):
            if not debug_key:
                return
            os.makedirs("debug_screenshots", exist_ok=True)
            base = f"debug_screenshots/myp_{debug_key}_{tag}"
            try:
                page.screenshot(path=f"{base}.png", full_page=True)
                with open(f"{base}.html", "w", encoding="utf-8") as f:
                    f.write(page.content())
                with open(f"{base}_console.txt", "w", encoding="utf-8") as f:
                    f.write("\n".join(console_logs) or "(nenhuma mensagem de console capturada)")
                print(f"     🩺 [{debug_key}] debug salvo em {base}.(png|html|_console.txt)")
            except Exception as e:
                print(f"     🩺 [{debug_key}] falha ao salvar debug '{tag}': {e}")

            # Estado real do botão "Carregar mais produtos" agora, direto no
            # terminal (não precisa abrir arquivo pra ver isso).
            try:
                btn_state = page.evaluate(r"""
                    () => {
                        const b = Array.from(document.querySelectorAll('button'))
                            .find(el => (el.textContent||'').includes('Carregar mais'));
                        if (!b) return null;
                        const r = b.getBoundingClientRect();
                        return {
                            text: b.textContent.trim().slice(0,60),
                            disabled: b.disabled,
                            ariaBusy: b.getAttribute('aria-busy'),
                            className: b.className,
                            visible: r.width > 0 && r.height > 0,
                            rect: {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)}
                        };
                    }
                """)
                print(f"     🔍 [{debug_key}] estado do botão: {btn_state}")
            except Exception as e:
                print(f"     🔍 [{debug_key}] não deu pra ler estado do botão: {e}")

            if console_logs:
                print(f"     📋 [{debug_key}] últimas mensagens de console:")
                for line in console_logs[-15:]:
                    print(f"        {line}")

        # 08/08/2026: inspecionei a rede ao clicar "Carregar mais produtos" no
        # Chrome de verdade e NÃO existe nenhuma chamada de API própria pra
        # buscar as próximas cartas — só pixels de tracking (Google Ads/GTM).
        # Ou seja, a "paginação" é 100% client-side (dado já carregado / SPA
        # hidratando), sem round-trip de rede. Isso explica por que a v2
        # ainda travava em 30: com wait_until="domcontentloaded" + 3.5s fixo,
        # a página estava com o HTML pronto mas o JS (pesado — tem uma
        # dúzia de scripts de ads/GTM na frente) ainda não tinha terminado
        # de hidratar e ligar o onClick do botão quando o script clicava —
        # clique "no vazio", sem exception, sem efeito. Trocado pra esperar
        # a rede ficar ociosa (todo aquele JS de tracking termina de
        # carregar) antes de tentar qualquer interação.
        page.goto(url, wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(2000)

        # Fecha banner de cookies/consentimento se existir.
        for txt in ("Aceitar", "Aceitar todos", "Concordo", "OK", "Entendi"):
            try:
                btn = page.locator(f"button:has-text('{txt}')")
                if btn.count() > 0:
                    btn.first.click(timeout=1500)
                    page.wait_for_timeout(500)
            except Exception:
                pass

        count = page.evaluate(_MYP_COUNT_JS)
        print(f"     🔎 [{debug_key}] carga inicial: {count} cartas")

        if count == 0:
            _dump_debug("initial_zero")

        # Clica "Carregar mais produtos" em loop até parar de crescer.
        # Confere o crescimento pela contagem real de cartas (regex de
        # número), não por <li> genérico — a sidebar tem ~380 <li> de
        # filtro de edição que nunca mudam e mascaravam o critério antigo.
        # Cada clique tenta até 3x com espera crescente antes de desistir —
        # como não há rede pra esperar (é tudo client-side), uma falha real
        # de clique costuma ser timing de hidratação, não rate-limit.
        stall = 0
        for i in range(60):
            btn = page.get_by_role("button", name="Carregar mais produtos")
            if btn.count() == 0:
                btn = page.locator(
                    "button:has-text('Carregar mais'), a:has-text('Carregar mais'), "
                    "button:has-text('Mostrar mais'), button:has-text('Ver mais')"
                )
            if btn.count() == 0:
                print(f"     ⏹️  [{debug_key}] botão 'Carregar mais' sumiu após {count} cartas — fim da lista")
                break

            clicked = False
            for tentativa in range(3):
                try:
                    btn.first.scroll_into_view_if_needed(timeout=3000)
                    page.wait_for_timeout(300)
                    btn.first.click(timeout=3000)
                    clicked = True
                    break
                except Exception as e:
                    print(f"     ⚠️  [{debug_key}] clique {i+1} tentativa {tentativa+1} falhou "
                          f"({type(e).__name__})")
                    page.wait_for_timeout(800)
            if not clicked:
                print(f"     ❌ [{debug_key}] desisti do clique {i+1} após 3 tentativas — parando em {count} cartas")
                _dump_debug(f"click{i+1}_timeout")
                break

            # espera a contagem de cartas crescer de verdade (até 8s), em
            # vez de confiar num sleep fixo.
            try:
                page.wait_for_function(
                    f"({_MYP_COUNT_JS})() > {count}", timeout=8000
                )
            except Exception:
                pass  # pode já ter sido a última leva — confere abaixo mesmo assim

            new_count = page.evaluate(_MYP_COUNT_JS)
            print(f"     🔎 [{debug_key}] após clique {i+1}: {new_count} cartas")
            if new_count <= count:
                stall += 1
                if stall == 1:
                    # primeira vez que um clique não cresce nada — captura
                    # evidência aqui (console + estado do botão), é o
                    # momento mais informativo pra diagnosticar.
                    _dump_debug(f"click{i+1}_nogrowth")
                if stall >= 2:
                    # 2 cliques seguidos sem crescer = realmente acabou (dá
                    # 1 chance extra pro caso de ter sido só hidratação lenta
                    # numa única rodada, não desiste no primeiro stall).
                    break
                page.wait_for_timeout(1500)
                continue
            stall = 0
            count = new_count

        # Extrai número + menor preço de cada tile.
        prices = page.evaluate(_MYP_EXTRACT_JS)

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

def _arg_value(flag: str, default: str) -> str:
    """Pega o valor de um argumento tipo --flag valor na linha de comando."""
    if flag in sys.argv:
        i = sys.argv.index(flag)
        if i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    return default


def _run_liga(repo_root: str, dry: bool) -> tuple:
    cfg_path = os.path.join(repo_root, "scripts", "liga_sets.json")
    with open(cfg_path, encoding="utf-8") as f:
        cfg = json.load(f)

    print(f"Atualizando preços — fonte: Liga Pokémon (menor preço, BRL)")
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

    return total, all_ok


def _run_myp(repo_root: str, dry: bool, idioma: str) -> tuple:
    cfg_path = os.path.join(repo_root, "scripts", "mypcards_sets.json")
    with open(cfg_path, encoding="utf-8") as f:
        cfg = json.load(f)

    idioma_id = cfg["idiomas"].get(idioma)
    if idioma_id is None:
        print(f"  ❌ idioma '{idioma}' não existe em mypcards_sets.json (opções: {list(cfg['idiomas'])})")
        return 0, False

    grava_no_price_field = (idioma == "pt")
    print(f"Atualizando preços — fonte: MYP Cards (menor preço, idioma={idioma})")
    if not grava_no_price_field:
        print("  ℹ️  idioma != pt: rodando em modo leitura — ainda não existe onde gravar preço por "
              "idioma nos cards_*.js (feature de variantes de idioma não implementada). "
              "Nada será escrito nos arquivos independente de --dry-run.\n")

    total, all_ok = 0, True

    for s in cfg["sets"]:
        filepath = os.path.join(repo_root, s["file"])
        edicao_id = s.get("edicaoId")
        if not edicao_id:
            print(f"  ⏭️  [{s['key'].upper()}] sem edicaoId em mypcards_sets.json — pulado")
            continue
        if not os.path.exists(filepath):
            print(f"  ⚠️  {s['file']} não encontrado — pulando")
            continue

        url = build_myp_url(edicao_id, idioma_id)
        print(f"  📡 [{s['key'].upper()}] {url}")
        try:
            prices = fetch_myp_prices(edicao_id, idioma_id, debug_key=s["key"])
            print(f"     → {len(prices)} preços extraídos")

            if len(prices) < MIN_CARDS_PARA_GRAVAR:
                print(f"     ⚠️  Menos de {MIN_CARDS_PARA_GRAVAR} cards — layout do MYP pode ter mudado ou "
                      f"não há oferta nesse idioma. NÃO gravando.")
                all_ok = False
                continue

            if not grava_no_price_field:
                print(f"     ℹ️  (modo leitura, idioma={idioma}) preços não gravados — exemplo: "
                      f"{dict(list(prices.items())[:5])}")
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
                print(f"     ℹ️  {len(skipped)} cards sem preço no MYP: {skipped[:6]}")

        except Exception as e:
            print(f"     ❌ Erro em {s['key']}: {type(e).__name__}: {e}")
            all_ok = False

        time.sleep(2)

    return total, all_ok


def main():
    dry = "--dry-run" in sys.argv
    source = _arg_value("--source", "liga")
    idioma = _arg_value("--idioma", "pt")
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    print(f"[{now}] update_prices.py — source={source}" + (f" idioma={idioma}" if source == "myp" else ""))
    if dry:
        print("MODO DRY-RUN — nada será gravado\n")

    if source == "myp":
        total, all_ok = _run_myp(repo_root, dry, idioma)
    else:
        total, all_ok = _run_liga(repo_root, dry)

    print(f"\n{'✅' if all_ok else '⚠️ '} Concluído: {total} preços.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
