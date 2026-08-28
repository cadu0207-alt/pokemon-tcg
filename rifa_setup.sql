-- ================================================================
-- MyDeck — SISTEMA DE RIFAS (rifa_setup.sql)
-- Execute no Supabase SQL Editor (app.supabase.com → SQL Editor → Run)
-- Depois de já ter rodado leilao_setup.sql (usa is_auction_admin() —
-- mesmo grupo de leiloeiro/rifeiro, conforme decidido com o Eduardo) e
-- leilao_fotos_storage_setup.sql (reaproveita o bucket leilao-fotos pra
-- foto do prêmio — rifa usa a MESMA foto real / catálogo que o leilão).
--
-- Fluxo (conforme combinado com o Eduardo, 24/08/2026):
-- 1. Rifeiro cadastra a rifa: prêmio (carta do catálogo OU foto real),
--    quantidade de números, valor por número, chave PIX + titular.
-- 2. Participante aceita os termos (uma vez, igual ao leilão), escolhe
--    quantos números quer, vê o total e a chave PIX, paga por fora, e
--    sobe o comprovante (fica NUM BUCKET PRIVADO, só rifeiro e o próprio
--    comprador enxergam — comprovante de PIX tem dado bancário/nome).
-- 3. Depois de subir o comprovante, o participante escolhe QUAIS números
--    quer (dentre os livres) — reserva atômica via RPC (sem dois
--    comprando o mesmo número na corrida).
-- 4. Rifeiro revisa cada comprovante e confirma ou rejeita. Rejeitar
--    devolve os números pro estoque livre.
-- 5. Só depois de zerar os pagamentos pendentes, o rifeiro pode sortear —
--    RPC sorteia no SERVIDOR entre os números confirmados, não dá pra
--    manipular pelo client.
-- ================================================================

