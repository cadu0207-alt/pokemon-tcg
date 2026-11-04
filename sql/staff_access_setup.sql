-- ================================================================
-- MyDeck — ACESSO DA EQUIPE (staff_access_setup.sql)
-- Pedido do Eduardo (21/08/2026): dar acesso de "visualização total" pro
-- Caio (caiofernandowork@gmail.com) e pro André (andresollecito@hotmail.com)
-- na aba Admin, sem que eles consigam editar/excluir NADA por padrão — e
-- deixar pronta uma telinha (dentro da própria aba Admin) onde o Eduardo
-- marca, pessoa por pessoa, quais ações específicas cada um pode fazer:
-- cadastrar/editar em Lojas & Ofertas, responder Feedback, aprovar/rejeitar
-- em Lojas Confiáveis, aprovar/rejeitar em Cadastro Positivo, e publicar no
-- mural de Atualizações.
--
-- COMO FUNCIONA:
--   1) Tabela `staff_access`: 1 linha por pessoa da equipe (uid, email,
--      permissions[]). Só o Eduardo lê/grava essa tabela (RLS).
--   2) is_staff_member() → true pro Eduardo OU qualquer linha em
--      staff_access (não olha permissions — é só "faz parte da equipe,
--      pode ENXERGAR os painéis admin"). Usado nos RPCs de leitura
--      (estatísticas, lista de usuários, mensagens de feedback etc.).
--   3) is_staff_for('area') → true pro Eduardo OU quem tem 'area' dentro
--      de permissions. Usado nas policies/triggers de ESCRITA.
--   4) Cada tabela ganha uma policy ADICIONAL (além da que já existia,
--      travada no UID do Eduardo) liberando insert/update pra quem tem a
--      permissão da área — sem tocar/remover a policy antiga. Onde a
--      escrita mexe em algo sensível (link de afiliado, CNPJ, comissão),
--      um trigger BEFORE UPDATE barra a mudança desses campos específicos
--      mesmo que a policy deixe passar a linha.
--
-- IMPORTANTE: a permissão "leilao" foi deixada de fora de propósito — o
-- sistema de leilão mexe com lances, pedidos e pagamentos reais, e merece
-- uma revisão própria antes de abrir edição pra outra pessoa.
--
-- Rode isso inteiro no SQL Editor do Supabase (depois de todos os scripts
-- que já rodaram antes — ele só ADICIONA coisas novas, não mexe no que já
-- existe além das relaxações de leitura explicadas acima).
-- ================================================================

