-- TEEDS · telemetria econômica por robô
-- Seguro para executar novamente: tabela, índices e políticas são idempotentes.

create table if not exists public.operacoes_robos (
  contract_id bigint not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  conta_id text not null, robo_id text not null, robo_nome text not null,
  ativo text not null, tipo_contrato text not null, moeda text not null default 'USD',
  demo boolean not null default true, entrada numeric not null default 0,
  pagamento numeric not null default 0, resultado numeric not null default 0,
  markup numeric not null default 0, ganhou boolean not null default false,
  executada_em timestamptz not null, criado_em timestamptz not null default now(),
  primary key (user_id, contract_id)
);
create index if not exists operacoes_robos_data_idx on public.operacoes_robos (executada_em desc);
create index if not exists operacoes_robos_robo_idx on public.operacoes_robos (robo_id, executada_em desc);
create index if not exists operacoes_robos_cliente_idx on public.operacoes_robos (user_id, executada_em desc);
alter table public.operacoes_robos enable row level security;

drop policy if exists "cliente grava suas operacoes de robo" on public.operacoes_robos;
create policy "cliente grava suas operacoes de robo" on public.operacoes_robos for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "cliente atualiza suas operacoes de robo" on public.operacoes_robos;
create policy "cliente atualiza suas operacoes de robo" on public.operacoes_robos for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "cliente ve suas operacoes de robo" on public.operacoes_robos;
create policy "cliente ve suas operacoes de robo" on public.operacoes_robos for select to authenticated using (user_id = auth.uid() or public.teeds_sou_admin());
