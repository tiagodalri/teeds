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
create policy "cliente grava suas operacoes de robo" on public.operacoes_robos for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "cliente atualiza suas operacoes de robo" on public.operacoes_robos;
create policy "cliente atualiza suas operacoes de robo" on public.operacoes_robos for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "cliente ve suas operacoes de robo" on public.operacoes_robos;
create policy "cliente ve suas operacoes de robo" on public.operacoes_robos for select to authenticated using (user_id = (select auth.uid()) or (select public.teeds_sou_admin()));

-- O painel não precisa transferir centenas de milhares de contratos para o
-- navegador. A agregação acontece no PostgreSQL e devolve somente uma linha
-- por robô. SECURITY INVOKER mantém as regras de acesso do usuário conectado.
create or replace function public.teeds_metricas_robos(p_dias integer default 90)
returns table (
  robo_id text, robo_nome text, operacoes bigint, vitorias bigint,
  clientes bigint, volume numeric, resultado numeric, markup numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    o.robo_id,
    max(o.robo_nome) as robo_nome,
    count(*) as operacoes,
    count(*) filter (where o.ganhou) as vitorias,
    count(distinct o.user_id) as clientes,
    coalesce(sum(o.entrada), 0) as volume,
    coalesce(sum(o.resultado), 0) as resultado,
    coalesce(sum(o.markup) filter (where not o.demo), 0) as markup
  from public.operacoes_robos o
  where public.teeds_sou_admin()
    and o.executada_em >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 90), 3650)))
  group by o.robo_id
  order by markup desc, operacoes desc;
$$;

revoke all on function public.teeds_metricas_robos(integer) from public;
revoke all on function public.teeds_metricas_robos(integer) from anon;
grant execute on function public.teeds_metricas_robos(integer) to authenticated;
