// ================================================================
// MyDeck — Adiciona a Vespa TCG à lista de lojas recomendadas
// (lojas_store_vespa.js)
//
// Não edita o array STORES dentro de lojas.js (arquivo grande, com
// histórico de truncamento no mount do sandbox — ver feedback de
// coding do projeto). Em vez disso, empurra um item novo pro mesmo
// array já declarado em lojas.js — precisa carregar DEPOIS dele.
//
// Dados coletados em vespatcg.com.br (22/07/2026):
//   - Endereço: Av. Raja Gabaglia, 3950 - Loja 13B/14B, Estoril,
//     Belo Horizonte/MG
//   - WhatsApp: (31) 99975-5189
//   - Instagram: @vespatcg
// ================================================================

if (typeof STORES !== 'undefined') {
  STORES.push({
    name: 'Vespa TCG',
    city: 'Belo Horizonte · MG',
    logo: 'https://repositorio.sbrauble.com/arquivos/up/ecom/logo/6a299a3193ab2-2btjo-z1402-4933070546a299a3193ab8.jpg',
    tiktok: '',
    instagram: 'https://www.instagram.com/vespatcg/',
    whatsapp: 'https://wa.me/5531999755189',
    color: '#e6a817',
    tag: '⭐ Loja recomendada'
  });
}
