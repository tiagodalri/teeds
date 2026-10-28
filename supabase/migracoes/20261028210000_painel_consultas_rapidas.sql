-- Painel: as consultas pesadas param de esgotar o tempo (28/10/2026, Tiago:
-- "continue corrigindo e otimizando").
--
-- Escritas em SQL puro, com a lista de marcas num CTE juntado à tabela, o
-- banco montava um plano genérico que lia a tabela inteira de operações
-- (230 mil linhas, cada uma passando pela regra de acesso): a análise da
-- GlobalFly levava 8,5 s e o limite do painel é 8 s. Em plpgsql, com a lista
-- de marcas numa variável, o filtro vira condição de índice (marca,
-- executada_em): a mesma análise cai para ~0,1 s. Mesmos parâmetros, mesma
-- saída, mesma regra de acesso (security invoker).

-- 1. Desempenho por robô ------------------------------------------------------
create or replace function public.teeds_metricas_robos(p_dias integer default 90, p_marca text default 'teeds')
returns table(robo_id text, robo_nome text, operacoes bigint, vitorias bigint, clientes bigint, volume numeric, resultado numeric, markup numeric)
language plpgsql stable set search_path to 'public' as $$
declare
  v_marcas text[] := public.teeds_marcas_em_foco(p_marca);
  v_desde timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_dias, 90), 3650)));
begin
  return query
  select o.robo_id, max(o.robo_nome), count(*), count(*) filter (where o.ganhou),
         count(distinct o.user_id), coalesce(sum(o.entrada), 0),
         coalesce(sum(o.resultado), 0), coalesce(sum(o.markup) filter (where not o.demo), 0)
  from public.operacoes_robos o
  where o.marca = any(v_marcas) and o.executada_em >= v_desde
  group by o.robo_id order by 8 desc, 3 desc;
end $$;

-- 2. Análise de operações (Centro de estudo) -----------------------------------
create or replace function public.teeds_analise_operacoes(
  p_marca text default 'teeds', p_de timestamptz default (now() - '30 days'::interval), p_ate timestamptz default now(),
  p_hora_de integer default 0, p_hora_ate integer default 23, p_fuso text default 'America/Sao_Paulo',
  p_robo text default null, p_demo boolean default false, p_conta text default null)
returns jsonb language plpgsql stable set search_path to 'public' as $$
declare
  v_marcas text[] := public.teeds_marcas_em_foco(p_marca);
  v_hd int := coalesce(p_hora_de, 0);
  v_ha int := coalesce(p_hora_ate, 23);
  r jsonb;
begin
  with base as materialized (
    select o.user_id, o.conta_id, o.robo_id, o.robo_nome, o.marca, o.demo, o.ganhou,
           o.entrada, o.pagamento, o.markup, o.markup_deriv, o.resultado,
           (o.executada_em at time zone p_fuso) as local
    from public.operacoes_robos o
    where o.marca = any(v_marcas)
      and o.executada_em >= p_de and o.executada_em < p_ate
      and (p_robo is null or o.robo_id = p_robo)
      and (p_demo is null or o.demo = p_demo)
      and (p_conta is null or o.conta_id = p_conta)
  ),
  f as materialized (
    select * from base
    where case
      when v_hd <= v_ha then extract(hour from local) between v_hd and v_ha
      else extract(hour from local) >= v_hd or extract(hour from local) <= v_ha
    end
  )
  select jsonb_build_object(
    'total', (
      select jsonb_build_object(
        'operacoes', count(*),
        'ganhas', count(*) filter (where ganhou),
        'entradas', coalesce(sum(entrada), 0),
        'pagamentos', coalesce(sum(pagamento), 0),
        'markup', coalesce(sum(markup), 0),
        'markup_deriv', coalesce(sum(markup_deriv), 0),
        'resultado', coalesce(sum(resultado), 0),
        'clientes', count(distinct user_id),
        'contas', count(distinct conta_id))
      from f),
    'por_hora', (
      select coalesce(jsonb_agg(x order by x.hora), '[]'::jsonb) from (
        select extract(hour from local)::int as hora, count(*) as operacoes,
               count(*) filter (where ganhou) as ganhas,
               coalesce(sum(markup), 0) as markup, coalesce(sum(resultado), 0) as resultado
        from f group by 1) x),
    'por_dia', (
      select coalesce(jsonb_agg(x order by x.dia), '[]'::jsonb) from (
        select to_char(local::date, 'YYYY-MM-DD') as dia, count(*) as operacoes,
               count(*) filter (where ganhou) as ganhas,
               coalesce(sum(entrada), 0) as entradas,
               coalesce(sum(markup), 0) as markup, coalesce(sum(resultado), 0) as resultado
        from f group by 1) x),
    'por_robo', (
      select coalesce(jsonb_agg(x order by x.markup desc, x.operacoes desc), '[]'::jsonb) from (
        select robo_id, max(robo_nome) as robo_nome, count(*) as operacoes,
               count(*) filter (where ganhou) as ganhas, count(distinct user_id) as clientes,
               coalesce(sum(entrada), 0) as entradas,
               coalesce(sum(markup), 0) as markup, coalesce(sum(resultado), 0) as resultado
        from f group by 1) x),
    'por_conta', (
      select coalesce(jsonb_agg(x order by x.markup desc, x.operacoes desc), '[]'::jsonb) from (
        select conta_id, bool_or(demo) as demo, count(*) as operacoes,
               coalesce(sum(markup), 0) as markup, coalesce(sum(resultado), 0) as resultado
        from f group by 1) x),
    'por_marca', (
      select coalesce(jsonb_agg(x order by x.markup desc), '[]'::jsonb) from (
        select marca, count(*) as operacoes, count(*) filter (where ganhou) as ganhas,
               coalesce(sum(entrada), 0) as entradas, coalesce(sum(markup), 0) as markup,
               coalesce(sum(resultado), 0) as resultado, count(distinct conta_id) as contas
        from f group by 1) x)
  ) into r;
  return r;