-- ── 1) TABELA DA EQUIPE ──────────────────────────────────────────
create table if not exists staff_access (
  uid uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  permissions text[] not null default '{}',
  added_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table staff_access enable row level security;

drop policy if exists "staff_access_admin_all" on staff_access;
create policy "staff_access_admin_all" on staff_access
  for all
  using (auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b')
  with check (auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b');

-- ── 2) HELPERS ────────────────────────────────────────────────────
create or replace function is_staff_member()
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b'
      or exists (select 1 from staff_access where uid = auth.uid());
$$;

create or replace function is_staff_for(area text)
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b'
      or exists (
        select 1 from staff_access
        where uid = auth.uid() and area = any(permissions)
      );
$$;

grant execute on function is_staff_member() to authenticated;
grant execute on function is_staff_for(text) to authenticated;

-- ── 3) RPCs de gestão da equipe (só o Eduardo chama) ──────────────

-- get_my_staff_access() — qualquer usuário logado pode chamar, mas só
-- recebe de volta a PRÓPRIA linha (is_staff + permissions). É o que o
-- site usa no carregamento da página pra decidir se mostra a aba Admin
-- em modo visualização pra quem não é o Eduardo.
create or replace function get_my_staff_access()
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result json;
begin
  if auth.uid() is null then
    return json_build_object('is_staff', false, 'permissions', '[]'::json);
  end if;

  select json_build_object(
    'is_staff', true,
    'permissions', coalesce(to_jsonb(permissions), '[]'::jsonb)
  ) into result
  from staff_access
  where uid = auth.uid();

  if result is null then
    return json_build_object('is_staff', false, 'permissions', '[]'::json);
  end if;

  return result;
end;
$$;

grant execute on function get_my_staff_access() to authenticated;

-- add_staff_member(email, nome) — só o Eduardo. Acha o UID pelo e-mail em
-- auth.users — a pessoa PRECISA já ter feito login pelo menos uma vez no
-- site (Google ou email/senha) antes disso funcionar. Cria a linha com
-- permissions vazio (só visualização, até o Eduardo marcar alguma
-- caixinha na tela).
create or replace function add_staff_member(p_email text, p_display_name text default null)
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid;
begin
  if auth.uid() is null or auth.uid() <> 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b' then
    raise exception 'not authorized';
  end if;

  select id into v_uid from auth.users where lower(email) = lower(trim(p_email)) limit 1;

  if v_uid is null then
    raise exception 'user_not_found';
  end if;

  insert into staff_access (uid, email, display_name, added_by)
  values (v_uid, lower(trim(p_email)), nullif(trim(p_display_name), ''), auth.uid())
  on conflict (uid) do update
    set email = excluded.email,
        display_name = coalesce(excluded.display_name, staff_access.display_name),
        updated_at = now();

  return (select row_to_json(s) from staff_access s where uid = v_uid);
end;
$$;

grant execute on function add_staff_member(text, text) to authenticated;

-- set_staff_permissions(uid, permissions[]) — só o Eduardo. Áreas válidas
-- hoje: 'lojas', 'feedback', 'marketplace', 'positivo', 'updates'.
create or replace function set_staff_permissions(p_uid uuid, p_permissions text[])
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null or auth.uid() <> 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b' then
    raise exception 'not authorized';
  end if;

  update staff_access
  set permissions = coalesce(p_permissions, '{}'),
      updated_at = now()
  where uid = p_uid;
end;
$$;

grant execute on function set_staff_permissions(uuid, text[]) to authenticated;

-- remove_staff_member(uid) — só o Eduardo.
create or replace function remove_staff_member(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null or auth.uid() <> 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b' then
    raise exception 'not authorized';
  end if;

  delete from staff_access where uid = p_uid;
end;
$$;

grant execute on function remove_staff_member(uuid) to authenticated;

-- ================================================================
-- 4) RELAXA OS RPCs DE LEITURA (painéis admin) PRA QUALQUER MEMBRO DA
--    EQUIPE, NÃO SÓ O EDUARDO — mesmo corpo de cada função de antes,
--    só troca a linha de autorização de "auth.uid() = Eduardo" pra
--    "is_staff_member()". Isso NÃO libera nenhuma escrita, só leitura.
-- ================================================================

create or replace function admin_dashboard_stats()
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result json;
begin
  if not is_staff_member() then
    raise exception 'not authorized';
  end if;

  select json_build_object(
    'total_users', (select count(*) from auth.users),
    'signups_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'signups_30d', (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'active_users', (select count(distinct user_id) from collection),
    'total_cards_collected', (select count(*) from collection),
    'total_purchases', (select count(*) from purchases),
    'tracked_products', (select count(*) from ml_search_terms where active = true),
    'last_signup_at', (select max(created_at) from auth.users),
    'last_card_at', (select max(marked_at) from collection)
  ) into result;

  return result;
end;
$$;

grant execute on function admin_dashboard_stats() to authenticated;

create or replace function admin_usage_timeline(days int default 30)
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result json;
begin
  if not is_staff_member() then
    raise exception 'not authorized';
  end if;

  select coalesce(json_agg(row_to_json(t) order by t.day), '[]'::json)
  into result
  from (
    select
      d::date as day,
      (select count(*) from site_visits sv where sv.visit_date = d::date) as visits,
      (select count(*) from auth.users u where u.created_at::date = d::date) as signups
    from generate_series(
      current_date - ((coalesce(days, 30) - 1) * interval '1 day'),
      current_date,
      interval '1 day'
    ) d
  ) t;

  return result;
end;
$$;

grant execute on function admin_usage_timeline(int) to authenticated;

create or replace function admin_tab_stats(days int default 30)
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result json;
begin
  if not is_staff_member() then
    raise exception 'not authorized';
  end if;

  select coalesce(json_agg(row_to_json(t) order by t.total desc), '[]'::json)
  into result
  from (
    select
      tab_id,
      count(*) as total,
      count(*) filter (where visit_date > current_date - (coalesce(days, 30) * interval '1 day')) as recent,
      count(distinct user_id) as unique_users
    from tab_visits
    group by tab_id
  ) t;

  return result;
end;
$$;

grant execute on function admin_tab_stats(int) to authenticated;

create or replace function admin_product_redirect_stats(days int default 30)
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result json;
begin
  if not is_staff_member() then
    raise exception 'not authorized';
  end if;

  select json_build_object(
    'total_clicks', (select count(*) from ml_product_redirects),
    'total_clicks_recent', (select count(*) from ml_product_redirects where created_at > now() - (coalesce(days, 30) * interval '1 day')),
    'items', (
      select coalesce(json_agg(row_to_json(t) order by t.clicks desc), '[]'::json)
      from (
        select
          c.term_id,
          coalesce(st.label, st.term, 'produto removido') as label,
          st.collection,
          count(*) as clicks,
          count(*) filter (where c.created_at > now() - (coalesce(days, 30) * interval '1 day')) as clicks_recent
        from ml_product_redirects c
        left join ml_search_terms st on st.id = c.term_id
        group by c.term_id, st.label, st.term, st.collection
      ) t
    )
  ) into result;

  return result;
end;
$$;

grant execute on function admin_product_redirect_stats(int) to authenticated;

create or replace function admin_list_users()
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result json;
begin
  if not is_staff_member() then
    raise exception 'not authorized';
  end if;

  select coalesce(json_agg(row_to_json(t) order by t.last_seen desc nulls last), '[]'::json)
  into result
  from (
    select
      u.id as user_id,
      u.email,
      u.created_at as signed_up_at,
      (select max(sv.visit_date) from site_visits sv where sv.user_id = u.id) as last_seen,
      (select count(*) from collection c where c.user_id = u.id) as cards_collected,
      (select count(*) from purchases p where p.user_id = u.id) as purchases_count
    from auth.users u
  ) t;

  return result;
end;
$$;

grant execute on function admin_list_users() to authenticated;

create or replace function admin_set_distribution()
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result json;
begin
  if not is_staff_member() then
    raise exception 'not authorized';
  end if;

  select coalesce(json_agg(row_to_json(t) order by t.collectors desc), '[]'::json)
  into result
  from (
    select
      split_part(slot_key, ':', 1) as set_id,
      count(distinct user_id) as collectors,
      count(*) as cards_marked
    from collection
    group by split_part(slot_key, ':', 1)
  ) t;

  return result;
end;
$$;

grant execute on function admin_set_distribution() to authenticated;

create or replace function admin_list_feedback()
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result json;
begin
  if not is_staff_member() then
    raise exception 'not authorized';
  end if;

  select coalesce(json_agg(row_to_json(t) order by t.created_at desc), '[]'::json)
  into result
  from (
    select
      fm.id,
      fm.user_id,
      u.email as user_email,
      fm.message,
      fm.created_at,
      fm.reply,
      fm.replied_at
    from feedback_messages fm
    join auth.users u on u.id = fm.user_id
  ) t;

  return result;
end;
$$;

grant execute on function admin_list_feedback() to authenticated;

-- ================================================================
-- 5) RPC DE ESCRITA relaxado só pra quem tem a permissão 'feedback'
-- ================================================================
create or replace function admin_reply_feedback(msg_id bigint, reply_text text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not is_staff_for('feedback') then
    raise exception 'not authorized';
  end if;

  update feedback_messages
  set reply = reply_text, replied_at = now(), ack = false
  where id = msg_id;
end;
$$;

grant execute on function admin_reply_feedback(bigint, text) to authenticated;

-- ================================================================
-- 6) POLICIES ADICIONAIS DE ESCRITA por área — não removem nenhuma
--    policy existente, só somam mais uma condição permissiva (Postgres
--    combina policies do mesmo comando com OR).
-- ================================================================

