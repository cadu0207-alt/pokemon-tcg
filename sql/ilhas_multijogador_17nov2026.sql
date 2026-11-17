-- Jogo "Ilhas" (mydecktcg.com.br/ilhas): multijogador por temporadas — etapa 1.
-- Cria SÓ tabelas novas do jogo (prefixo ilhas_); não mexe em nada da loja/fichário.
-- APLICADO em 17/11/2026 (migrações ilhas_multijogador_etapa1 e ilhas_entrar_so_logados). Pode ser rodado de novo sem erro.
--
-- Modelo:
--   ilhas_temporadas  → um mundo por temporada (mesma semente para todos)
--   ilhas_jogadores   → perfil PÚBLICO de cada pessoa na temporada (ilha, nome, nível, construções, pontos)
--   ilhas_saves       → progresso PRIVADO (mochila, baú, energia…): só o dono lê e escreve
--   ilhas_entrar()    → entrega ao usuário logado uma ilha livre da temporada (sem corrida entre dois ao mesmo tempo)

-- ---------- Temporadas ----------
create table if not exists public.ilhas_temporadas (
  id serial primary key,
  nome text not null,
  seed integer not null,
  participantes integer not null default 100 check (participantes between 4 and 1000),
  inicio timestamptz not null default now(),
  fim timestamptz not null,
  ativa boolean not null default true
);
alter table public.ilhas_temporadas enable row level security;
drop policy if exists "ilhas_temporadas: todos leem" on public.ilhas_temporadas;
create policy "ilhas_temporadas: todos leem" on public.ilhas_temporadas
  for select to anon, authenticated using (true);
grant select on public.ilhas_temporadas to anon, authenticated;
-- (criar/encerrar temporada: só pelo painel/SQL, sem política de escrita)

insert into public.ilhas_temporadas (nome, seed, participantes, fim)
select 'Temporada 1', 2026, 100, now() + interval '30 days'
where not exists (select 1 from public.ilhas_temporadas);

-- ---------- Perfil público na temporada ----------
create table if not exists public.ilhas_jogadores (
  temporada_id integer not null references public.ilhas_temporadas (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  slot integer not null check (slot >= 0),            -- índice da ilha inicial no mundo da temporada
  nome text not null default 'Ilhéu' check (char_length(nome) between 1 and 16),
  personagem text not null default 'Boy' check (char_length(personagem) <= 24),
  nivel integer not null default 1 check (nivel between 1 and 10),
  pontos integer not null default 0 check (pontos >= 0),
  construcoes jsonb not null default '[]'::jsonb,       -- [{tipo,x,y}] para os outros verem a ilha
  updated_at timestamptz not null default now(),
  primary key (temporada_id, user_id),
  unique (temporada_id, slot),
  constraint ilhas_jogadores_construcoes_tamanho check (pg_column_size(construcoes) < 20000)
);
alter table public.ilhas_jogadores enable row level security;
drop policy if exists "ilhas_jogadores: todos leem" on public.ilhas_jogadores;
create policy "ilhas_jogadores: todos leem" on public.ilhas_jogadores
  for select to anon, authenticated using (true);
drop policy if exists "ilhas_jogadores: atualizar o próprio" on public.ilhas_jogadores;
create policy "ilhas_jogadores: atualizar o próprio" on public.ilhas_jogadores
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select on public.ilhas_jogadores to anon, authenticated;
grant update (nome, personagem, nivel, pontos, construcoes, updated_at) on public.ilhas_jogadores to authenticated;
-- (insert só pela função ilhas_entrar, que escolhe a ilha livre)

-- ---------- Progresso privado ----------
create table if not exists public.ilhas_saves (
  temporada_id integer not null references public.ilhas_temporadas (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (temporada_id, user_id),
  constraint ilhas_saves_tamanho check (pg_column_size(data) < 400000)
);
alter table public.ilhas_saves enable row level security;
drop policy if exists "ilhas_saves: ler o próprio" on public.ilhas_saves;
create policy "ilhas_saves: ler o próprio" on public.ilhas_saves
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "ilhas_saves: criar o próprio" on public.ilhas_saves;
create policy "ilhas_saves: criar o próprio" on public.ilhas_saves
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "ilhas_saves: atualizar o próprio" on public.ilhas_saves;
create policy "ilhas_saves: atualizar o próprio" on public.ilhas_saves
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update on public.ilhas_saves to authenticated;

-- ---------- Entrar na temporada: pega uma ilha livre ----------
-- Devolve o slot do usuário (o mesmo se ele já estiver na temporada).
-- Trava a temporada durante a escolha para dois jogadores não pegarem a mesma ilha.
create or replace function public.ilhas_entrar(p_temporada integer, p_nome text, p_personagem text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_slot integer;
  v_total integer;
begin
  if v_uid is null then raise exception 'login necessário'; end if;

  select slot into v_slot from ilhas_jogadores where temporada_id = p_temporada and user_id = v_uid;
  if v_slot is not null then return v_slot; end if;

  select participantes into v_total from ilhas_temporadas
    where id = p_temporada and ativa and now() < fim
    for update;                                   -- serializa as entradas desta temporada
  if v_total is null then raise exception 'temporada encerrada ou inexistente'; end if;

  -- primeira ilha livre, espalhando os jogadores pelo mapa (ordena por um "passo 7", mas cobre todas as ilhas)
  select g into v_slot from generate_series(0, v_total - 1) g
  where not exists (select 1 from ilhas_jogadores j where j.temporada_id = p_temporada and j.slot = g)
  order by (g * 7) % v_total, g
  limit 1;
  if v_slot is null then raise exception 'temporada lotada'; end if;

  insert into ilhas_jogadores (temporada_id, user_id, slot, nome, personagem)
  values (p_temporada, v_uid, v_slot,
          left(coalesce(nullif(trim(p_nome), ''), 'Ilhéu'), 16),
          left(coalesce(nullif(trim(p_personagem), ''), 'Boy'), 24));
  return v_slot;
end;
$$;
revoke execute on function public.ilhas_entrar(integer, text, text) from public, anon;
grant execute on function public.ilhas_entrar(integer, text, text) to authenticated;
