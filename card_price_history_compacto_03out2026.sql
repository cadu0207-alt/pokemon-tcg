-- ================================================================
-- MyDeck — HISTÓRICO DE PREÇO COMPACTO (03/10/2026)
--
-- PROBLEMA: o snapshot diário gravava 1 linha por carta POR DIA mesmo sem mudança de
-- preço (86% dos slots não mudaram em 44 dias). Com a cobertura completa (33.394 slots)
-- isso cresce ~6,2 MB/dia e estoura o limite de 500 MB do plano gratuito em ~43 dias
-- (banco já em 232 MB). Um backfill "dia a dia" do passado (+1 milhão de linhas) estouraria
-- em ~14 dias.
--
-- NOVO MODELO: card_price_history guarda só o PRIMEIRO preço de cada slot e as MUDANÇAS.
-- O gráfico (price_history.js) preenche os dias intermediários ("forward-fill") e busca o
-- último ponto anterior à janela de 90 dias. Linhas diárias antigas continuam válidas
-- (são só pontos redundantes) — por isso a compactação abaixo é opcional e reversível em
-- significado (nada de informação se perde: dia sem linha = mesmo preço da linha anterior).
--
-- ESTE ARQUIVO (parte 1, aplicada): índice duplicado + função de último preço.
-- Partes seguintes (backfill pelo git e compactação) estão no fim, comentadas.
-- ================================================================

-- 1. índice duplicado: (slot_key, date) já é a PRIMARY KEY (21 MB de índice repetido)
drop index if exists card_price_history_slot_date_idx;

-- 2. último preço gravado de cada slot, em páginas (keyset por slot_key) — só o service_role
--    (script de snapshot no GitHub Actions) executa.
create or replace function card_price_latest(p_after text default '', p_limit int default 1000)
returns table (slot_key text, price numeric, date date)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (h.slot_key) h.slot_key, h.price, h.date
    from card_price_history h
   where h.slot_key > coalesce(p_after, '')
   order by h.slot_key, h.date desc
   limit greatest(1, least(coalesce(p_limit, 1000), 5000));
$$;
revoke all on function card_price_latest(text, int) from public, anon, authenticated;
grant execute on function card_price_latest(text, int) to service_role;

-- ── PARTE 3 (depois do backfill) — compactação das linhas redundantes ──────────────
-- Apaga a linha de um slot quando o preço é IGUAL ao da linha anterior do mesmo slot
-- (mantém a primeira e todas as mudanças). Rodar em lotes por faixa de slot_key se der timeout,
-- e depois: VACUUM FULL card_price_history;  (devolve o espaço ao disco)
--
--   delete from card_price_history h
--    using (select slot_key, date,
--                  price = lag(price) over (partition by slot_key order by date) as igual
--             from card_price_history) x
--   where h.slot_key = x.slot_key and h.date = x.date and x.igual;
