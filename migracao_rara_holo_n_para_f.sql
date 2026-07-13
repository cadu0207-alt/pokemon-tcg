-- ============================================================================
-- MIGRAÇÃO: cartas "Rara"/"Rara Holo" não têm versão Normal (N) física.
-- Rodar ANTES de publicar o patch do getSlots() em app.js (13/07/2026).
--
-- Contexto: nos sets modernos (ME/SV) a raridade "Rara" (e "Rara Holo" no ME02)
-- já nasce impressa em holo — não existe print "Normal". O app antigo mantinha
-- um slot :N pra essas cartas (decisão de 09/07 pra não órfão coleções já
-- marcadas). Esta migração corrige definitivamente: renomeia qualquer slot
-- ":N" dessas cartas para ":F" (a versão holo real), preservando quantidade e
-- origem. Depois disso o slot N pode ser removido do app sem perder ninguém.
--
-- Cartas afetadas (setId:número):
--   me04: 007,010,013,019,029,039,042,051,068,086
--   me03: 086,087,088
--   me02: 003,008,017,026,034,045,053,068,079
--   meg : 010,028,034,038,048,056,064,073,074,088,093,095,098,100
-- ============================================================================

begin;

create temporary table _rara_holo_cards (pfx text, n text) on commit drop;
insert into _rara_holo_cards (pfx, n) values
  ('me04','007'),('me04','010'),('me04','013'),('me04','019'),('me04','029'),
  ('me04','039'),('me04','042'),('me04','051'),('me04','068'),('me04','086'),
  ('me03','086'),('me03','087'),('me03','088'),
  ('me02','003'),('me02','008'),('me02','017'),('me02','026'),('me02','034'),
  ('me02','045'),('me02','053'),('me02','068'),('me02','079'),
  ('meg','010'),('meg','028'),('meg','034'),('meg','038'),('meg','048'),
  ('meg','056'),('meg','064'),('meg','073'),('meg','074'),('meg','088'),
  ('meg','093'),('meg','095'),('meg','098'),('meg','100');

-- Passo 1: onde já existe um slot :F para o mesmo user+carta, o slot :N é
-- redundante (a carta já está marcada certo) — soma a quantidade no F e
-- descarta o N, sem perder o que foi contado.
with dups as (
  select n_row.id as n_id, f_row.id as f_id, n_row.quantity as n_qty
  from collection n_row
  join _rara_holo_cards rh on n_row.slot_key = rh.pfx || ':' || rh.n || ':N'
  join collection f_row
    on f_row.user_id = n_row.user_id
   and f_row.slot_key = rh.pfx || ':' || rh.n || ':F'
)
update collection f
set quantity = coalesce(f.quantity,1) + coalesce(d.n_qty,1)
from dups d
where f.id = d.f_id;

with dups as (
  select n_row.id as n_id
  from collection n_row
  join _rara_holo_cards rh on n_row.slot_key = rh.pfx || ':' || rh.n || ':N'
  join collection f_row
    on f_row.user_id = n_row.user_id
   and f_row.slot_key = rh.pfx || ':' || rh.n || ':F'
)
delete from collection where id in (select n_id from dups);

-- Passo 2: onde só existe :N (sem :F ainda), simplesmente renomeia o slot
-- para :F — a carta continua contada, só corrige a versão.
update collection c
set slot_key = rh.pfx || ':' || rh.n || ':F'
from _rara_holo_cards rh
where c.slot_key = rh.pfx || ':' || rh.n || ':N';

commit;

-- Verificação (rodar depois, fora da transação):
-- select slot_key, count(*) from collection
-- where slot_key like '%:N' and slot_key ~ '^(me04|me03|me02|meg):'
-- group by slot_key;
-- (não deve retornar nenhuma das cartas listadas acima)
