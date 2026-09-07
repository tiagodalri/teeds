-- As últimas tabelas que ainda não separavam.

-- Produtos liberados a um cliente: quem administra a Teeds não mexe nas
-- liberações da OMNI.
drop policy if exists "admin gerencia liberacoes" on public.cliente_produtos;
drop policy if exists "proprio ou admin le" on public.cliente_produtos;
drop policy if exists "cliente ve suas liberacoes" on public.cliente_produtos;
create policy "admin desta marca gerencia liberacoes" on public.cliente_produtos
  for all to authenticated
  using (public.teeds_sou_admin_da(marca)) with check (public.teeds_sou_admin_da(marca));
create policy "cliente ve suas liberacoes" on public.cliente_produtos
  for select to authenticated
  using (user_id = (select auth.uid()) or public.teeds_sou_admin_da(marca));

-- Markup oficial da Deriv: vem POR APP, e cada app é de uma marca. Ganha a
-- coluna para a permissão poder ler, e as linhas antigas são da Teeds.
alter table public.markup_oficial_diario add column if not exists marca text not null default 'teeds';
drop policy if exists "admin le markup oficial" on public.markup_oficial_diario;
drop policy if exists "admin grava markup oficial" on public.markup_oficial_diario;
drop policy if exists "admin atualiza markup oficial" on public.markup_oficial_diario;
create policy "admin desta marca gerencia markup oficial" on public.markup_oficial_diario
  for all to authenticated
  using (public.teeds_sou_admin_da(marca)) with check (public.teeds_sou_admin_da(marca));

-- Auditoria das ações de administrador: também é por plataforma.
alter table public.auditoria_admin add column if not exists marca text not null default 'teeds';

-- E os relatórios passam a exigir ser admin DAQUELA plataforma, não de
-- qualquer uma. Antes o gate era "é admin de alguma coisa".
create or replace function public.teeds_comissao_conferencia(
  p_dias integer default 30, p_marca text default 'teeds', p_app_id text default null
)
returns table (
  dia date, calculada numeric, oficial numeric, diferenca numeric,
  diferenca_pct numeric, operacoes bigint, contratos_deriv integer,
  clientes bigint, so_demo boolean
)
language sql stable set search_path = public
as $$
  with janela as (
    select (current_date - greatest(0, least(coalesce(p_dias, 30), 3650) - 1))::date as corte
  ),
  nosso as (
    select k.dia, coalesce(sum(k.comissao), 0) as calculada,
           coalesce(sum(k.operacoes), 0) as operacoes,
           count(distinct k.user_id) as clientes
    from public.comissoes_diarias k, janela j
    where k.marca = p_marca and not k.demo and k.dia >= j.corte
    group by k.dia
  ),
  havia as (
    select k.dia, bool_and(k.demo) as so_demo
    from public.comissoes_diarias k, janela j
    where k.marca = p_marca and k.dia >= j.corte
    group by k.dia
  ),
  deriv as (
    select m.dia, m.comissao, m.contratos
    from public.markup_oficial_diario m, janela j
    where m.dia >= j.corte and (p_app_id is null or m.app_id = p_app_id)
  )
  select coalesce(n.dia, d.dia, h.dia) as dia,
         coalesce(n.calculada, 0), coalesce(d.comissao, 0),
         coalesce(n.calculada, 0) - coalesce(d.comissao, 0),
         case when coalesce(d.comissao, 0) = 0 then null
              else round(((coalesce(n.calculada, 0) - d.comissao) / d.comissao * 100)::numeric, 2) end,
         coalesce(n.operacoes, 0), coalesce(d.contratos, 0), coalesce(n.clientes, 0),
         coalesce(h.so_demo, true)
  from nosso n
  full outer join deriv d on d.dia = n.dia
  full outer join havia h on h.dia = coalesce(n.dia, d.dia)
  where public.teeds_sou_admin_da(p_marca)
  order by 1 desc;
$$;

create or replace function public.teeds_metricas_robos(
  p_dias integer default 90, p_marca text default 'teeds'
)
returns table (robo_id text, robo_nome text, operacoes bigint, vitorias bigint,
               clientes bigint, volume numeric, resultado numeric, markup numeric)
language sql stable set search_path = public
as $$
  select o.robo_id, max(o.robo_nome), count(*), count(*) filter (where o.ganhou),
         count(distinct o.user_id), coalesce(sum(o.entrada), 0),
         coalesce(sum(o.resultado), 0), coalesce(sum(o.markup) filter (where not o.demo), 0)
  from public.operacoes_robos o
  where public.teeds_sou_admin_da(p_marca) and o.marca = p_marca
    and o.executada_em >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 90), 3650)))
  group by o.robo_id order by 8 desc, 3 desc;
$$;
