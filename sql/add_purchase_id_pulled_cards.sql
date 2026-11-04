-- Vincula pulled_cards à compra de origem (purchases), permitindo calcular
-- o profit real por compra (soma das cartas tiradas vinculadas - preço pago).
-- Rodar uma única vez em: app.supabase.com → SQL Editor → colar → Run

alter table pulled_cards
  add column if not exists purchase_id bigint references purchases(id) on delete set null;

create index if not exists idx_pulled_cards_purchase_id on pulled_cards(purchase_id);

-- Observação: cartas já lançadas ANTES desta migração ficam com purchase_id = NULL
-- (não há como recuperar o vínculo retroativamente com segurança — o texto em
-- "lote"/"src" pode ajudar a cruzar manualmente se for importante para você).
