-- Dias gravados antes de 04/09 têm comissão certa mas resultado zerado
-- (a varredura antiga não sabia o resultado). O relatório precisa dizer
-- isso em vez de mostrar 0,00 como se fosse verdade.
drop function if exists public.teeds_relatorio_clientes(integer, boolean);
create or replace function public.teeds_relatorio_clientes(
  p_dias integer default 30,
  p_incluir_demo boolean default true
)
returns table (
  user_id uuid, nome text, email text,
  contas bigint, contas_reais bigint,
  operacoes bigint, entradas numeric, pagamentos numeric,
  resultado numeric, comissao_calculada numeric, comissao_real numeric,
  dias_com_dados bigint, dias_sem_resultado bigint,
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
           coalesce(sum(k.comissao) filter (where not k.demo), 0) as comissao_real,
           count(*) filter (where k.operacoes > 0) as dias_com_dados,
           count(*) filter (where k.operacoes > 0 and k.atualizado_em < timestamptz '2026-09-04 00:00:00+00') as dias_sem_resultado,
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
         coalesce(d.resultado, 0), coalesce(d.comissao, 0), coalesce(d.comissao_real, 0),
         coalesce(d.dias_com_dados, 0), coalesce(d.dias_sem_resultado, 0),
         coalesce(r.operacoes, 0), coalesce(r.resultado, 0), coalesce(r.markup, 0),
         d.ultimo_dia, c.visto_em
  from public.clientes c
  left join diario d on d.user_id = c.user_id
  left join robos  r on r.user_id = c.user_id
  where public.teeds_sou_admin()
  order by coalesce(d.comissao, 0) desc, coalesce(d.operacoes, 0) desc;
$$;
revoke all on function public.teeds_relatorio_clientes(integer, boolean) from public, anon;
grant execute on function public.teeds_relatorio_clientes(integer, boolean) to authenticated;
