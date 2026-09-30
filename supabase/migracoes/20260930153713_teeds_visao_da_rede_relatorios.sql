-- Os relatórios passam a responder pelas marcas em foco (veja teeds_marcas_em_foco).
create or replace function public.teeds_clientes_pagina(
  p_marca text default 'teeds', p_busca text default null, p_status text default 'todos',
  p_limite integer default 50, p_offset integer default 0, p_ordem text default 'cadastro')
returns jsonb language sql stable set search_path to 'public' as $$
with marcas as (select public.teeds_marcas_em_foco(p_marca) as lista),
base as (
  select c.*,
    case when c.acesso_expira_em is not null and c.acesso_expira_em < now() and coalesce(c.status_acesso, 'ativo') = 'ativo'
      then 'expirado' else coalesce(c.status_acesso, 'ativo') end as situacao
  from public.clientes c, marcas m
  where c.marca = any(m.lista)
),
totais as (
  select count(*) as total,
    count(*) filter (where situacao = 'ativo') as ativos,
    count(*) filter (where situacao = 'expirado') as expirados,
    count(*) filter (where acesso_expira_em is not null and acesso_expira_em >= now()
                       and acesso_expira_em <= now() + interval '7 days') as vencendo,
    count(*) filter (where coalesce(total_acessos, 0) > 0 and visto_em >= now() - interval '1 day') as ativos24h,
    count(*) filter (where coalesce(total_acessos, 0) > 0) as acessaram
  from base
),
filtrados as (
  select * from base
  where (p_status = 'todos' or situacao = p_status)
    and (
      p_busca is null or btrim(p_busca) = ''
      or nome ilike '%' || btrim(p_busca) || '%'
      or email ilike '%' || btrim(p_busca) || '%'
      or telefone ilike '%' || btrim(p_busca) || '%'
      or cpf ilike '%' || btrim(p_busca) || '%'
    )
),
pagina as (
  select * from filtrados
  order by
    case when p_ordem = 'acessos' and coalesce(total_acessos, 0) > 0 then 0 else 1 end,
    case when p_ordem = 'acessos' then visto_em end desc nulls last,
    criado_em desc, user_id desc
  limit greatest(1, least(coalesce(p_limite, 50), 200))
  offset greatest(0, coalesce(p_offset, 0))
),
por_plano as (
  select coalesce(plano_id, 'essencial') as plano, count(*) as total from base group by 1
),
por_marca as (
  select marca, count(*) as total,
         count(*) filter (where coalesce(total_acessos, 0) > 0 and visto_em >= now() - interval '1 day') as ativos24h
  from base group by 1
)
select jsonb_build_object(
  'total', (select total from totais),
  'ativos', (select ativos from totais),
  'expirados', (select expirados from totais),
  'vencendo', (select vencendo from totais),
  'ativos24h', (select ativos24h from totais),
  'acessaram', (select acessaram from totais),
  'filtrados', (select count(*) from filtrados),
  'por_plano', (select coalesce(jsonb_object_agg(plano, total), '{}'::jsonb) from por_plano),
  'por_marca', (select coalesce(jsonb_agg(jsonb_build_object('marca', marca, 'total', total, 'ativos24h', ativos24h) order by total desc), '[]'::jsonb) from por_marca),
  'pagina', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from (select * from pagina) p)
);
$$;

create or replace function public.teeds_analise_operacoes(
  p_marca text default 'teeds',
  p_de timestamptz default (now() - interval '30 days'), p_ate timestamptz default now(),
  p_hora_de integer default 0, p_hora_ate integer default 23,
  p_fuso text default 'America/Sao_Paulo', p_robo text default null,
  p_demo boolean default false, p_conta text default null)
returns jsonb language sql stable set search_path to 'public' as $$
  with marcas as (select public.teeds_marcas_em_foco(p_marca) as lista),
  base as (
    select o.*, (o.executada_em at time zone p_fuso) as local
    from public.operacoes_robos o, marcas m
    where o.marca = any(m.lista)
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
        from f group by 1) x),
    'por_marca', (
      select coalesce(jsonb_agg(x order by x.markup desc), '[]'::jsonb) from (
        select marca, count(*) as operacoes, count(*) filter (where ganhou) as ganhas,
               coalesce(sum(entrada), 0) as entradas, coalesce(sum(markup), 0) as markup,
               coalesce(sum(resultado), 0) as resultado, count(distinct conta_id) as contas
        from f group by 1) x)
  );
$$;

create or replace function public.teeds_comissao_viva(p_dias integer default 30, p_marca text default 'teeds')
returns table(user_id uuid, conta_id text, dia date, operacoes bigint, pagamentos numeric,
              comissao numeric, entradas numeric, resultado numeric, moeda text, demo boolean,
              atualizado_em timestamptz)
