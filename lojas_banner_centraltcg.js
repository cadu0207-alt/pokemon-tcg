// ================================================================
// MyDeck — Banner animado da Central TCG BH (lojas_banner_centraltcg.js)
//
// Banner GLOBAL — aparece em todas as abas, logo acima do menu
// (<nav class="tabs">). Renderiza direto em #global-ctcg-banner-wrap,
// uma div nova colocada no index.html entre o header e o <nav>, fora
// de qualquer .pane — por isso fica visível não importa a aba ativa.
// Não edita lojas.js nem index.html além dessa 1 div vazia (arquivo
// grande, com histórico de truncamento no mount do sandbox — ver
// feedback de coding do projeto). Além do banner, este arquivo
// também:
//   - Coloca a Central TCG BH em destaque no array STORES (ver
//     lojas_store_vespa.js pro mesmo padrão) — unshift pra ficar
//     primeira na grade de lojas recomendadas (aba Lojas & Ofertas).
//
// Produtos e preços puxados de loja.infinitepay.io/centraltcgbh em
// 22/07/2026 (loja em InfinitePay, sem API pública — lista colada à
// mão aqui; precisa atualizar manualmente se os preços mudarem lá).
//
// Sem endereço fixo — presença digital + eventos físicos em lojas
// parceiras em Belo Horizonte (confirmado com o Eduardo em 28/07/2026).
// ================================================================

// ── Loja em destaque (STORES) ────────────────────────────────────
if (typeof STORES !== 'undefined') {
  STORES.unshift({
    name: 'Central TCG BH',
    city: 'Digital + eventos em lojas parceiras · Belo Horizonte',
    logo: 'central-tcg-bh-logo.png',
    tiktok: 'https://www.tiktok.com/@centraltcgbh',
    instagram: 'https://www.instagram.com/centraltcgbh/',
    whatsapp: 'https://wa.me/5531984682495?text=' + encodeURIComponent('Oi! Vim pelo site MyDeck (mydecktcg.com.br) 👋'),
    color: '#4c1d95',
    tag: '🤝 Loja em destaque'
  });
}

