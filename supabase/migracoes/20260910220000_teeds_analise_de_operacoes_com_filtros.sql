-- Análise das operações dos robôs com filtros finos.
--
-- A tela de comissões só filtrava por "últimos N dias". O admin pediu mais:
-- período personalizado, faixa de horário, robô, conta. `operacoes_robos`
-- tem 40 mil linhas em 90 dias (martingale na demo) — filtrar isso no
-- navegador não dá (o PostgREST corta em mil linhas e ninguém percebe).
-- Então o banco filtra e devolve só os resumos: totais, por hora do dia,
-- por dia, por robô e por conta. Um JSON, uma chamada.
--
-- Horário é no fuso que a tela mandar (padrão São Paulo): "das 9 às 12" tem
-- que significar a manhã de quem opera, não UTC. Faixa que cruza a meia-noite
-- (22 às 2) também vale.
--
-- Só robô: operação manual não está nesta tabela — a tela diz isso.

create or replace function public.teeds_analise_operacoes(
  p_marca text default 'teeds',
  p_de timestamptz default now() - interval '30 days',
  p_ate timestamptz default now(),
  p_hora_de integer default 0,
  p_hora_ate integer default 23,
  p_fuso text default 'America/Sao_Paulo',
  p_robo text default null,
  p_demo boolean default false,
  p_conta text default null
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with base as (
    select o.*, (o.executada_em at time zone p_fuso) as local
    from public.operacoes_robos o
    where public.teeds_sou_admin_da(p_marca)
      and o.marca = p_marca
      and o.executada_em >= p_de and o.executada_em < p_ate
      and (p_robo is null or o.robo_id = p_robo)
      and (p_demo is null or o.demo = p_demo)
      and (p_conta is null or o.conta_id = p_conta)
  ),
  f as (
    select *
    from base
    where case
      when coalesce(p_hora_de, 0) <= coalesce(p_hora_ate, 23)
        then extract(hour from local) between coalesce(p_hora_de, 0) and coalesce(p_hora_ate, 23)
      else extract(hour from local) >= coalesce(p_hora_de, 0)
        or extract(hour from local) <= coalesce(p_hora_ate, 23)
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
        from f group by 1) x)
  );
$$;

comment on function public.teeds_analise_operacoes(text, timestamptz, timestamptz, integer, integer, text, text, boolean, text) is
  'Resumo das operações de ROBÔ com filtros de período, horário (no fuso pedido), robô, demo/real e conta. Só admin da marca.';

revoke all on function public.teeds_analise_operacoes(text, timestamptz, timestamptz, integer, integer, text, text, boolean, text) from public, anon;
grant execute on function public.teeds_analise_operacoes(text, timestamptz, timestamptz, integer, integer, text, text, boolean, text) to authenticated;
