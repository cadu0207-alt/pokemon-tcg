-- Leilão em tempo real (17/10/2026): hora do servidor pro contador + Realtime na tabela auctions.
-- Aplicado em produção como migração `leilao_tempo_real_17out2026`.
create or replace function public.server_now()
returns timestamptz
language sql
stable
set search_path = ''
as $$ select now() $$;
revoke all on function public.server_now() from public;
grant execute on function public.server_now() to anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'auctions') then
    alter publication supabase_realtime add table public.auctions;
  end if;
end $$;