language sql stable set search_path to 'public' as $$
  select
    o.user_id,
    o.conta_id,
    (o.executada_em at time zone 'UTC')::date as dia,
    count(*)                                  as operacoes,
    sum(o.pagamento)                          as pagamentos,
    sum(coalesce(o.markup, o.pagamento * 0.03)) as comissao,
    sum(o.entrada)                            as entradas,
    sum(o.resultado)                          as resultado,
    max(o.moeda)                              as moeda,
    o.demo,
    max(o.executada_em)                       as atualizado_em
  from public.operacoes_robos o
  where o.marca = any(public.teeds_marcas_em_foco(p_marca))
    and o.executada_em >= (now() - make_interval(days => greatest(coalesce(p_dias, 30), 1)))
  group by o.user_id, o.conta_id, (o.executada_em at time zone 'UTC')::date, o.demo
  order by dia desc;
$$;

create or replace function public.teeds_metricas_robos(p_dias integer default 90, p_marca text default 'teeds')
returns table(robo_id text, robo_nome text, operacoes bigint, vitorias bigint, clientes bigint,
              volume numeric, resultado numeric, markup numeric)
language sql stable set search_path to 'public' as $$
  select o.robo_id, max(o.robo_nome), count(*), count(*) filter (where o.ganhou),
         count(distinct o.user_id), coalesce(sum(o.entrada), 0),
         coalesce(sum(o.resultado), 0), coalesce(sum(o.markup) filter (where not o.demo), 0)
  from public.operacoes_robos o
  where o.marca = any(public.teeds_marcas_em_foco(p_marca))
    and o.executada_em >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 90), 3650)))
  group by o.robo_id order by 8 desc, 3 desc;
$$;

create or replace function public.teeds_operacoes_cliente(p_user_id uuid, p_dias integer default 30, p_marca text default 'teeds')
returns table(contract_id bigint, conta_id text, demo boolean, robo_id text, robo_nome text,
              ativo text, tipo_contrato text, entrada numeric, pagamento numeric, resultado numeric,
              markup numeric, markup_deriv numeric, ganhou boolean, executada_em timestamptz)
language sql stable set search_path to 'public' as $$
  select o.contract_id, o.conta_id, o.demo,
         o.robo_id, o.robo_nome, o.ativo, o.tipo_contrato,
         o.entrada, o.pagamento, o.resultado,
         o.markup, o.markup_deriv, o.ganhou, o.executada_em
  from public.operacoes_robos o
  where (o.marca = any(public.teeds_marcas_em_foco(p_marca)) or o.user_id = (select auth.uid()))
    and o.user_id = p_user_id
    and o.executada_em >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 3650)))
  order by o.executada_em desc
  limit 5000;
$$;

create or replace function public.teeds_comissao_conferencia(p_dias integer default 30, p_marca text default 'teeds', p_app_id text default null)
returns table(dia date, calculada numeric, oficial numeric, diferenca numeric, diferenca_pct numeric,
              operacoes bigint, contratos_deriv integer, clientes bigint, so_demo boolean)
language sql stable set search_path to 'public' as $$
  with marcas as (select public.teeds_marcas_em_foco(p_marca) as lista),
  janela as (
    select (current_date - greatest(0, least(coalesce(p_dias, 30), 3650) - 1))::date as corte
  ),
  nosso as (
    select k.dia, coalesce(sum(k.comissao), 0) as calculada,
           coalesce(sum(k.operacoes), 0) as operacoes,
           count(distinct k.user_id) as clientes
    from public.comissoes_diarias k, janela j, marcas m
    where k.marca = any(m.lista) and not k.demo and k.dia >= j.corte
    group by k.dia
  ),
  havia as (
    select k.dia, bool_and(k.demo) as so_demo
    from public.comissoes_diarias k, janela j, marcas m
    where k.marca = any(m.lista) and k.dia >= j.corte
    group by k.dia
  ),
  deriv as (
    select m.dia, sum(m.comissao) as comissao, sum(m.contratos)::integer as contratos
    from public.markup_oficial_diario m, janela j, marcas mk
    where m.dia >= j.corte and (p_app_id is null or m.app_id = p_app_id)
      and m.marca = any(mk.lista)
    group by m.dia
  )
  select coalesce(n.dia, d.dia, h.dia) as dia,
         coalesce(n.calculada, 0), coalesce(d.comissao, 0),
         coalesce(n.calculada, 0) - coalesce(d.comissao, 0),
         case when coalesce(d.comissao, 0) = 0 then null
              else round(((coalesce(n.calculada, 0) - d.comissao) / d.comissao * 100)::numeric, 2) end,
         coalesce(n.operacoes, 0), coalesce(d.contratos, 0)::integer, coalesce(n.clientes, 0),
         coalesce(h.so_demo, true)
  from nosso n
  full outer join deriv d on d.dia = n.dia
  full outer join havia h on h.dia = coalesce(n.dia, d.dia)
  order by 1 desc;