-- ── Lojas & Ofertas (permissão 'lojas') ──
-- INSERT em ml_search_terms já funciona pra qualquer logado (own_terms
-- usa auth.uid() = user_id, e user_id nasce com default auth.uid()).
-- Falta UPDATE em linhas que já são do Eduardo (cadastro antigo).
drop policy if exists "staff_lojas_update_ml_search_terms" on ml_search_terms;
create policy "staff_lojas_update_ml_search_terms" on ml_search_terms
  for update
  using (is_staff_for('lojas'))
  with check (is_staff_for('lojas'));

-- Trava o link de afiliado (routea a comissão do Eduardo) mesmo se a
-- policy acima deixar a linha passar.
create or replace function guard_ml_search_terms_staff_update()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() <> 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b'
     and NEW.affiliate_url is distinct from OLD.affiliate_url then
    raise exception 'só o Eduardo pode alterar o link de afiliado';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_guard_ml_search_terms_staff_update on ml_search_terms;
create trigger trg_guard_ml_search_terms_staff_update
  before update on ml_search_terms
  for each row execute function guard_ml_search_terms_staff_update();

-- ml_coupon_rules (regra geral de cupom, ex: "20% OFF acima de R$79"):
-- insert/update (não delete) pra quem tem 'lojas'.
drop policy if exists "staff_lojas_insert_ml_coupon_rules" on ml_coupon_rules;
create policy "staff_lojas_insert_ml_coupon_rules" on ml_coupon_rules
  for insert
  with check (is_staff_for('lojas'));