// ── Produtos do banner (loja.infinitepay.io/centraltcgbh, 22/07/2026) ──
const CTCG_BANNER_PRODUCTS = [
  { name: 'Case Combo de Booster (6) — Caos Ascendente', price: 1000.00, oldPrice: 1140.00, img: 'https://assets.infinitepay.io/unsafe/3840x0/filters:quality(75)/https%3A%2F%2Finfinitepay-sales.services.production.infinitepay.io%2Fv1%2Fproducts%2Fvariation%2Fmedia_proxy%2F9622465a-3346-451a-8e44-3f5856422453%3Fv%3D20260602104615%26q%3Dthumbnail', url: 'https://loja.infinitepay.io/centraltcgbh/szh2209-case-combo-de-booster-6---caos-ascendente' },
  { name: 'Case Triplepack (12) — Equilíbrio Perfeito', price: 390.00, oldPrice: 408.00, img: 'https://assets.infinitepay.io/unsafe/3840x0/filters:quality(75)/https%3A%2F%2Finfinitepay-sales.services.production.infinitepay.io%2Fv1%2Fproducts%2Fvariation%2Fmedia_proxy%2F927d124e-658f-4bb8-8940-e0b4a911b7c5%3Fv%3D20260602092218%26q%3Dthumbnail', url: 'https://loja.infinitepay.io/centraltcgbh/nta9855-case-triplepack---equilibrio-perfeito' },
  { name: 'Case Triplepack (12) — Caos Ascendente', price: 390.00, oldPrice: 408.00, img: 'https://assets.infinitepay.io/unsafe/3840x0/filters:quality(75)/https%3A%2F%2Finfinitepay-sales.services.production.infinitepay.io%2Fv1%2Fproducts%2Fvariation%2Fmedia_proxy%2F26f5e09c-c8a4-4473-b001-5540ff12ae93%3Fv%3D20260601215245%26q%3Dthumbnail', url: 'https://loja.infinitepay.io/centraltcgbh/qwp3452-case-triplepack---caos-ascendente' },
  { name: 'Case Quadripack (12) — Caos Ascendente', price: 520.00, oldPrice: 540.00, img: 'https://assets.infinitepay.io/unsafe/3840x0/filters:quality(75)/https%3A%2F%2Finfinitepay-sales.services.production.infinitepay.io%2Fv1%2Fproducts%2Fvariation%2Fmedia_proxy%2Fade5415d-249d-40f3-91d6-d360d2693c5b%3Fv%3D20260601215746%26q%3Dthumbnail', url: 'https://loja.infinitepay.io/centraltcgbh/cao3456-case-quadripack---caos-ascendente' },
  { name: 'Baralho Batalha de Liga — Mega Lucario', price: 90.00, oldPrice: null, img: 'https://assets.infinitepay.io/unsafe/3840x0/filters:quality(75)/https%3A%2F%2Finfinitepay-sales.services.production.infinitepay.io%2Fv1%2Fproducts%2Fvariation%2Fmedia_proxy%2Fde4a982e-e0c1-4cf7-bc55-08a87fac05e9%3Fv%3D20260615154843%26q%3Dthumbnail', url: 'https://loja.infinitepay.io/centraltcgbh/mud5062-baralho-batalha-de-liga---mega-lucario' },
  { name: 'Booster Surpresa', price: 65.00, oldPrice: null, img: 'https://assets.infinitepay.io/unsafe/3840x0/filters:quality(75)/https%3A%2F%2Finfinitepay-sales.services.production.infinitepay.io%2Fv1%2Fproducts%2Fvariation%2Fmedia_proxy%2F1512cf4f-bcf1-49ec-ace6-45c0434f2bf0%3Fv%3D20260606121347%26q%3Dthumbnail', url: 'https://loja.infinitepay.io/centraltcgbh/cdi1983-booster-surpresa' },
  { name: 'Triplepack — Equilíbrio Perfeito', price: 34.00, oldPrice: null, img: 'https://assets.infinitepay.io/unsafe/3840x0/filters:quality(75)/https%3A%2F%2Finfinitepay-sales.services.production.infinitepay.io%2Fv1%2Fproducts%2Fvariation%2Fmedia_proxy%2F622b016a-94ff-4f87-a6ea-623d0d7e67a6%3Fv%3D20260602092428%26q%3Dthumbnail', url: 'https://loja.infinitepay.io/centraltcgbh/kea1927-triplepack---equilibrio-perfeito' },
  { name: 'Box Mega Zygarde Ex', price: 125.00, oldPrice: null, img: 'https://assets.infinitepay.io/unsafe/3840x0/filters:quality(75)/https%3A%2F%2Finfinitepay-sales.services.production.infinitepay.io%2Fv1%2Fproducts%2Fvariation%2Fmedia_proxy%2Fa65b9f35-492b-43a7-9308-b43020982dff%3Fv%3D20260602092240%26q%3Dthumbnail', url: 'https://loja.infinitepay.io/centraltcgbh/bzl8635-box-mega-zygarde-ex' },
  { name: 'Combo de Booster — Caos Ascendente', price: 190.00, oldPrice: null, img: 'https://assets.infinitepay.io/unsafe/3840x0/filters:quality(75)/https%3A%2F%2Finfinitepay-sales.services.production.infinitepay.io%2Fv1%2Fproducts%2Fvariation%2Fmedia_proxy%2F2ad5c604-4464-41aa-ac08-5569e300318c%3Fv%3D20260602092101%26q%3Dthumbnail', url: 'https://loja.infinitepay.io/centraltcgbh/vgs1898-combo-de-booster---caos-ascendente' },
  { name: 'Blister Unitário — Caos Ascendente', price: 11.00, oldPrice: null, img: 'https://assets.infinitepay.io/unsafe/3840x0/filters:quality(75)/https%3A%2F%2Finfinitepay-sales.services.production.infinitepay.io%2Fv1%2Fproducts%2Fvariation%2Fmedia_proxy%2F2b818713-17cc-463c-b49f-f4afa1603a14%3Fv%3D20260602091839%26q%3Dthumbnail', url: 'https://loja.infinitepay.io/centraltcgbh/ysd7705-blister-unitario---caos-ascendente' },
  { name: 'Quadripack — Caos Ascendente', price: 45.00, oldPrice: null, img: 'https://assets.infinitepay.io/unsafe/3840x0/filters:quality(75)/https%3A%2F%2Finfinitepay-sales.services.production.infinitepay.io%2Fv1%2Fproducts%2Fvariation%2Fmedia_proxy%2F781f529b-67d2-4d68-92d6-7d56d10422c9%3Fv%3D20260601215456%26q%3Dthumbnail', url: 'https://loja.infinitepay.io/centraltcgbh/sps4408-quadripack---caos-ascendente' },
  { name: 'Triplepack — Caos Ascendente', price: 34.00, oldPrice: null, img: 'https://assets.infinitepay.io/unsafe/3840x0/filters:quality(75)/https%3A%2F%2Finfinitepay-sales.services.production.infinitepay.io%2Fv1%2Fproducts%2Fvariation%2Fmedia_proxy%2F1177693d-15ea-48b9-bfc8-5f3441d1cb87%3Fv%3D20260601215154%26q%3Dthumbnail', url: 'https://loja.infinitepay.io/centraltcgbh/ocq5273-triplepack---caos-ascendente' },
  { name: 'ETB — Caos Ascendente', price: 380.00, oldPrice: null, img: 'https://assets.infinitepay.io/unsafe/3840x0/filters:quality(75)/https%3A%2F%2Finfinitepay-sales.services.production.infinitepay.io%2Fv1%2Fproducts%2Fvariation%2Fmedia_proxy%2F457e8649-4d00-4c18-aa86-dbfa963c9523%3Fv%3D20260601214907%26q%3Dthumbnail', url: 'https://loja.infinitepay.io/centraltcgbh/gtm8307-etb---caos-ascendente' }
];

