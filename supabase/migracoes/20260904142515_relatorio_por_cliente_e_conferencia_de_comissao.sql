-- TEEDS · relatórios do admin. Agregação no banco: o painel recebe
-- uma linha por cliente, nunca o histórico inteiro.

-- 1) uma linha por cliente: quanto operou, quanto ganhou ou perdeu,
--    quanto gerou de comissão calculada.
create or replace function public.teeds_relatorio_clientes(
  p_dias integer default 30,
  p_incluir_demo boolean default true
)
returns table (
  user_id uuid, nome text, email text,
  contas bigint, contas_reais bigint,
  operacoes bigint, entradas numeric, pagamentos numeric,
  resultado numeric, comissao_calculada numeric,
  operacoes_robos bigint, resultado_robos numeric, markup_robos numeric,
  ultimo_dia date, visto_em timestamptz
)
language sql stable security invoker set search_path = public as $$
  with janela as (
    select (current_date - greatest(0, least(coalesce(p_dias, 30), 3650) - 1))::date as corte
  ),
  diario as (
    select k.user_id,
           count(distinct k.conta_id) as contas,
           count(distinct k.conta_id) filter (where not k.demo) as contas_reais,
           coalesce(sum(k.operacoes), 0) as operacoes,
           coalesce(sum(k.entradas), 0) as entradas,
           coalesce(sum(k.pagamentos), 0) as pagamentos,
           coalesce(sum(k.resultado), 0) as resultado,
           coalesce(sum(k.comissao), 0) as comissao,
           max(k.dia) as ultimo_dia
    from public.comissoes_diarias k, janela j
    where k.dia >= j.corte and (p_incluir_demo or not k.demo)
    group by k.user_id
  ),
  robos as (
    select o.user_id,
           count(*) as operacoes,
           coalesce(sum(o.resultado), 0) as resultado,
           coalesce(sum(o.markup), 0) as markup
    from public.operacoes_robos o, janela j
    where o.executada_em >= j.corte::timestamptz
      and (p_incluir_demo or not o.demo)
    group by o.user_id
  )
  select c.user_id, c.nome, c.email,
         coalesce(d.contas, 0), coalesce(d.contas_reais, 0),
         coalesce(d.operacoes, 0), coalesce(d.entradas, 0), coalesce(d.pagamentos, 0),
         coalesce(d.resultado, 0), coalesce(d.comissao, 0),
         coalesce(r.operacoes, 0), coalesce(r.resultado, 0), coalesce(r.markup, 0),
         d.ultimo_dia, c.visto_em
  from public.clientes c
  left join diario d on d.user_id = c.user_id
  left join robos  r on r.user_id = c.user_id
  where public.teeds_sou_admin()
  order by coalesce(d.comissao, 0) desc, coalesce(d.operacoes, 0) desc;
$$;

-- 2) o extrato de operações de um cliente (o admin vê de qualquer um;
--    o cliente vê o próprio).
create or replace function public.teeds_operacoes_cliente(
  p_user_id uuid,
  p_dias integer default 30
)
returns table (
  contract_id bigint, conta_id text, demo boolean,
  robo_id text, robo_nome text, ativo text, tipo_contrato text,
  entrada numeric, pagamento numeric, resultado numeric,
  markup numeric, markup_deriv numeric, ganhou boolean,
  executada_em timestamptz
)
language sql stable security invoker set search_path = public as $$
  select o.contract_id, o.conta_id, o.demo,
         o.robo_id, o.robo_nome, o.ativo, o.tipo_contrato,
         o.entrada, o.pagamento, o.resultado,
         o.markup, o.markup_deriv, o.ganhou, o.executada_em
  from public.operacoes_robos o
  where (public.teeds_sou_admin() or o.user_id = (select auth.uid()))
    and o.user_id = p_user_id
    and o.executada_em >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 3650)))
  order by o.executada_em desc
  limit 5000;
$$;

-- 3) a conferência que o Tiago pediu: o nosso número e o da Deriv, dia a dia.
--    Só conta real — markup em conta demo é dinheiro fictício, a Deriv não repassa.
create or replace function public.teeds_comissao_conferencia(p_dias integer default 30)
returns table (
  dia date,
  calculada numeric, oficial numeric,
  diferenca numeric, diferenca_pct numeric,
  operacoes bigint, contratos_deriv integer, clientes bigint
)
language sql stable security invoker set search_path = public as $$
  with janela as (
    select (current_date - greatest(0, least(coalesce(p_dias, 30), 3650) - 1))::date as corte
  ),
  nosso as (
    select k.dia,
           coalesce(sum(k.comissao), 0) as calculada,
           coalesce(sum(k.operacoes), 0) as operacoes,
           count(distinct k.user_id) as clientes
    from public.comissoes_diarias k, janela j
    where not k.demo and k.dia >= j.corte
    group by k.dia
  ),
  deriv as (
    select m.dia, m.comissao, m.contratos
    from public.markup_oficial_diario m, janela j
    where m.dia >= j.corte
  )
  select coalesce(n.dia, d.dia) as dia,
         coalesce(n.calculada, 0) as calculada,
         coalesce(d.comissao, 0) as oficial,
         coalesce(n.calculada, 0) - coalesce(d.comissao, 0) as diferenca,
         case when coalesce(d.comissao, 0) = 0 then null
              else round(((coalesce(n.calculada, 0) - d.comissao) / d.comissao * 100)::numeric, 2)
         end as diferenca_pct,
         coalesce(n.operacoes, 0) as operacoes,
         coalesce(d.contratos, 0) as contratos_deriv,
         coalesce(n.clientes, 0) as clientes
  from nosso n
  full outer join deriv d on d.dia = n.dia
  where public.teeds_sou_admin()
  order by 1 desc;
$$;

revoke all on function public.teeds_relatorio_clientes(integer, boolean) from public, anon;
revoke all on function public.teeds_operacoes_cliente(uuid, integer) from public, anon;
revoke all on function public.teeds_comissao_conferencia(integer) from public, anon;
grant execute on function public.teeds_relatorio_clientes(integer, boolean) to authenticated;
grant execute on function public.teeds_operacoes_cliente(uuid, integer) to authenticated;
grant execute on function public.teeds_comissao_conferencia(integer) to authenticated;