$$;

create or replace function public.teeds_relatorio_clientes(p_dias integer default 30, p_incluir_demo boolean default true, p_marca text default 'teeds')
returns table(user_id uuid, nome text, email text, contas bigint, contas_reais bigint, operacoes bigint,
              entradas numeric, pagamentos numeric, resultado numeric, comissao_calculada numeric,
              comissao_real numeric, dias_com_dados bigint, dias_sem_resultado bigint,
              operacoes_robos bigint, resultado_robos numeric, markup_robos numeric,
              ultimo_dia date, visto_em timestamptz)
language sql stable set search_path to 'public' as $$
  with marcas as (select public.teeds_marcas_em_foco(p_marca) as lista),
  janela as (
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
    from public.comissoes_diarias k, janela j, marcas m
    where k.marca = any(m.lista) and k.dia >= j.corte and (p_incluir_demo or not k.demo)
    group by k.user_id
  ),
  robos as (
    select o.user_id, count(*) as operacoes,
           coalesce(sum(o.resultado), 0) as resultado,
           coalesce(sum(o.markup), 0) as markup
    from public.operacoes_robos o, janela j, marcas m
    where o.marca = any(m.lista) and o.executada_em >= j.corte::timestamptz
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
  where c.marca = any(public.teeds_marcas_em_foco(p_marca))
  order by coalesce(d.comissao, 0) desc, coalesce(d.operacoes, 0) desc;
$$;

create or replace function public.teeds_movimentacoes_diarias(p_dias integer default 30, p_marca text default 'teeds')
returns table(dia date, depositos numeric, qtd_depositos bigint, saques numeric,
              qtd_saques bigint, clientes bigint)
language sql stable set search_path to 'public' as $$
  with janela as (select (current_date - greatest(0, least(coalesce(p_dias, 30), 3650) - 1))::date as corte)
  select (m.ocorrida_em at time zone 'UTC')::date,
         coalesce(sum(m.valor) filter (where m.tipo = 'deposit'), 0),
         count(*) filter (where m.tipo = 'deposit'),
         coalesce(sum(m.valor) filter (where m.tipo = 'withdrawal'), 0),
         count(*) filter (where m.tipo = 'withdrawal'), count(distinct m.user_id)
  from public.movimentacoes_deriv m, janela j
  where m.marca = any(public.teeds_marcas_em_foco(p_marca)) and not m.demo
    and (m.ocorrida_em at time zone 'UTC')::date >= j.corte
  group by 1 order by 1 desc;
$$;

create or replace function public.teeds_movimentacoes_recentes(p_dias integer default 30, p_marca text default 'teeds', p_limite integer default 500)
returns table(user_id uuid, nome text, email text, conta_id text, transacao_id bigint, tipo text,
              valor numeric, moeda text, saldo_depois numeric, descricao text, ocorrida_em timestamptz)
language sql stable set search_path to 'public' as $$
  select m.user_id, c.nome, c.email, m.conta_id, m.transacao_id, m.tipo, m.valor, m.moeda,
         m.saldo_depois, m.descricao, m.ocorrida_em
  from public.movimentacoes_deriv m left join public.clientes c on c.user_id = m.user_id and c.marca = m.marca
  where m.marca = any(public.teeds_marcas_em_foco(p_marca)) and not m.demo
    and m.ocorrida_em >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 3650)))
  order by m.ocorrida_em desc limit greatest(1, least(coalesce(p_limite, 500), 2000));
$$;

create or replace function public.teeds_extrato_coletas(p_marca text default 'teeds')
returns table(conta_id text, user_id uuid, nome text, email text, ultima_tentativa_em timestamptz,
              ultimo_sucesso_em timestamptz, ultima_movimentacao_em timestamptz, ultimo_erro text,
              movimentacoes bigint)
language sql stable set search_path to 'public' as $$
  select k.conta_id, k.user_id, c.nome, c.email, k.ultima_tentativa_em, k.ultimo_sucesso_em,
         (select max(m.ocorrida_em) from public.movimentacoes_deriv m where m.conta_id = k.conta_id), k.ultimo_erro,
         (select count(*) from public.movimentacoes_deriv m where m.conta_id = k.conta_id)
  from public.extrato_coletas k left join public.clientes c on c.user_id = k.user_id and c.marca = k.marca
  where k.marca = any(public.teeds_marcas_em_foco(p_marca))
  order by k.ultima_tentativa_em desc;
$$;