(function injectCtcgBannerStyle() {
  const style = document.createElement('style');
  style.textContent = `
    .ctcg-banner {
      display: flex; align-items: stretch; gap: 0;
      margin: 0 0 20px; border-radius: 14px; overflow: hidden;
      background: linear-gradient(135deg, #2e1065, #4c1d95 55%, #6d28d9);
      box-shadow: 0 4px 18px rgba(76,29,149,.25);
    }
    .ctcg-banner-brand {
      flex: 0 0 auto; display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 6px; padding: 16px 22px; text-decoration: none;
      border-right: 1px solid rgba(255,255,255,.15); min-width: 148px;
    }
    .ctcg-banner-brand img {
      width: 56px; height: 56px; border-radius: 50%; object-fit: cover;
      border: 2px solid rgba(255,255,255,.85);
    }
    .ctcg-banner-brand-name {
      font-family: 'Bebas Neue', sans-serif; font-size: 17px; letter-spacing: .03em;
      color: #fff; text-align: center; line-height: 1.1;
    }
    .ctcg-banner-brand-tag {
      font-size: 10px; color: #e9d5ff; text-align: center; white-space: nowrap;
    }
    .ctcg-banner-track-wrap { flex: 1 1 auto; overflow: hidden; position: relative; }
    .ctcg-banner-track {
      display: flex; width: max-content; animation: ctcg-scroll 75s linear infinite;
    }
    .ctcg-banner-track:hover { animation-play-state: paused; }
    @keyframes ctcg-scroll {
      0%   { transform: translateX(-50%); }
      100% { transform: translateX(0%); }
    }
    .ctcg-prod {
      flex: 0 0 auto; width: 128px; padding: 12px 10px; text-decoration: none;
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      border-right: 1px solid rgba(255,255,255,.08);
    }
    .ctcg-prod img {
      width: 84px; height: 84px; object-fit: contain; border-radius: 8px;
      background: rgba(255,255,255,.92);
    }
    .ctcg-prod-name {
      font-size: 10.5px; color: #f3e8ff; text-align: center; line-height: 1.25;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .ctcg-prod-price { display: flex; flex-direction: column; align-items: center; gap: 1px; }
    .ctcg-prod-old { font-size: 10px; color: #c4b5fd; text-decoration: line-through; }
    .ctcg-prod-new { font-size: 13px; font-weight: 700; color: #fff; }
    @media (max-width: 640px) {
      .ctcg-banner { flex-direction: column; }
      .ctcg-banner-brand { flex-direction: row; border-right: none; border-bottom: 1px solid rgba(255,255,255,.15); }
    }
  `;
  document.head.appendChild(style);
})();

function ctcgProductCardHtml(p) {
  const priceHtml = p.oldPrice
    ? '<span class="ctcg-prod-old">R$ ' + p.oldPrice.toFixed(2).replace('.', ',') + '</span><span class="ctcg-prod-new">R$ ' + p.price.toFixed(2).replace('.', ',') + '</span>'
    : '<span class="ctcg-prod-new">R$ ' + p.price.toFixed(2).replace('.', ',') + '</span>';
  return (
    '<a class="ctcg-prod" href="' + p.url + '" target="_blank" rel="noopener">' +
      '<img src="' + p.img + '" alt="' + p.name + '" loading="lazy">' +
      '<div class="ctcg-prod-name">' + p.name + '</div>' +
      '<div class="ctcg-prod-price">' + priceHtml + '</div>' +
    '</a>'
  );
}

const CTCG_BANNER_WHATSAPP_URL = 'https://wa.me/5531984682495?text=' + encodeURIComponent('Vim pelo MyDeck TCG, quero saber mais sobre produtos!');

function ctcgBannerHtml() {
  // Duplica a lista pra loop contínuo (translateX -50% → 0% cobre exatamente 1 cópia).
  const track = CTCG_BANNER_PRODUCTS.concat(CTCG_BANNER_PRODUCTS).map(ctcgProductCardHtml).join('');
  return (
    '<div class="ctcg-banner" id="central-tcg-banner">' +
      '<a class="ctcg-banner-brand" href="' + CTCG_BANNER_WHATSAPP_URL + '" target="_blank" rel="noopener">' +
        '<img src="central-tcg-bh-logo.png" alt="Central TCG BH">' +
        '<div class="ctcg-banner-brand-name">CENTRAL<br>TCG BH</div>' +
        '<div class="ctcg-banner-brand-tag">🤝 Loja parceira</div>' +
      '</a>' +
      '<div class="ctcg-banner-track-wrap"><div class="ctcg-banner-track">' + track + '</div></div>' +
    '</div>'
  );
}

function renderCtcgGlobalBanner() {
  const wrap = document.getElementById('global-ctcg-banner-wrap');
  if (wrap && !document.getElementById('central-tcg-banner')) {
    wrap.innerHTML = ctcgBannerHtml();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderCtcgGlobalBanner);
} else {
  renderCtcgGlobalBanner();
}
