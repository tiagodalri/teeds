-- 23/10/2026 (Tiago): a operação manual aparece no Monitoramento ao vivo desde a compra.
-- A linha nasce 'aberta' na compra e é atualizada no fim (ganhou/perdeu/vendida).
alter table public.operacoes_manuais add column if not exists situacao text not null default 'encerrada';
alter table public.operacoes_manuais add column if not exists expira_em timestamptz;
alter table public.operacoes_manuais add column if not exists atualizado_em timestamptz not null default now();
create index if not exists operacoes_manuais_marca_situacao_idx on public.operacoes_manuais (marca, situacao, comprada_em desc);
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'operacoes_manuais') then
    alter publication supabase_realtime add table public.operacoes_manuais;
  end if;
end $$;
