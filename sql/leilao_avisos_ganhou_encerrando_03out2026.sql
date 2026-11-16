-- Leilão: avisos "Você ganhou!" e "Encerrando em breve" — 03/10/2026
--
-- Dois tipos novos em `notifications` (sino + push imediato; o gatilho notify_dispatch já empurra qualquer tipo
-- fora de push_broadcast_types(), então não precisa mexer na fila de broadcast):
--   • auction_won    — pro vencedor, na hora do fechamento (também por arremate imediato). Entra no e-mail
--                      (EMAIL_TYPES no notify-dispatch): é o aviso mais importante pra quem precisa PAGAR.
--   • auction_ending — pra quem tem lance em lotes que encerram em ≤ 1h. 1 aviso por pessoa por RODADA
--                      (agrega os lotes), só sino + push (sem e-mail, pra não gastar a cota da Resend).
--
-- Dedupe do "encerrando": índice único parcial (user_id, round_id) — o cron roda de 5 em 5 min e pode ver o mesmo
-- lote várias vezes; o 1º aviso vale e anti-snipe (que empurra o fim de um lote) não gera aviso novo.

-- ── 1) "Você ganhou": acrescenta o vencedor ao gatilho de fechamento (o aviso de "não foi o vencedor" segue igual) ──
create or replace function notify_auction_closed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_due timestamptz;
begin
  -- Perdedores (quem deu lance e não ganhou)
  insert into notifications (user_id, type, auction_id, title, body, data)
  select distinct
    b.bidder_id,
    'auction_closed',
    new.id,
    'Leilão encerrado',
    format('O leilão de %s encerrou e o seu lance não foi o vencedor.', new.card_name),
    jsonb_build_object('auction_id', new.id, 'card_name', new.card_name, 'url', '/?leilao=' || new.id)
  from auction_bids b
  where b.auction_id = new.id
    and b.bidder_id is distinct from new.winner_id;

  -- Vencedor
  if new.winner_id is not null then
    select payment_due_at into v_due from auction_rounds where id = new.round_id;

    insert into notifications (user_id, type, auction_id, title, body, data)
    values (
      new.winner_id,
      'auction_won',
      new.id,
      'Você ganhou o leilão! 🏆',
      format(
        'Parabéns! Você venceu %s com o lance de R$ %s.%s',
        new.card_name,
        replace(to_char(coalesce(new.winning_bid, new.current_bid), 'FM999999990.00'), '.', ','),
        case when v_due is not null
             then ' Pague até ' || to_char(v_due at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') || ' para garantir a carta.'
             else ' Acesse o leilão para ver o seu pedido e pagar.' end
      ),
      jsonb_build_object(
        'auction_id', new.id,
        'card_name', new.card_name,
        'winning_bid', coalesce(new.winning_bid, new.current_bid),
        'payment_due_at', v_due,
        'url', '/?leilao=' || new.id
      )
    );
  end if;

  return new;
end;
$function$;

-- ── 2) "Encerrando em breve": dedupe + função + cron ──
create unique index if not exists notifications_auction_ending_uniq
  on notifications (user_id, ((data->>'round_id')))
  where type = 'auction_ending';

create or replace function notify_auctions_ending()
returns int
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_n int;
begin
  with lots as (
    select a.id, a.round_id, a.card_name, a.current_bid, a.current_bidder, a.end_at
    from auctions a
    where a.status = 'ativo'
      and a.end_at > now()
      and a.end_at <= now() + interval '1 hour'
  ),
  mine as (   -- cada participante × lote em que ele deu lance
    select distinct b.bidder_id as u, l.id, l.round_id, l.card_name, l.current_bid, l.current_bidder, l.end_at
    from lots l join auction_bids b on b.auction_id = l.id
  ),
  per_user as (
    select u, round_id,
      count(*)                                              as n,
      count(*) filter (where current_bidder = u)            as lead,
      count(*) filter (where current_bidder is distinct from u) as lost,
      min(end_at)                                           as end_at,
      -- lote em foco: o 1º que a pessoa PERDEU (é onde dá pra agir); senão o 1º que ela lidera
      (array_agg(id        order by (current_bidder is distinct from u) desc, end_at, id))[1] as focus_id,
      (array_agg(card_name order by (current_bidder is distinct from u) desc, end_at, id))[1] as focus_card,
      (array_agg(current_bid order by (current_bidder is distinct from u) desc, end_at, id))[1] as focus_bid,
      (array_agg(current_bidder = u order by (current_bidder is distinct from u) desc, end_at, id))[1] as focus_leading
    from mine
    group by u, round_id
  ),
  msg as (
    select pu.*,
      case when (pu.end_at at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
           then 'às ' || to_char(pu.end_at at time zone 'America/Sao_Paulo', 'HH24:MI')
           else 'em ' || to_char(pu.end_at at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') end as quando,
      replace(to_char(pu.focus_bid, 'FM999999990.00'), '.', ',') as bid_txt
    from per_user pu
  )
  insert into notifications (user_id, type, auction_id, title, body, data)
  select
    m.u,
    'auction_ending',
    m.focus_id,
    case when m.lost > 0 then 'Encerrando em breve — dê seu lance' else 'Encerrando em breve' end,
    case
      when m.n = 1 and m.focus_leading
        then format('%s: você está com o maior lance (R$ %s). Encerra %s.', m.focus_card, m.bid_txt, m.quando)
      when m.n = 1
        then format('%s: seu lance foi coberto (atual R$ %s). Encerra %s — dê um novo lance.', m.focus_card, m.bid_txt, m.quando)
      else format('Você tem lances em %s lotes: %s vencendo e %s cobertos. Encerra %s.', m.n, m.lead, m.lost, m.quando)
    end,
    jsonb_build_object(
      'auction_id', m.focus_id,
      'round_id',   m.round_id,
      'card_name',  m.focus_card,
      'lots',       m.n,
      'leading',    m.lead,
      'outbid',     m.lost,
      'end_at',     m.end_at,
      'url',        '/?leilao=' || m.focus_id
    )
  from msg m
  on conflict do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

revoke all on function notify_auctions_ending() from public, anon, authenticated;
grant execute on function notify_auctions_ending() to service_role;

-- de 5 em 5 minutos (o aviso chega entre 55 e 60 min antes do fim)
select cron.schedule('auction-ending-notify', '*/5 * * * *', $$select public.notify_auctions_ending()$$);
