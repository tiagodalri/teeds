-- De quem é cada contrato da conta do cliente, dia a dia.
--
-- A conta Deriv é do cliente: ele pode operar pela Teeds, pela OMNI, pelo
-- app da própria Deriv ou por outro robô qualquer. Esta tabela separa isso,
-- para a receita nunca mais somar operação que não passou por aqui
-- (30/09/2026: um cliente que nunca ligou um robô aparecia com comissão).
--
-- `comissoes_diarias` continua sendo a receita da marca; aqui fica o mapa
-- completo, inclusive o que é externo, para conferência.
create table if not exists public.contratos_por_origem (
  dia date not null,
  conta_id text not null,
  marca text not null,
  user_id uuid not null,
  origem text not null,
  demo boolean not null default false,
  moeda text not null default 'USD',
  operacoes integer not null default 0,
  entradas numeric not null default 0,
  pagamentos numeric not null default 0,
  resultado numeric not null default 0,
  markup_estimado numeric not null default 0,
  por_registro integer not null default 0,
  por_app integer not null default 0,
  por_horario integer not null default 0,
  sem_pista integer not null default 0,
  apps text[] not null default '{}',
  atualizado_em timestamptz not null default now(),
  primary key (dia, conta_id, marca, origem)
);

create index if not exists contratos_por_origem_marca_dia on public.contratos_por_origem (marca, dia desc);
create index if not exists contratos_por_origem_user on public.contratos_por_origem (user_id, dia desc);

alter table public.contratos_por_origem enable row level security;

drop policy if exists "admin da marca le contratos por origem" on public.contratos_por_origem;
create policy "admin da marca le contratos por origem" on public.contratos_por_origem
  for select to authenticated using (public.teeds_sou_admin_da(marca));

revoke insert, update, delete on public.contratos_por_origem from authenticated, anon;
