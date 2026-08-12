// ================================================================
// MyDeck — Aba Iniciantes (iniciantes.js)
// FAQ pra quem está começando a colecionar Pokémon TCG — respondendo
// as dúvidas que mais aparecem em busca (fichário, sleeve, raridade,
// master set, etc). Conteúdo estático, sem depender do Supabase.
// ================================================================

const FAQ_INICIANTES = [
  {
    icon: '📁',
    pergunta: 'Qual fichário (binder) eu compro pra guardar minhas cartas?',
    resposta:
      'Pra quem está começando, procure um fichário de <strong>9 bolsos por folha</strong> (é o padrão mais usado, cabe carta de tamanho normal sem dobrar) e com <strong>capa rígida ou reforçada</strong> — os de zíper protegem contra poeira e queda das cartas se você for levar pra torneios ou trocas. Marcas como Ultra Pro e Gamegenic são as mais confiáveis no Brasil. Evite fichário de plástico fino e argola solta: eles rasgam fácil e não sustentam uma coleção grande.'
  },
  {
    icon: '🛡️',
    pergunta: 'Sleeve ou toploader — preciso dos dois?',
    resposta:
      'São coisas diferentes e se complementam: o <strong>sleeve</strong> (mangapote plástico fino) protege a superfície da carta contra risco, poeira e gordura da mão. O <strong>toploader</strong> (case rígido) protege contra dobra e impacto. Pra cartas do dia a dia, só o sleeve já resolve. Pra cartas caras ou raras que você quer guardar por muito tempo (ou vender), o ideal é <strong>sleeve + toploader juntos</strong> — o sleeve por dentro, o toploader por fora.' +
      '<div class="faq-img-cap">3 níveis de proteção, do básico ao cofre:</div>' +
      '<img class="faq-img" src="img/iniciantes/protecao-niveis.jpg" alt="Níveis de proteção: sleeve fosco + pasta D-ring, sleeve + toploader rígido, perfect fit sleeve + one-touch magnético" loading="lazy">'
  },
  {
    icon: '🏆',
    pergunta: 'O que é "Master Set"?',
    resposta:
      'Master Set é ter <strong>todas as cartas de uma coleção</strong>, incluindo todas as variações de impressão (normal, holo, reverse holo, secretas etc). É diferente de "Complete Set", que geralmente conta só uma versão de cada carta. É por isso que o MyDeck separa o progresso por variação — assim você sabe exatamente o que ainda falta pra fechar 100%.'
  },
  {
    icon: '⭐',
    pergunta: 'O que significam os símbolos de raridade no canto da carta?',
    resposta:
      '<strong>Círculo</strong> = Comum. <strong>Losango</strong> = Incomum. <strong>Estrela preta</strong> = Rara. <strong>Estrela preta com "PROMO"</strong> = carta promocional (distribuída em eventos/produtos especiais, não em booster normal). <strong>Estrela branca ou dourada</strong> = Ultra Rara (as mais valiosas da coleção, tipo os "ex", "Special Illustration Rare" etc).' +
      '<div class="faq-img-cap">Isso é o símbolo oficial impresso na carta. Só que entre colecionadores existe também uma hierarquia informal de "quanto vale", que mistura raridade com demanda de mercado:</div>' +
      '<img class="faq-img" src="img/iniciantes/raridade-piramide.jpg" alt="Pirâmide de raridade informal: Bulk & Staples na base, depois Radiant, Mega ex, Gold e SIR (Special Illustration Rare) no topo" loading="lazy">'
  },
  {
    icon: '🔥',
    pergunta: 'Qual a diferença entre EX, GX, V, VMAX, VSTAR e o novo "ex"?',
    resposta:
      'Todas são cartas "especiais" mais fortes que o normal, de eras diferentes do jogo: <strong>EX</strong> (2003-2007 e 2013-2016) e o <strong>ex</strong> atual (minúsculo, desde 2023) são parecidos — Pokémon mais forte, mas dá pro adversário pegar prêmios extras se derrotar. <strong>GX</strong> (2016-2019) tinha um ataque especial usável só 1x por partida. <strong>V</strong>, <strong>VMAX</strong> e <strong>VSTAR</strong> (2020-2023) formaram uma cadeia de evolução: V é a base, VMAX é a "mega", VSTAR tem uma habilidade única de estrela. Pra quem coleciona, o que importa é que essas cartas costumam ser as mais bonitas (arte grande) e mais valiosas de cada set.'
  },
  {
    icon: '🌡️',
    pergunta: 'Como devo guardar minhas cartas pra não estragar?',
    resposta:
      'Longe de <strong>luz solar direta</strong> (desbota a arte), <strong>umidade</strong> (empena e mancha) e <strong>calor extremo</strong> (deforma o plástico do sleeve/toploader). Lugar fresco, seco e ao abrigo de luz é o ideal — dentro de casa, numa estante ou gaveta, já resolve na prática.' +
      '<img class="faq-img" src="img/iniciantes/ameacas-ambientais.jpg" alt="Três ameaças ambientais: umidade causa empenamento e mofo (use sílica gel), calor causa curvatura, luz solar causa desbotamento (use case com proteção UV)" loading="lazy">'
  },
  {
    icon: '💰',
    pergunta: 'Vale a pena investir em Pokémon TCG pensando em revenda?',
    resposta:
      'Pokémon TCG pode valorizar, mas <strong>não é garantido</strong> — funciona mais como colecionismo do que investimento financeiro tradicional. Se o objetivo também for ganhar dinheiro, foque em produtos lacrados (booster box, ETB) de coleções mais recentes e cartas de baixa tiragem/alta demanda, e acompanhe o preço de mercado (é pra isso que existe a aba <strong>Lojas & Ofertas</strong> do MyDeck — preço real, atualizado). De qualquer forma, trate como algo pra curtir primeiro, valorizar depois.'
  },
  {
    icon: '🔍',
    pergunta: 'Como sei se uma carta ou produto lacrado é falsificado?',
    resposta:
      'Sinais de alerta: <strong>preço muito abaixo do mercado</strong>, textura do verso da carta diferente do padrão (deveria ser um pontilhado uniforme, sem manchas), cores muito saturadas ou baças, fonte de texto errada, e lacre de produto genérico ou mal aplicado. Na dúvida, compre de <strong>lojas com reputação</strong> — é por isso que recomendamos parceiros específicos na aba Lojas & Ofertas, em vez de qualquer anúncio aleatório.' +
      '<div class="faq-img-cap">3 testes rápidos pra checar uma carta suspeita:</div>' +
      '<img class="faq-img" src="img/iniciantes/triagem-falsificacao.jpg" alt="Triagem sensorial: teste da luz (papel falso é translúcido), textura de impressão em relevo (falsificações são lisas e brilhantes), peso padrão de 1.7g por carta" loading="lazy">'
  },
  {
    icon: '🃏',
    pergunta: 'Por onde eu começo a colecionar sem gastar muito de cara?',
    resposta:
      'Escolha <strong>uma coleção só</strong> pra focar (geralmente a mais recente, ou a que tiver seu Pokémon favorito) em vez de tentar abraçar tudo. Comece com um fichário básico + alguns boosters avulsos pra sentir o jogo, e só depois pense em booster box se decidir seguir com aquele set. Cadastre no MyDeck desde o início — assim você acompanha o progresso e não perde o controle do que já tem.'
  },
  {
    icon: '📦',
    pergunta: 'Qual a diferença entre Booster, Blister, ETB e Booster Box?',
    resposta:
      '<strong>Booster</strong> = 1 pacotinho individual de cartas (a unidade básica). <strong>Blister</strong> = 2 a 4 boosters embalados juntos, geralmente com 1 carta promocional exclusiva. <strong>ETB (Coleção Treinador Avançado)</strong> = caixa maior com vários boosters + acessórios (sleeves, dados, energia) + 1 promo — ótimo custo-benefício pra quem está montando o kit completo. <strong>Booster Box (Box Display)</strong> = a caixa fechada com todos os boosters de uma tiragem (normalmente 36) — o jeito mais barato por booster, mas exige o maior investimento de uma vez.'
  },
  {
    icon: '🏅',
    pergunta: 'Vale a pena gradar (PSA, BGS, CGC) minhas cartas?',
    resposta:
      'Gradar é mandar a carta pra uma empresa avaliar o estado de conservação e lacrar num case (slab) com uma nota — quanto mais alta, mais valoriza. Existem duas rotas: a <strong>internacional</strong> (PSA, BGS) é o padrão-ouro de reputação e liquidez pra revenda no mercado global, mas custa mais caro (cotado em dólar + frete internacional) e demora meses de fila de triagem. A <strong>nacional</strong> (empresas como MGS, Capy, GBA) é bem mais barata (em torno de R$ 85 por carta), fica pronta em semanas e não tem risco de extravio na alfândega — ótima pra proteger e valorizar os destaques da coleção dentro do Brasil. Na prática, o equilíbrio costuma ser: use a rota internacional pra ativos acima de uns R$ 500 (onde a liquidez global compensa o custo), e a nacional pro resto da coleção que você quer proteger e exibir.' +
      '<img class="faq-img" src="img/iniciantes/gradacao.jpg" alt="Comparação PSA/BGS (padrão internacional, mais caro, meses de espera, máxima liquidez global) vs gradação nacional MGS/Capy/GBA (mais barata, semanas, sem risco alfandegário)" loading="lazy">'
  },
  {
    icon: '🛒',
    pergunta: 'Onde comprar Pokémon TCG com segurança no Brasil?',
    resposta:
      'Pra produtos lacrados (booster, ETB, booster box), a fonte mais segura é a <strong>Copag</strong>, distribuidora oficial no Brasil — garante lançamento e produto 100% original, sem risco de adulteração. Pra cartas avulsas (singles), o <strong>marketplace da Liga Pokémon</strong> é o maior e mais curado do país — mas ainda assim, sempre confira a reputação do vendedor (procure lojistas com bastante avaliação, idealmente mais de 500) antes de comprar. E pra quem quer atendimento mais próximo e embalagem cuidadosa, lojas especializadas de renome (como Epic Game, Capitão Hunter, Freitas TCG e outras com histórico consolidado) costumam fornecer descrições detalhadas do estado da carta e um pós-venda mais confiável. Evite anúncio aleatório com preço muito abaixo do mercado — é o principal sinal de alerta de golpe ou falsificação.' +
      '<img class="faq-img" src="img/iniciantes/rotas-compra.jpg" alt="Rotas comerciais seguras no Brasil: Copag como distribuidora oficial, marketplace da Liga Pokémon pra singles, e lojas especializadas de renome" loading="lazy">'
  },
  {
    icon: '📚',
    pergunta: 'O que fazer com as cartas comuns e repetidas (bulk)?',
    resposta:
      'Antes de descartar ou empilhar sem critério, vale separar o bulk em três grupos. Primeiro, veja se a carta <strong>é útil competitivamente</strong> (jogável no meta atual) — se for, separe como "staple" e venda ou ofereça no marketplace da Liga Pokémon, tem demanda de quem joga torneio. Segundo, veja se a <strong>ilustração chama atenção</strong> ou é de um artista específico que você goste — nesse caso, vale montar um fichário temático só com aquelas artes, em vez de misturar tudo. O que sobrar, que é volume puro sem valor aparente, é só armazenamento denso: guarde em caixas de papelão técnicas (tipo BCW, com capacidade de 800 ou 5.000 cartas) e mantenha longe de umidade com uns sachês de sílica gel — assim não ocupa espaço no fichário principal, mas também não se perde nem estraga.' +
      '<img class="faq-img" src="img/iniciantes/bulk-fluxograma.jpg" alt="Fluxograma de decisão pro bulk: é útil pro meta? venda como staple. A ilustração é boa? crie um binder temático. É só volume? guarde em caixa técnica com sílica" loading="lazy">'
  }
];

