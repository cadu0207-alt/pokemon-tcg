-- Jogo "Ilhas": convites com recompensa para os dois lados (etapa 2 do online).
-- Só cria coisas novas com prefixo ilhas_. APLICADO em 17/11/2026 (migração ilhas_convites).
--
-- ilhas_convites               → quem entrou na temporada pelo link de quem (1 padrinho por pessoa, por temporada)
-- ilhas_registrar_convite()    → o recém-chegado registra o padrinho (pelo slot da ilha dele no link)
-- ilhas_resgatar_convites()    → o padrinho recolhe as recompensas ainda não recebidas (marca como recebidas)

-- quando a pessoa entrou na temporada (para o convite só valer para quem acabou de chegar)
alter table public.ilhas_jogadores add column if not exists entrou_em timestamptz not null default now();

create table if not exists public.ilhas_convites (
  temporada_id integer not null references public.ilhas_temporadas (id) on delete cascade,
  convidado uuid not null references auth.users (id) on delete cascade,
  padrinho uuid not null references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now(),
  resgatado boolean not null default false,
  primary key (temporada_id, convidado),
  check (convidado <> padrinho)
);
create index if not exists ilhas_convites_padrinho on public.ilhas_convites (temporada_id, padrinho) where not resgatado;
alter table public.ilhas_convites enable row level security;
-- ninguém lê ou escreve direto: só pelas funções abaixo (sem políticas = tudo negado)

create or replace function public.ilhas_registrar_convite(p_temporada integer, p_slot integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_padrinho uuid;
  v_nome text;
  v_entrou timestamptz;
begin
  if v_uid is null then raise exception 'login necessário'; end if;
  -- só vale para quem acabou de entrar na temporada (até 1 hora depois)
  select entrou_em into v_entrou from ilhas_jogadores where temporada_id = p_temporada and user_id = v_uid;
  if v_entrou is null then raise exception 'entre na temporada primeiro'; end if;
  if v_entrou < now() - interval '1 hour' then return null; end if;
  select user_id, nome into v_padrinho, v_nome from ilhas_jogadores where temporada_id = p_temporada and slot = p_slot;
  if v_padrinho is null or v_padrinho = v_uid then return null; end if;
  -- no máximo 20 convidados recompensados por padrinho na temporada
  if (select count(*) from ilhas_convites where temporada_id = p_temporada and padrinho = v_padrinho) >= 20 then return null; end if;
  insert into ilhas_convites (temporada_id, convidado, padrinho) values (p_temporada, v_uid, v_padrinho)
  on conflict do nothing;
  if not found then return null; end if;
  return v_nome;
end;
$$;

create or replace function public.ilhas_resgatar_convites(p_temporada integer)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_nomes text[];
begin
  if v_uid is null then raise exception 'login necessário'; end if;
  with r as (
    update ilhas_convites c set resgatado = true
    where c.temporada_id = p_temporada and c.padrinho = v_uid and not c.resgatado
    returning c.convidado
  )
  select coalesce(array_agg(j.nome), '{}') into v_nomes
  from r join ilhas_jogadores j on j.temporada_id = p_temporada and j.user_id = r.convidado;
  return v_nomes;
end;
$$;

revoke execute on function public.ilhas_registrar_convite(integer, integer) from public, anon;
revoke execute on function public.ilhas_resgatar_convites(integer) from public, anon;
grant execute on function public.ilhas_registrar_convite(integer, integer) to authenticated;
grant execute on function public.ilhas_resgatar_convites(integer) to authenticated;