-- ── 1. RIFAS ─────────────────────────────────────────────────────
create table if not exists raffles (
  id                bigint generated always as identity primary key,
  created_by        uuid not null default auth.uid() references auth.users(id),
  title             text not null,
  set_id            text,
  card_n            text,
  version           text,
  image_url         text,
  photo_urls        text[],
  description       text,
  ticket_count      integer not null check (ticket_count between 2 and 1000),
  ticket_price      numeric not null check (ticket_price > 0),
  pix_key           text not null,
  pix_titular       text not null,
  status            text not null default 'aberta' check (status in ('aberta','sorteada','cancelada')),
  winner_number     integer,
  winner_user_id    uuid references auth.users(id),
  drawn_at          timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table raffles enable row level security;

drop policy if exists "raffles_select" on raffles;
create policy "raffles_select" on raffles
  for select using (status <> 'cancelada' or created_by = auth.uid() or is_auction_admin());

drop policy if exists "raffles_insert_admin" on raffles;
create policy "raffles_insert_admin" on raffles
  for insert with check (is_auction_admin());

drop policy if exists "raffles_update_admin" on raffles;
create policy "raffles_update_admin" on raffles
  for update using (is_auction_admin());

drop policy if exists "raffles_delete_admin" on raffles;
create policy "raffles_delete_admin" on raffles
  for delete using (is_auction_admin());

-- ── 2. PAGAMENTOS (um registro por "leva" de números que alguém paga) ──
create table if not exists raffle_payments (
  id             bigint generated always as identity primary key,
  raffle_id      bigint not null references raffles(id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users(id),
  quantity       integer not null check (quantity > 0),
  total_amount   numeric not null check (total_amount > 0),
  proof_path     text not null,
  status         text not null default 'pendente' check (status in ('pendente','confirmado','rejeitado')),
  reviewed_by    uuid references auth.users(id),
  reviewed_at    timestamptz,
  reject_reason  text,
  created_at     timestamptz not null default now()
);

alter table raffle_payments enable row level security;

drop policy if exists "raffle_payments_select" on raffle_payments;
create policy "raffle_payments_select" on raffle_payments
  for select using (user_id = auth.uid() or is_auction_admin());

drop policy if exists "raffle_payments_insert" on raffle_payments;
create policy "raffle_payments_insert" on raffle_payments
  for insert with check (user_id = auth.uid() and status = 'pendente');

-- Sem policy de UPDATE pra usuário comum de propósito — confirmar/rejeitar
-- só passa pelas RPCs abaixo (security definer), nunca por update direto.

-- ── 3. NÚMEROS (uma linha por número, 1..ticket_count — criados
-- automaticamente quando a rifa é cadastrada, ver trigger abaixo) ──
create table if not exists raffle_numbers (
  id           bigint generated always as identity primary key,
  raffle_id    bigint not null references raffles(id) on delete cascade,
  number       integer not null,
  payment_id   bigint references raffle_payments(id) on delete set null,
  claimed_at   timestamptz,
  unique(raffle_id, number)
);

alter table raffle_numbers enable row level security;

drop policy if exists "raffle_numbers_select" on raffle_numbers;
create policy "raffle_numbers_select" on raffle_numbers
  for select using (
    exists(select 1 from raffles r where r.id = raffle_id and (r.status <> 'cancelada' or is_auction_admin()))
  );
-- Sem insert/update/delete direto pra ninguém — tudo passa pelo trigger de
-- criação e pelas RPCs de reservar/confirmar/rejeitar/sortear abaixo.

-- Gera os N números (1..ticket_count) assim que a rifa é criada. security
-- definer pra poder gravar em raffle_numbers mesmo sem policy de insert
-- pro usuário comum.
create or replace function generate_raffle_numbers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into raffle_numbers(raffle_id, number)
  select new.id, gs from generate_series(1, new.ticket_count) gs;
  return new;
end;
$$;

drop trigger if exists trg_generate_raffle_numbers on raffles;
create trigger trg_generate_raffle_numbers
  after insert on raffles
  for each row execute function generate_raffle_numbers();

-- ── 4. ACEITE DOS TERMOS (uma vez por participante, igual ao leilão) ──
create table if not exists raffle_rules_acceptance (
  user_id       uuid primary key references auth.users(id),
  rules_version text not null default 'v1',
  accepted_at   timestamptz not null default now()
);

alter table raffle_rules_acceptance enable row level security;

drop policy if exists "raffle_rules_acceptance_select" on raffle_rules_acceptance;
create policy "raffle_rules_acceptance_select" on raffle_rules_acceptance
  for select using (user_id = auth.uid() or is_auction_admin());

drop policy if exists "raffle_rules_acceptance_insert" on raffle_rules_acceptance;
create policy "raffle_rules_acceptance_insert" on raffle_rules_acceptance
  for insert with check (user_id = auth.uid());

drop policy if exists "raffle_rules_acceptance_update" on raffle_rules_acceptance;
create policy "raffle_rules_acceptance_update" on raffle_rules_acceptance
  for update using (user_id = auth.uid());

-- ── 5. RESERVAR NÚMEROS (atômico — trava a corrida de dois pegando o
-- mesmo número ao mesmo tempo) ──────────────────────────────────────
create or replace function claim_raffle_numbers(p_payment_id bigint, p_numbers int[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment raffle_payments%rowtype;
  v_taken   int;
begin
  select * into v_payment from raffle_payments where id = p_payment_id for update;
  if v_payment.id is null then
    raise exception 'Pagamento não encontrado.';
  end if;
  if v_payment.user_id <> auth.uid() then
    raise exception 'Esse pagamento não é seu.';
  end if;
  if v_payment.status <> 'pendente' then
    raise exception 'Esse pagamento já foi revisado — não dá mais pra escolher números por ele.';
  end if;
  if array_length(p_numbers, 1) is distinct from v_payment.quantity then
    raise exception 'Escolha exatamente % número(s), igual ao que você declarou ao subir o comprovante.', v_payment.quantity;
  end if;

  -- Trava as linhas dos números pedidos ANTES de checar — evita duas
  -- pessoas escolherem o mesmo número na mesma fração de segundo.
  perform 1 from raffle_numbers
    where raffle_id = v_payment.raffle_id and number = any(p_numbers)
    for update;

  select count(*) into v_taken from raffle_numbers
    where raffle_id = v_payment.raffle_id and number = any(p_numbers) and payment_id is not null;
  if v_taken > 0 then
    raise exception 'Um ou mais números escolhidos já foram reservados por outra pessoa — atualize a página e escolha outros.';
  end if;

  update raffle_numbers
    set payment_id = p_payment_id, claimed_at = now()
    where raffle_id = v_payment.raffle_id and number = any(p_numbers);
end;
$$;

grant execute on function claim_raffle_numbers(bigint, int[]) to authenticated;

-- ── 6. CONFIRMAR / REJEITAR PAGAMENTO (só rifeiro) ─────────────────
create or replace function confirm_raffle_payment(p_payment_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_auction_admin() then
    raise exception 'Só o rifeiro pode confirmar pagamentos.';
  end if;
  update raffle_payments
    set status = 'confirmado', reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_payment_id and status = 'pendente';
end;
$$;

grant execute on function confirm_raffle_payment(bigint) to authenticated;

create or replace function reject_raffle_payment(p_payment_id bigint, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_auction_admin() then
    raise exception 'Só o rifeiro pode rejeitar pagamentos.';
  end if;
  update raffle_payments
    set status = 'rejeitado', reviewed_by = auth.uid(), reviewed_at = now(), reject_reason = p_reason
    where id = p_payment_id and status = 'pendente';
  -- Devolve os números pro estoque livre.
  update raffle_numbers set payment_id = null, claimed_at = null where payment_id = p_payment_id;
end;
$$;

grant execute on function reject_raffle_payment(bigint, text) to authenticated;

-- ── 7. SORTEIO (só rifeiro, só depois de zerar pendências) ─────────
create or replace function draw_raffle(p_raffle_id bigint)
returns table(winner_number integer, winner_user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending    int;
  v_number     int;
  v_uid        uuid;
  v_status     text;
  v_scheduled  timestamptz;
begin
  if not is_auction_admin() then
    raise exception 'Só o rifeiro pode realizar o sorteio.';
  end if;

  select status, draw_scheduled_at into v_status, v_scheduled from raffles where id = p_raffle_id for update;
  if v_status is null then
    raise exception 'Rifa não encontrada.';
  end if;
  if v_status = 'sorteada' then
    raise exception 'Essa rifa já foi sorteada.';
  end if;
  if v_status = 'cancelada' then
    raise exception 'Rifa cancelada não pode ser sorteada.';
  end if;
  -- Se tem horário agendado (contagem regressiva pública), não deixa
  -- sortear antes da hora combinada — evita quebrar o "show ao vivo"
  -- pra quem está esperando o letreiro chegar a zero.
  if v_scheduled is not null and now() < v_scheduled then
    raise exception 'O sorteio está agendado para %  — aguarde a contagem regressiva chegar a zero.', to_char(v_scheduled at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI');
  end if;

  select count(*) into v_pending from raffle_payments
    where raffle_id = p_raffle_id and status = 'pendente';
  if v_pending > 0 then
    raise exception 'Ainda tem % pagamento(s) pendente(s) de revisão — confirme ou rejeite todos antes de sortear.', v_pending;
  end if;

  select rn.number, rp.user_id into v_number, v_uid
    from raffle_numbers rn
    join raffle_payments rp on rp.id = rn.payment_id
    where rn.raffle_id = p_raffle_id and rp.status = 'confirmado'
    order by random() limit 1;

  if v_number is null then
    raise exception 'Nenhum número confirmado ainda — não dá pra sortear.';
  end if;

  update raffles
    set status = 'sorteada', winner_number = v_number, winner_user_id = v_uid, drawn_at = now(), updated_at = now()
    where id = p_raffle_id;

  return query select v_number, v_uid;
end;
$$;

grant execute on function draw_raffle(bigint) to authenticated;

-- ── 8. BUCKET PRIVADO DOS COMPROVANTES DE PAGAMENTO ────────────────
-- NÃO é público (diferente de leilao-fotos) — comprovante de PIX tem
-- nome/dado bancário. Caminho é sempre "{user_id}/arquivo.jpg", e a
-- policy usa esse prefixo pra saber de quem é cada arquivo, então o
-- client SEMPRE precisa subir no caminho `${uid()}/...`.
insert into storage.buckets (id, name, public)
values ('rifa-comprovantes', 'rifa-comprovantes', false)
on conflict (id) do nothing;

drop policy if exists "rifa-comprovantes select" on storage.objects;
create policy "rifa-comprovantes select" on storage.objects
  for select using (
    bucket_id = 'rifa-comprovantes'
    and (is_auction_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );

drop policy if exists "rifa-comprovantes insert" on storage.objects;
create policy "rifa-comprovantes insert" on storage.objects
  for insert with check (
    bucket_id = 'rifa-comprovantes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ================================================================
-- 9. HORÁRIO DO SORTEIO + CONTAGEM REGRESSIVA (28/08/2026)
-- Pedido do Eduardo: depois que o rifeiro revisa/confirma todos os
-- pagamentos pendentes, ele marca dia e hora do sorteio. Todo mundo com
-- a rifa aberta na tela vê um letreiro com contagem regressiva (dado
-- lido direto de raffles.draw_scheduled_at, sem precisar de RPC nova pra
-- isso). Só dá pra agendar com zero pendências, igual à regra do sorteio
-- em si (draw_raffle), pra ninguém marcar hora sem ter revisado tudo.
-- ================================================================
alter table raffles add column if not exists draw_scheduled_at timestamptz;

create or replace function schedule_raffle_draw(p_raffle_id bigint, p_scheduled_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status  text;
  v_pending int;
begin
  if not is_auction_admin() then
    raise exception 'Só o rifeiro pode agendar o sorteio.';
  end if;

  select status into v_status from raffles where id = p_raffle_id for update;
  if v_status is null then
    raise exception 'Rifa não encontrada.';
  end if;
  if v_status <> 'aberta' then
    raise exception 'Só dá pra agendar sorteio de uma rifa aberta.';
  end if;

  select count(*) into v_pending from raffle_payments
    where raffle_id = p_raffle_id and status = 'pendente';
  if v_pending > 0 then
    raise exception 'Ainda tem % pagamento(s) pendente(s) de revisão — confirme ou rejeite todos antes de agendar o sorteio.', v_pending;
  end if;

  if p_scheduled_at <= now() then
    raise exception 'Escolha um horário no futuro.';
  end if;

  update raffles set draw_scheduled_at = p_scheduled_at, updated_at = now() where id = p_raffle_id;
end;
$$;

grant execute on function schedule_raffle_draw(bigint, timestamptz) to authenticated;

create or replace function cancel_raffle_draw_schedule(p_raffle_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_auction_admin() then
    raise exception 'Só o rifeiro pode cancelar o agendamento.';
  end if;
  update raffles set draw_scheduled_at = null, updated_at = now()
    where id = p_raffle_id and status = 'aberta';
end;
$$;

grant execute on function cancel_raffle_draw_schedule(bigint) to authenticated;

-- ================================================================
-- 10. ISOLAMENTO ENTRE RIFEIROS (28/08/2026)
-- Pedido do Eduardo: is_auction_admin() só diz "essa pessoa é
-- leiloeiro/rifeiro" — até aqui, isso dava acesso de gerenciar QUALQUER
-- rifa, de qualquer rifeiro. Agora cada rifeiro só gerencia (edita,
-- cancela, revisa comprovante, confirma/rejeita pagamento, agenda e
-- realiza o sorteio, vê o comprovante de PIX) as rifas que ELE MESMO
-- criou (raffles.created_by = auth.uid()). A lista pública de rifas
-- abertas continua igual pra todo mundo — isso aqui é só sobre quem
-- pode ADMINISTRAR o quê.
-- ================================================================

-- Rifa cancelada só aparece pro próprio criador (não pra outros rifeiros).
drop policy if exists "raffles_select" on raffles;
create policy "raffles_select" on raffles
  for select using (status <> 'cancelada' or created_by = auth.uid());

-- Editar (ex: reagendar campos futuros) e cancelar só o próprio criador.
drop policy if exists "raffles_update_admin" on raffles;
create policy "raffles_update_admin" on raffles
  for update using (is_auction_admin() and created_by = auth.uid());

drop policy if exists "raffles_delete_admin" on raffles;
create policy "raffles_delete_admin" on raffles
  for delete using (is_auction_admin() and created_by = auth.uid());

-- Comprovante de pagamento só quem pagou e o rifeiro DAQUELA rifa (não
-- qualquer rifeiro) enxergam a linha do pagamento.
drop policy if exists "raffle_payments_select" on raffle_payments;
create policy "raffle_payments_select" on raffle_payments
  for select using (
    user_id = auth.uid()
    or exists(select 1 from raffles r where r.id = raffle_id and r.created_by = auth.uid())
  );

-- Idem pro ARQUIVO da foto do comprovante no storage — só o dono do
-- comprovante e o rifeiro DAQUELA rifa específica (join por proof_path).
drop policy if exists "rifa-comprovantes select" on storage.objects;
create policy "rifa-comprovantes select" on storage.objects
  for select using (
    bucket_id = 'rifa-comprovantes'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists(
        select 1 from raffle_payments rp
        join raffles r on r.id = rp.raffle_id
        where rp.proof_path = name and r.created_by = auth.uid()
      )
    )
  );

-- Confirmar/rejeitar pagamento: só o rifeiro dono DAQUELA rifa.
create or replace function confirm_raffle_payment(p_payment_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_owner uuid;
begin
  select r.created_by into v_owner
    from raffle_payments rp join raffles r on r.id = rp.raffle_id
    where rp.id = p_payment_id;
  if v_owner is null then
    raise exception 'Pagamento não encontrado.';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'Só o rifeiro que criou essa rifa pode confirmar esse pagamento.';
  end if;
  update raffle_payments
    set status = 'confirmado', reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_payment_id and status = 'pendente';
end;
$$;

create or replace function reject_raffle_payment(p_payment_id bigint, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_owner uuid;
begin
  select r.created_by into v_owner
    from raffle_payments rp join raffles r on r.id = rp.raffle_id
    where rp.id = p_payment_id;
  if v_owner is null then
    raise exception 'Pagamento não encontrado.';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'Só o rifeiro que criou essa rifa pode rejeitar esse pagamento.';
  end if;
  update raffle_payments
    set status = 'rejeitado', reviewed_by = auth.uid(), reviewed_at = now(), reject_reason = p_reason
    where id = p_payment_id and status = 'pendente';
  update raffle_numbers set payment_id = null, claimed_at = null where payment_id = p_payment_id;
end;
$$;

-- Sortear: só o rifeiro dono da rifa.
create or replace function draw_raffle(p_raffle_id bigint)
returns table(winner_number integer, winner_user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending    int;
  v_number     int;
  v_uid        uuid;
  v_status     text;
  v_scheduled  timestamptz;
  v_owner      uuid;
begin
  select status, draw_scheduled_at, created_by into v_status, v_scheduled, v_owner
    from raffles where id = p_raffle_id for update;
  if v_status is null then
    raise exception 'Rifa não encontrada.';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'Só o rifeiro que criou essa rifa pode realizar o sorteio.';
  end if;
  if v_status = 'sorteada' then
    raise exception 'Essa rifa já foi sorteada.';
  end if;
  if v_status = 'cancelada' then
    raise exception 'Rifa cancelada não pode ser sorteada.';
  end if;
  if v_scheduled is not null and now() < v_scheduled then
    raise exception 'O sorteio está agendado para %  — aguarde a contagem regressiva chegar a zero.', to_char(v_scheduled at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI');
  end if;

  select count(*) into v_pending from raffle_payments
    where raffle_id = p_raffle_id and status = 'pendente';
  if v_pending > 0 then
    raise exception 'Ainda tem % pagamento(s) pendente(s) de revisão — confirme ou rejeite todos antes de sortear.', v_pending;
  end if;

  select rn.number, rp.user_id into v_number, v_uid
    from raffle_numbers rn
    join raffle_payments rp on rp.id = rn.payment_id
    where rn.raffle_id = p_raffle_id and rp.status = 'confirmado'
    order by random() limit 1;

  if v_number is null then
    raise exception 'Nenhum número confirmado ainda — não dá pra sortear.';
  end if;

  update raffles
    set status = 'sorteada', winner_number = v_number, winner_user_id = v_uid, drawn_at = now(), updated_at = now()
    where id = p_raffle_id;

  return query select v_number, v_uid;
end;
$$;

-- Agendar/cancelar agendamento do sorteio: só o rifeiro dono.
create or replace function schedule_raffle_draw(p_raffle_id bigint, p_scheduled_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status  text;
  v_pending int;
  v_owner   uuid;
begin
  select status, created_by into v_status, v_owner from raffles where id = p_raffle_id for update;
  if v_status is null then
    raise exception 'Rifa não encontrada.';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'Só o rifeiro que criou essa rifa pode agendar o sorteio dela.';
  end if;
  if v_status <> 'aberta' then
    raise exception 'Só dá pra agendar sorteio de uma rifa aberta.';
  end if;

  select count(*) into v_pending from raffle_payments
    where raffle_id = p_raffle_id and status = 'pendente';
  if v_pending > 0 then
    raise exception 'Ainda tem % pagamento(s) pendente(s) de revisão — confirme ou rejeite todos antes de agendar o sorteio.', v_pending;
  end if;

  if p_scheduled_at <= now() then
    raise exception 'Escolha um horário no futuro.';
  end if;

  update raffles set draw_scheduled_at = p_scheduled_at, updated_at = now() where id = p_raffle_id;
end;
$$;

create or replace function cancel_raffle_draw_schedule(p_raffle_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_owner uuid;
begin
  select created_by into v_owner from raffles where id = p_raffle_id for update;
  if v_owner is null then
    raise exception 'Rifa não encontrada.';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'Só o rifeiro que criou essa rifa pode cancelar o agendamento dela.';
  end if;
  update raffles set draw_scheduled_at = null, updated_at = now()
    where id = p_raffle_id and status = 'aberta';
end;
$$;

-- ================================================================
-- 11. PAGAMENTO MANUAL LANÇADO PELO PRÓPRIO RIFEIRO (28/08/2026)
-- Pedido do Eduardo: gente que pagou por fora (dinheiro, outro PIX
-- combinado direto, etc.) sem passar pelo fluxo normal do site. O
-- rifeiro escreve o nome da pessoa, marca os números e confirma tudo de
-- uma vez só — sem comprovante, sem conta de usuário, e o pagamento já
-- nasce "confirmado" (não passa pela fila de revisão, porque quem está
-- lançando já é o próprio rifeiro conferindo na hora).
-- ================================================================
alter table raffle_payments alter column user_id drop not null;
alter table raffle_payments alter column user_id drop default;
alter table raffle_payments alter column proof_path drop not null;
alter table raffle_payments add column if not exists buyer_name text;
alter table raffle_payments add column if not exists is_manual boolean not null default false;

alter table raffle_payments drop constraint if exists raffle_payments_owner_check;
alter table raffle_payments add constraint raffle_payments_owner_check
  check (
    (is_manual and buyer_name is not null and length(trim(buyer_name)) > 0)
    or (not is_manual and user_id is not null and proof_path is not null)
  );

create or replace function admin_add_manual_raffle_payment(p_raffle_id bigint, p_buyer_name text, p_numbers int[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raffle     raffles%rowtype;
  v_taken      int;
  v_qty        int;
  v_payment_id bigint;
begin
  select * into v_raffle from raffles where id = p_raffle_id for update;
  if v_raffle.id is null then
    raise exception 'Rifa não encontrada.';
  end if;
  if v_raffle.created_by <> auth.uid() then
    raise exception 'Só o rifeiro que criou essa rifa pode lançar pagamentos manuais nela.';
  end if;
  if v_raffle.status <> 'aberta' then
    raise exception 'Só dá pra lançar pagamento manual em rifa aberta.';
  end if;
  if p_buyer_name is null or length(trim(p_buyer_name)) = 0 then
    raise exception 'Informe o nome de quem pagou.';
  end if;
  v_qty := coalesce(array_length(p_numbers, 1), 0);
  if v_qty = 0 then
    raise exception 'Marque pelo menos um número.';
  end if;

  perform 1 from raffle_numbers
    where raffle_id = p_raffle_id and number = any(p_numbers)
    for update;

  select count(*) into v_taken from raffle_numbers
    where raffle_id = p_raffle_id and number = any(p_numbers) and payment_id is not null;
  if v_taken > 0 then
    raise exception 'Um ou mais números marcados já estão reservados — atualize a lista e escolha outros.';
  end if;

  insert into raffle_payments(raffle_id, user_id, quantity, total_amount, proof_path, status, buyer_name, is_manual, reviewed_by, reviewed_at)
  values (p_raffle_id, null, v_qty, v_qty * v_raffle.ticket_price, null, 'confirmado', trim(p_buyer_name), true, auth.uid(), now())
  returning id into v_payment_id;

  update raffle_numbers
    set payment_id = v_payment_id, claimed_at = now()
    where raffle_id = p_raffle_id and number = any(p_numbers);
end;
$$;

grant execute on function admin_add_manual_raffle_payment(bigint, text, int[]) to authenticated;

-- ================================================================
-- 12. ARQUIVAR RIFA SEM SORTEIO + CANCELADAS TAMBÉM NO ARQUIVO (28/08/2026)
-- Pedido do Eduardo: o rifeiro também tem um botão de "arquivar" — pra
-- encerrar/ocultar uma rifa aberta que ele não quer mais sortear, sem
-- passar pelo sorteio (novo status 'arquivada'). E as rifas que ele já
-- cancelou (antes só apareciam pra ele mesmo na lista principal) agora
-- também aparecem na aba Arquivo, em vez de ficar misturadas com as
-- abertas. A visibilidade de cancelada continua só pro próprio rifeiro
-- (raffles_select da seção 10) — 'arquivada' fica pública que nem
-- 'sorteada', não precisa de policy nova.
-- ================================================================
alter table raffles drop constraint if exists raffles_status_check;
alter table raffles add constraint raffles_status_check
  check (status in ('aberta','sorteada','cancelada','arquivada'));

create or replace function archive_raffle_without_draw(p_raffle_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_status text; v_owner uuid;
begin
  select status, created_by into v_status, v_owner from raffles where id = p_raffle_id for update;
  if v_status is null then
    raise exception 'Rifa não encontrada.';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'Só o rifeiro que criou essa rifa pode arquivá-la.';
  end if;
  if v_status <> 'aberta' then
    raise exception 'Só dá pra arquivar uma rifa aberta.';
  end if;
  update raffles set status = 'arquivada', updated_at = now() where id = p_raffle_id;
end;
$$;

grant execute on function archive_raffle_without_draw(bigint) to authenticated;

-- ================================================================
-- 13. ABA DE ACOMPANHAMENTO + CONSERTO DE NÚMEROS SEM ESCOLHA (28/08/2026)
-- Pedido do Eduardo: o rifeiro relatou gente que pagou (recebeu o PIX)
-- mas os números dela não aparecem — isso acontece quando o participante
-- sobe o comprovante (cria o pagamento) mas fecha a tela ANTES de
-- terminar o passo de escolher os números (submitRifPayment cria o
-- registro; claim_raffle_numbers só roda depois, num segundo passo). O
-- pagamento fica "órfão" de números pra sempre se ninguém completar.
--
-- Duas coisas:
--  a) O participante agora informa o NOME dele ao pagar (buyer_name),
--     pra aparecer na aba de acompanhamento mesmo sem cruzar com conta
--     de usuário nenhuma.
--  b) O rifeiro ganha uma função pra ele mesmo completar a escolha de
--     números de um pagamento que ficou "travado" sem número nenhum (ou
--     só com alguns) — só ele, dono da rifa, e só pra fechar a diferença
--     entre o que falta e o total já esperado (quantity).
-- ================================================================
create or replace function admin_assign_numbers_to_payment(p_payment_id bigint, p_numbers int[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment  raffle_payments%rowtype;
  v_owner    uuid;
  v_have     int;
  v_need     int;
  v_taken    int;
begin
  select * into v_payment from raffle_payments where id = p_payment_id for update;
  if v_payment.id is null then
    raise exception 'Pagamento não encontrado.';
  end if;

  select created_by into v_owner from raffles where id = v_payment.raffle_id;
  if v_owner <> auth.uid() then
    raise exception 'Só o rifeiro dono dessa rifa pode completar os números desse pagamento.';
  end if;

  select count(*) into v_have from raffle_numbers where payment_id = p_payment_id;
  v_need := v_payment.quantity - v_have;
  if v_need <= 0 then
    raise exception 'Esse pagamento já tem todos os números escolhidos.';
  end if;
  if coalesce(array_length(p_numbers, 1), 0) <> v_need then
    raise exception 'Marque exatamente % número(s) pra completar esse pagamento.', v_need;
  end if;

  perform 1 from raffle_numbers
    where raffle_id = v_payment.raffle_id and number = any(p_numbers)
    for update;

  select count(*) into v_taken from raffle_numbers
    where raffle_id = v_payment.raffle_id and number = any(p_numbers) and payment_id is not null;
  if v_taken > 0 then
    raise exception 'Um ou mais números marcados já estão reservados — atualize a lista e escolha outros.';
  end if;

  update raffle_numbers
    set payment_id = p_payment_id, claimed_at = now()
    where raffle_id = v_payment.raffle_id and number = any(p_numbers);
end;
$$;

grant execute on function admin_assign_numbers_to_payment(bigint, int[]) to authenticated;

-- Trava extra: não deixa confirmar um pagamento com números faltando —
-- é exatamente o estado que gerou o relato do Eduardo ("recebi o PIX
-- mas os números não aparecem"). Se faltar número, o rifeiro precisa
-- completar com admin_assign_numbers_to_payment antes de confirmar.
create or replace function confirm_raffle_payment(p_payment_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_owner uuid; v_qty int; v_have int;
begin
  select r.created_by, rp.quantity into v_owner, v_qty
    from raffle_payments rp join raffles r on r.id = rp.raffle_id
    where rp.id = p_payment_id;
  if v_owner is null then
    raise exception 'Pagamento não encontrado.';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'Só o rifeiro que criou essa rifa pode confirmar esse pagamento.';
  end if;

  select count(*) into v_have from raffle_numbers where payment_id = p_payment_id;
  if v_have < v_qty then
    raise exception 'Esse pagamento ainda não tem todos os números escolhidos (% de %) — complete os números antes de confirmar.', v_have, v_qty;
  end if;

  update raffle_payments
    set status = 'confirmado', reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_payment_id and status = 'pendente';
end;
$$;