function renderIniciantes() {
  const holder = document.getElementById('iniciantes-wrap');
  if (!holder) return;

  const cardsHtml = FAQ_INICIANTES.map((f, i) => (
    '<div class="faq-card">' +
      '<div class="faq-q" onclick="toggleFaq(' + i + ')">' +
        '<span class="faq-icon">' + f.icon + '</span>' +
        '<span class="faq-q-text">' + f.pergunta + '</span>' +
        '<span class="faq-arrow" id="faq-arrow-' + i + '">▾</span>' +
      '</div>' +
      '<div class="faq-a" id="faq-a-' + i + '">' + f.resposta + '</div>' +
    '</div>'
  )).join('');

  holder.innerHTML =
    '<div class="sec-title" style="margin:0 0 4px">🔰 Guia do Iniciante</div>' +
    '<div class="faq-intro">Tudo que você precisa saber antes de começar (ou continuar) sua coleção — clique numa pergunta pra ver a resposta.</div>' +
    '<div class="faq-list">' + cardsHtml + '</div>';
}

function toggleFaq(i) {
  const answerEl = document.getElementById('faq-a-' + i);
  const arrowEl = document.getElementById('faq-arrow-' + i);
  if (!answerEl) return;
  const isOpen = answerEl.classList.toggle('faq-a-open');
  if (arrowEl) arrowEl.textContent = isOpen ? '▴' : '▾';
}

// Auto-render se a aba já estiver ativa no load (ex: refresh na URL)
document.addEventListener('DOMContentLoaded', () => {
  const pane = document.getElementById('iniciantes');
  if (pane && pane.classList.contains('active')) renderIniciantes();
});
