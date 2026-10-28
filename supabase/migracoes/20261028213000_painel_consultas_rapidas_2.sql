-- Painel, segunda leva (28/10/2026): mesmo problema da 20261028210000 (lista
-- de marcas fora da condição de índice, plano genérico lendo a tabela inteira).
-- Mesmos parâmetros, mesma saída, mesma regra de acesso.

create or replace function public.teeds_comissao_viva(p_dias integer default 30, p_marca text default 'teeds')
returns table(user_id uuid, conta_id text, dia date, operacoes bigint, pagamentos numeric, comissao numeric, entradas numeric, resultado numeric, moeda text, demo boolean, atualizado_em timestamptz)
language plpgsql stable set search_path to 'public' as $f$
declare
  v_marcas text[] := public.teeds_marcas_em_foco(p_marca);
  v_desde timestamptz := now() - make_interval(days => greatest(coalesce(p_dias, 30), 1));
begin
  return query
  select o.user_id, o.conta_id, (o.executada_em at time zone 'UTC')::date,
         count(*), sum(o.pagamento), sum(coalesce(o.markup, o.pagamento * 0.03)),
         sum(o.entrada), sum(o.resultado), max(o.moeda), o.demo, max(o.executada_em)
  from public.operacoes_robos o
  where o.marca = any(v_marcas) and o.executada_em >= v_desde
  group by o.user_id, o.conta_id, (o.executada_em at time zone 'UTC')::date, o.demo
  order by 3 desc;
end $f$;

create or replace function public.teeds_relatorio_clientes(p_dias integer default 30, p_incluir_demo boolean default true, p_marca text default 'teeds')
returns table(user_id uuid, nome text, email text, contas bigint, contas_reais bigint, operacoes bigint, entradas numeric, pagamentos numeric, resultado numeric, comissao_calculada numeric, comissao_real numeric, dias_com_dados bigint, dias_sem_resultado bigint, operacoes_robos bigint, resultado_robos numeric, markup_robos numeric, ultimo_dia date, visto_em timestamptz)
language plpgsql stable set search_path to 'public' as $f$
declare
  v_marcas text[] := public.teeds_marcas_em_foco(p_marca);
  v_corte date := (current_date - greatest(0, least(coalesce(p_dias, 30), 3650) - 1))::date;
begin
  return query
  with diario as (
    select k.user_id as uid,
           count(distinct k.conta_id) as n_contas,
           count(distinct k.conta_id) filter (where not k.demo) as n_contas_reais,
           coalesce(sum(k.operacoes), 0) as n_operacoes,
           coalesce(sum(k.entradas), 0) as s_entradas,
           coalesce(sum(k.pagamentos), 0) as s_pagamentos,
           coalesce(sum(k.resultado), 0) as s_resultado,
           coalesce(sum(k.comissao), 0) as s_comissao,
           coalesce(sum(k.comissao) filter (where not k.demo), 0) as s_comissao_real,
           count(*) filter (where k.operacoes > 0) as n_dias,
           count(*) filter (where k.operacoes > 0 and k.atualizado_em < timestamptz '2026-09-04 00:00:00+00') as n_dias_sem,
           max(k.dia) as d_ultimo
    from public.comissoes_diarias k
    where k.marca = any(v_marcas) and k.dia >= v_corte and (p_incluir_demo or not k.demo)
    group by k.user_id
  ),
  robos as (
    select o.user_id as uid, count(*) as n_ops,
           coalesce(sum(o.resultado), 0) as s_res,
           coalesce(sum(o.markup), 0) as s_markup
    from public.operacoes_robos o
    where o.marca = any(v_marcas) and o.executada_em >= v_corte::timestamptz
      and (p_incluir_demo or not o.demo)
    group by o.user_id
  )
  select c.user_id, c.nome, c.email,
         coalesce(d.n_contas, 0), coalesce(d.n_contas_reais, 0),
         coalesce(d.n_operacoes, 0)::bigint, coalesce(d.s_entradas, 0), coalesce(d.s_pagamentos, 0),
         coalesce(d.s_resultado, 0), coalesce(d.s_comissao, 0), coalesce(d.s_comissao_real, 0),
         coalesce(d.n_dias, 0), coalesce(d.n_dias_sem, 0),
         coalesce(r.n_ops, 0), coalesce(r.s_res, 0), coalesce(r.s_markup, 0),
         d.d_ultimo, c.visto_em
  from public.clientes c
  left join diario d on d.uid = c.user_id
  left join robos r on r.uid = c.user_id
  where c.marca = any(v_marcas)
  order by coalesce(d.s_comissao, 0) desc, coalesce(d.n_operacoes, 0) desc;
end $f$;

create or replace function public.teeds_insights_resumo(p_marca text default 'teeds', p_dias integer default 30)
returns json language plpgsql stable set search_path to 'public' as $f$
declare
  v text[] := public.teeds_marcas_em_foco(p_marca);
  r json;
begin
  if coalesce(array_length(v, 1), 0) = 0 then return null; end if;
  select json_build_object(
    'clientes', (select count(*) from public.clientes where marca = any(v)),
    'novos', (select count(*) from public.clientes where marca = any(v) and criado_em >= now() - make_interval(days => p_dias)),
    'ativos', (select count(distinct user_id) from public.acessos_diarios where marca = any(v) and dia >= current_date - p_dias),
    'ativos_hoje', (select count(distinct user_id) from public.acessos_diarios where marca = any(v) and dia = current_date),
    'acessos', (select coalesce(sum(acessos),0) from public.acessos_diarios where marca = any(v) and dia >= current_date - p_dias),
    'segundos', (select coalesce(sum(segundos),0) from public.acessos_diarios where marca = any(v) and dia >= current_date - p_dias),
    'aulas_pessoas', (select count(distinct user_id) from public.aulas_progresso where marca = any(v) and ultima_vez >= now() - make_interval(days => p_dias)),
    'aulas_segundos', (select coalesce(sum(segundos),0) from public.aulas_progresso where marca = any(v) and ultima_vez >= now() - make_interval(days => p_dias)),
    'aulas_concluidas', (select count(*) from public.aulas_progresso where marca = any(v) and concluida and ultima_vez >= now() - make_interval(days => p_dias)),
    'com_deriv', (select count(distinct user_id) from public.contas_deriv where marca = any(v))
  ) into r;
  return r;
end $f$;