drop policy if exists "staff_lojas_update_ml_coupon_rules" on ml_coupon_rules;
create policy "staff_lojas_update_ml_coupon_rules" on ml_coupon_rules
  for update
  using (is_staff_for('lojas'))
  with check (is_staff_for('lojas'));

-- ml_coupons (cupom vinculado a um produto específico): insert/update
-- (não delete) pra quem tem 'lojas'.
drop policy if exists "staff_lojas_insert_ml_coupons" on ml_coupons;
create policy "staff_lojas_insert_ml_coupons" on ml_coupons
  for insert
  with check (is_staff_for('lojas'));

drop policy if exists "staff_lojas_update_ml_coupons" on ml_coupons;
create policy "staff_lojas_update_ml_coupons" on ml_coupons
  for update
  using (is_staff_for('lojas'))
  with check (is_staff_for('lojas'));

-- ── Lojas Confiáveis / Marketplace (permissão 'marketplace') ──
-- Aprovar/rejeitar é um UPDATE de status em trusted_stores.
drop policy if exists "staff_marketplace_update_trusted_stores" on trusted_stores;
create policy "staff_marketplace_update_trusted_stores" on trusted_stores
  for update
  using (is_staff_for('marketplace'))
  with check (is_staff_for('marketplace'));

-- Trava os dados cadastrais da loja (CNPJ, comissão, dono) — quem tem
-- 'marketplace' só pode mudar status/observações, não os dados de negócio.
create or replace function guard_trusted_stores_staff_update()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b' then
    return NEW;
  end if;
  if NEW.cnpj is distinct from OLD.cnpj
     or NEW.comissao_pct is distinct from OLD.comissao_pct
     or NEW.owner_user_id is distinct from OLD.owner_user_id
     or NEW.nome_fantasia is distinct from OLD.nome_fantasia then
    raise exception 'equipe só pode aprovar/rejeitar — não pode editar os dados cadastrais da loja';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_guard_trusted_stores_staff_update on trusted_stores;
create trigger trg_guard_trusted_stores_staff_update
  before update on trusted_stores
  for each row execute function guard_trusted_stores_staff_update();

-- ── Cadastro Positivo (permissão 'positivo') ──
drop policy if exists "staff_positivo_update_positive_companies" on positive_companies;
create policy "staff_positivo_update_positive_companies" on positive_companies
  for update
  using (is_staff_for('positivo'))
  with check (is_staff_for('positivo'));

create or replace function guard_positive_companies_staff_update()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b' then
    return NEW;
  end if;
  if NEW.nome is distinct from OLD.nome
     or NEW.instagram is distinct from OLD.instagram
     or NEW.tiktok is distinct from OLD.tiktok
     or NEW.site is distinct from OLD.site
     or NEW.submitted_by is distinct from OLD.submitted_by then
    raise exception 'equipe só pode aprovar/rejeitar — não pode editar os dados da indicação';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_guard_positive_companies_staff_update on positive_companies;
create trigger trg_guard_positive_companies_staff_update
  before update on positive_companies
  for each row execute function guard_positive_companies_staff_update();

-- ── Atualizações / changelog (permissão 'updates') ──
-- Só publicar (insert). Apagar continua só do Eduardo (updates_admin_delete).
drop policy if exists "staff_updates_insert_site_updates" on site_updates;
create policy "staff_updates_insert_site_updates" on site_updates
  for insert
  with check (is_staff_for('updates'));

-- ================================================================
-- Fim. Depois de rodar: no site, logado como Eduardo, abra a aba Admin
-- → bloco "Equipe" (staff_access.js) pra cadastrar o Caio e o André por
-- e-mail (eles precisam ter logado no site pelo menos uma vez antes) e
-- marcar as permissões de cada um.
-- ================================================================
