#!/usr/bin/env python3
"""
Gera os sprites do minigame "Pokémon Escondidos" servidos pelo próprio site (assets/wild/).

Por quê: o jogo carregava o official-artwork da PokeAPI direto do raw.githubusercontent.com — PNG de 475×475
(~118 KB cada) mostrado a 50–91 px, e alguns provedores bloqueiam esse domínio. Aqui baixamos os 151 de Kanto
uma vez, reduzimos para 160 px em WebP (~6–9 KB cada) e guardamos no repositório.

Uso:  python scripts/build_wild_sprites.py            (precisa de Pillow; baixa ~18 MB uma única vez)
Saída: assets/wild/<dex>.webp  (1..151)  +  assets/wild/ball-<tipo>.png (4 ícones de pokébola)
Fonte: https://github.com/PokeAPI/sprites (sprites/pokemon/other/official-artwork e sprites/items)
"""
import io
import os
import sys
import urllib.request

from PIL import Image

RAW = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'wild')
SIZE = 160          # lado do quadrado; o jogo mostra no máximo ~91 px (182 px em tela 2x)
QUALITY = 82
BALLS = {'pokeball': 'poke-ball', 'greatball': 'great-ball', 'ultraball': 'ultra-ball', 'masterball': 'master-ball'}


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'MyDeck sprite build (cadu0207@gmail.com)'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def main():
    os.makedirs(OUT, exist_ok=True)
    total = 0
    for dex in range(1, 152):
        dest = os.path.join(OUT, f'{dex}.webp')
        if os.path.exists(dest):
            total += os.path.getsize(dest)
            continue
        img = Image.open(io.BytesIO(fetch(f'{RAW}pokemon/other/official-artwork/{dex}.png'))).convert('RGBA')
        img = img.resize((SIZE, SIZE), Image.LANCZOS)   # mantém a margem do artwork: o tamanho relativo entre espécies não muda
        img.save(dest, 'WEBP', quality=QUALITY, method=6)
        total += os.path.getsize(dest)
        if dex % 25 == 0:
            print(f'  {dex}/151…', flush=True)
    for tier, slug in BALLS.items():
        dest = os.path.join(OUT, f'ball-{tier}.png')
        if not os.path.exists(dest):
            with open(dest, 'wb') as f:
                f.write(fetch(f'{RAW}items/{slug}.png'))
        total += os.path.getsize(dest)
    print(f'pronto: 151 sprites + 4 bolas = {total/1024:.0f} KB em {os.path.normpath(OUT)}')


if __name__ == '__main__':
    sys.exit(main())
