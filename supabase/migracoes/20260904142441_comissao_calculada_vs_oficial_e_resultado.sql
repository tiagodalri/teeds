-- TEEDS · dois números de comissão lado a lado, e o resultado do cliente.

-- 1) o que o cliente ganhou ou perdeu, e quanto apostou, por dia
alter table public.comissoes_diarias
  add column if not exists entradas numeric not null default 0,
  add column if not exists resultado numeric not null default 0;

comment on column public.comissoes_diarias.comissao  is 'Comissão CALCULADA pela Teeds: taxa x pagamento de cada contrato.';
comment on column public.comissoes_diarias.entradas  is 'Soma das entradas (volume apostado) do cliente no dia.';
comment on column public.comissoes_diarias.resultado is 'Lucro (+) ou prejuízo (-) do cliente no dia.';

-- 2) o markup que a Deriv realmente registrou, por operação (null = não medido)
alter table public.operacoes_robos
  add column if not exists markup_deriv numeric;

comment on column public.operacoes_robos.markup       is 'Markup CALCULADO: taxa x pagamento.';
comment on column public.operacoes_robos.markup_deriv is 'app_markup_amount devolvido pela Deriv. Null = a operação não foi medida.';

-- 3) o número oficial da Deriv, por dia — do app inteiro.
-- A API markup-statistics não quebra por cliente: só totais por intervalo.
-- Por isso esta tabela é global, não tem user_id, e só o admin escreve nela.
create table if not exists public.markup_oficial_diario (
  dia date not null primary key,
  app_id text not null,
  comissao numeric not null default 0,
  volume numeric not null default 0,
  pagamentos numeric not null default 0,
  contratos integer not null default 0,
  clientes integer not null default 0,
  atualizado_em timestamptz not null default now()
);
comment on table public.markup_oficial_diario is
  'Markup OFICIAL da Deriv (GET /applications/v1/markup-statistics), por dia, do app inteiro. Só o dono do app consegue ler essa API.';

alter table public.markup_oficial_diario enable row level security;

drop policy if exists "admin le o markup oficial" on public.markup_oficial_diario;
create policy "admin le o markup oficial" on public.markup_oficial_diario
  for select to authenticated using ((select public.teeds_sou_admin()));

drop policy if exists "admin grava o markup oficial" on public.markup_oficial_diario;
create policy "admin grava o markup oficial" on public.markup_oficial_diario
  for insert to authenticated with check ((select public.teeds_sou_admin()));

drop policy if exists "admin atualiza o markup oficial" on public.markup_oficial_diario;
create policy "admin atualiza o markup oficial" on public.markup_oficial_diario
  for update to authenticated
  using ((select public.teeds_sou_admin()))
  with check ((select public.teeds_sou_admin()));
