// ================================================================
// MyDeck — Completa os dados da CoffeeCat Store (Pokémon TCG)
// (lojas_store_coffeecat_fix.js)
//
// O item 'CoffeeCat - Pokémon TCG' já existia em STORES (lojas.js)
// mas com quase todos os campos vazios (cadastro incompleto).
// Em vez de editar o array direto em lojas.js (arquivo grande, com
// histórico de truncamento no mount do sandbox — ver feedback de
// coding do projeto), este arquivo acha o item existente pelo nome
// e completa os campos, depois de lojas.js carregar.
//
// Dados coletados em linktr.ee/Coffeecatstore (03/08/2026):
//   - Instagram: @coffeecat.store
//   - TikTok: @coffee.cat.store
//   - WhatsApp Business (link direto de "Entre em contato conosco")
//   - Sem endereço físico informado no linktree nem no Instagram —
//     parece ser loja 100% online (também vende via OLX).
// ================================================================

if (typeof STORES !== 'undefined') {
  const cc = STORES.find(s => s.name === 'CoffeeCat - Pokémon TCG');
  if (cc) {
    cc.logo = 'https://ugc.production.linktr.ee/e282aa2e-0285-4d56-9fa1-84bea4a01fda_8fda12812fa209898db3f3735b558e29-tplv-tiktokx-cropcenter-1080-1080.jpeg?io=true&size=avatar-v3_0';
    cc.tiktok = 'https://www.tiktok.com/@coffee.cat.store';
    cc.instagram = 'https://www.instagram.com/coffeecat.store';
    cc.whatsapp = 'https://wa.me/message/PSMIDRG74DB6N1';
    cc.city = 'Loja online';
  }
}