end $$;

-- 3. Relatório de clientes por conta --------------------------------------------
create or replace function public.teeds_relatorio_clientes_por_conta(p_dias integer default 30, p_marca text default 'teeds')
returns table(user_id uuid, nome text, email text, contas_reais bigint, contas_demo bigint, operacoes_real bigint, operacoes_demo bigint, entradas_real numeric, entradas_demo numeric, pagamentos_real numeric, pagamentos_demo numeric, resultado_real numeric, resultado_demo numeric, comissao_real numeric, comissao_demo numeric, dias_com_dados bigint, dias_sem_resultado bigint, operacoes_robos_real bigint, operacoes_robos_demo bigint, resultado_robos_real numeric, resultado_robos_demo numeric, markup_robos_real numeric, markup_robos_demo numeric, ultimo_dia_real date, ultimo_dia_demo date, visto_em timestamptz)
language plpgsql stable set search_path to 'public' as $$
declare
  v_marcas text[] := public.teeds_marcas_em_foco(p_marca);
  v_corte date := (current_date - greatest(0, least(coalesce(p_dias, 30), 3650) - 1))::date;
begin
  return query
  with diario as (
    select k.user_id,
           count(distinct k.conta_id) filter (where not k.demo) as contas_reais,
           count(distinct k.conta_id) filter (where k.demo)     as contas_demo,
           coalesce(sum(k.operacoes) filter (where not k.demo), 0) as operacoes_real,
           coalesce(sum(k.operacoes) filter (where k.demo), 0)     as operacoes_demo,
           coalesce(sum(k.entradas)  filter (where not k.demo), 0) as entradas_real,
           coalesce(sum(k.entradas)  filter (where k.demo), 0)     as entradas_demo,
           coalesce(sum(k.pagamentos) filter (where not k.demo), 0) as pagamentos_real,
           coalesce(sum(k.pagamentos) filter (where k.demo), 0)     as pagamentos_demo,
           coalesce(sum(k.resultado) filter (where not k.demo), 0) as resultado_real,
           coalesce(sum(k.resultado) filter (where k.demo), 0)     as resultado_demo,
           coalesce(sum(k.comissao)  filter (where not k.demo), 0) as comissao_real,
           coalesce(sum(k.comissao)  filter (where k.demo), 0)     as comissao_demo,
           count(*) filter (where k.operacoes > 0) as dias_com_dados,
           count(*) filter (where k.operacoes > 0 and k.atualizado_em < timestamptz '2026-09-04 00:00:00+00') as dias_sem_resultado,
           max(k.dia) filter (where not k.demo and k.operacoes > 0) as ultimo_dia_real,
           max(k.dia) filter (where k.demo and k.operacoes > 0)     as ultimo_dia_demo
    from public.comissoes_diarias k
    where k.marca = any(v_marcas) and k.dia >= v_corte
    group by k.user_id
  ),
  robos as (
    select o.user_id,
           count(*) filter (where not o.demo) as operacoes_real,
           count(*) filter (where o.demo)     as operacoes_demo,
           coalesce(sum(o.resultado) filter (where not o.demo), 0) as resultado_real,
           coalesce(sum(o.resultado) filter (where o.demo), 0)     as resultado_demo,
           coalesce(sum(o.markup)    filter (where not o.demo), 0) as markup_real,
           coalesce(sum(o.markup)    filter (where o.demo), 0)     as markup_demo
    from public.operacoes_robos o
    where o.marca = any(v_marcas) and o.executada_em >= v_corte::timestamptz
    group by o.user_id
  )
  select c.user_id, c.nome, c.email,
         coalesce(d.contas_reais, 0), coalesce(d.contas_demo, 0),
         coalesce(d.operacoes_real, 0)::bigint, coalesce(d.operacoes_demo, 0)::bigint,
         coalesce(d.entradas_real, 0), coalesce(d.entradas_demo, 0),
         coalesce(d.pagamentos_real, 0), coalesce(d.pagamentos_demo, 0),
         coalesce(d.resultado_real, 0), coalesce(d.resultado_demo, 0),
         coalesce(d.comissao_real, 0), coalesce(d.comissao_demo, 0),
         coalesce(d.dias_com_dados, 0), coalesce(d.dias_sem_resultado, 0),
         coalesce(r.operacoes_real, 0), coalesce(r.operacoes_demo, 0),
         coalesce(r.resultado_real, 0), coalesce(r.resultado_demo, 0),
         coalesce(r.markup_real, 0), coalesce(r.markup_demo, 0),
         d.ultimo_dia_real, d.ultimo_dia_demo, c.visto_em
  from public.clientes c
  left join diario d on d.user_id = c.user_id
  left join robos  r on r.user_id = c.user_id
  where c.marca = any(v_marcas)
  order by coalesce(d.comissao_real, 0) desc,
           coalesce(d.operacoes_real, 0) desc,
           coalesce(d.comissao_demo, 0) desc,
           coalesce(d.operacoes_demo, 0) desc;
end $$;

-- 4. A conferência de operações por conta e dia (servidor/src/supabase.ts)
-- ganhou índice próprio, criado à parte (concurrently, sem travar gravações):
--   create index concurrently if not exists operacoes_robos_conta_data_idx
--     on public.operacoes_robos (conta_id, executada_em desc);
