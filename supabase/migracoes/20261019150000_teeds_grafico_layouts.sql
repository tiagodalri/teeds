-- Gráfico profissional (19/10/2026, GlobalFly): indicadores e desenhos de
-- cada pessoa, para acompanharem a pessoa em qualquer aparelho.
--   simbolo = '*'      -> os indicadores (valem para todos os ativos)
--   simbolo = 'R_75'.. -> os desenhos daquele ativo
-- Cada um só lê e mexe no que é seu. O tamanho é limitado para o banco não
-- crescer com rabiscos (um desenho ocupa poucos bytes).
create table if not exists public.grafico_layouts (
  user_id uuid not null references auth.users(id) on delete cascade,
  marca text not null check (marca in ('teeds','omni','globalfly')),
  simbolo text not null check (char_length(simbolo) between 1 and 40),
  dados jsonb not null default '{}'::jsonb check (pg_column_size(dados) < 200000),
  atualizado_em timestamptz not null default now(),
  primary key (user_id, marca, simbolo)
);
alter table public.grafico_layouts enable row level security;
create policy "cada um le o proprio grafico" on public.grafico_layouts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "cada um grava o proprio grafico" on public.grafico_layouts
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "cada um muda o proprio grafico" on public.grafico_layouts
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "cada um apaga o proprio grafico" on public.grafico_layouts
  for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.grafico_layouts to authenticated;
