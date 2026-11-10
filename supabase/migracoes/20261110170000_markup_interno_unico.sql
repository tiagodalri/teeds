-- 10/11/2026 (Tiago: "valores de comissão divergentes nos painéis. Tem que estar sempre tudo atualizado
-- certinho a nossa contagem interna do markup... tempo real"). Até aqui cada painel somava o markup de um
-- jeito:
--   * Visão geral: comissoes_diarias (o servidor relê a Deriv conta por conta a cada ~5 min), dia em UTC
--     (depois das 21h de Brasília o markup já caía no "hoje" do dia seguinte), equipe fora, mesma conta em
--     dois cadastros somada duas vezes.
--   * Comissões: a mesma tabela, mas com a equipe dentro, sem o parceiro do topo e uma linha por conta.
--   * Análise das I.A.: operacoes_robos no horário do navegador, equipe dentro, sem o parceiro.
-- Agora existe UMA contagem interna: cada contrato que a plataforma registra (I.A. em operacoes_robos e
-- manual em operacoes_manuais), só conta real, 3% do pagamento (a coluna markup), dia de Brasília, um
-- contrato conta uma vez, equipe fora, parceiro do topo respeitado. Ela entra no banco na hora em que o
-- contrato fecha, então o número sobe a cada leitura (15 s na tela), sem a espera do servidor.
-- comissoes_diarias continua existindo como conferência com a Deriv (saldo das contas e contratos de fora).

-- O que deixa a soma leve: só contas reais (hoje ~2% das linhas), já com o que a soma precisa.
-- Criado à parte com CONCURRENTLY (fora de transação), para não travar a gravação dos robôs.
create index concurrently if not exists operacoes_robos_real_markup_idx
  on public.operacoes_robos (marca, executada_em)
  include (user_id, contract_id, markup, entrada, resultado)
  where not demo;

-- A soma por dia. Interna: só as funções abaixo chamam (elas já conferiram quem pede e resolveram o parceiro).
create or replace function public.teeds_markup_dias(p_marcas text[], p_parceiro text, p_de date, p_ate date)
returns table(dia date, markup numeric, operacoes bigint, entradas numeric, resultado numeric, clientes bigint,
              ia_markup numeric, ia_operacoes bigint, manual_markup numeric, manual_operacoes bigint, ultima_em timestamptz)
language sql stable set search_path = public as $$
  with janela as (
    select (p_de::timestamp at time zone 'America/Sao_Paulo') as de,
           ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo') as ate
  ),
  cli as (
    select c.user_id, c.marca from public.clientes c
     where c.marca = any(p_marcas)
       and not exists (select 1 from public.administradores a where a.user_id = c.user_id)
       and (p_parceiro is null or (p_parceiro = 'direto' and c.parceiro is null) or c.parceiro = p_parceiro)
  ),
  ops as (
    select distinct on (x.contract_id) x.* from (
      select 'ia'::text as origem, o.contract_id, o.user_id, o.executada_em as quando,
             coalesce(o.markup, 0) as markup, coalesce(o.entrada, 0) as entrada, coalesce(o.resultado, 0) as resultado
        from public.operacoes_robos o
        join cli on cli.user_id = o.user_id and cli.marca = o.marca
        cross join janela j
       where o.marca = any(p_marcas) and not o.demo and o.executada_em >= j.de and o.executada_em < j.ate
      union all
      select 'manual', m.contract_id, m.user_id, m.comprada_em,
             coalesce(m.markup, 0), coalesce(m.entrada, 0), coalesce(m.resultado, 0)
        from public.operacoes_manuais m
        join cli on cli.user_id = m.user_id and cli.marca = m.marca
        cross join janela j
       where m.marca = any(p_marcas) and not m.demo and coalesce(m.pagamento, 0) > 0
         and m.comprada_em >= j.de and m.comprada_em < j.ate
    ) x
    order by x.contract_id, x.origem
  )
  select (quando at time zone 'America/Sao_Paulo')::date as dia,
         sum(markup), count(*), sum(entrada), sum(resultado), count(distinct user_id),
         coalesce(sum(markup) filter (where origem = 'ia'), 0), count(*) filter (where origem = 'ia'),
         coalesce(sum(markup) filter (where origem = 'manual'), 0), count(*) filter (where origem = 'manual'),
         max(quando)
    from ops group by 1
$$;
revoke all on function public.teeds_markup_dias(text[], text, date, date) from public, anon, authenticated;

-- A leitura que as telas fazem: o período escolhido (dias de Brasília), o total e cada dia.
create or replace function public.teeds_markup_interno(p_marca text, p_de date, p_ate date, p_parceiro text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_marcas text[];
  v_par text;
  v_de date := least(p_de, p_ate);
  v_ate date := greatest(p_de, p_ate);
  r jsonb;
begin
  if p_marca = 'todas' then
    if public.teeds_parceiro_forcado('todas') is not null then raise exception 'Só a administração vê o markup'; end if;
    v_marcas := public.teeds_marcas_em_foco('todas');
  else
    if not public.teeds_admin_pleno_da(p_marca) then raise exception 'Só a administração vê o markup'; end if;
    v_marcas := array[p_marca];
  end if;
  if v_ate - v_de > 400 then v_de := v_ate - 400; end if;
  v_par := nullif(trim(coalesce(public.teeds_parceiro_forcado(p_marca), p_parceiro, '')), '');

  with d as (select * from public.teeds_markup_dias(v_marcas, v_par, v_de, v_ate))
  select jsonb_build_object(
    'de', v_de, 'ate', v_ate, 'parceiro', v_par,
    'markup', coalesce((select sum(markup) from d), 0),
    'operacoes', coalesce((select sum(operacoes) from d), 0),
    'entradas', coalesce((select sum(entradas) from d), 0),
    'ia_markup', coalesce((select sum(ia_markup) from d), 0),
    'ia_operacoes', coalesce((select sum(ia_operacoes) from d), 0),
    'manual_markup', coalesce((select sum(manual_markup) from d), 0),
    'manual_operacoes', coalesce((select sum(manual_operacoes) from d), 0),
    'ultima_em', (select max(ultima_em) from d),
    'por_dia', coalesce((select jsonb_agg(jsonb_build_object('dia', dia, 'markup', markup, 'operacoes', operacoes) order by dia) from d), '[]'::jsonb),
    'lido_em', now()
  ) into r;
  return r;
end $$;
revoke all on function public.teeds_markup_interno(text, date, date, text) from public, anon;
grant execute on function public.teeds_markup_interno(text, date, date, text) to authenticated;

-- A Visão geral passa a ler o markup da mesma contagem (o resto do painel fica igual).
create or replace function public.teeds_painel_visao_geral(p_marca text, p_parceiro text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_par text;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ini_hoje timestamptz := (v_hoje::timestamp at time zone 'America/Sao_Paulo');
  v_ini_mes date := date_trunc('month', v_hoje)::date;
  r jsonb;
begin
  if not public.teeds_admin_pleno_da(p_marca) then raise exception 'Só a administração vê o painel'; end if;
  v_par := nullif(trim(coalesce(public.teeds_parceiro_forcado(p_marca), p_parceiro, '')), '');

  with cli as (
    select c.* from public.clientes c
     where c.marca = p_marca
       and not exists (select 1 from public.administradores a where a.user_id = c.user_id)
       and (v_par is null or (v_par = 'direto' and c.parceiro is null) or c.parceiro = v_par)
  ),
  contas as (
    select k.user_id, k.conta_id, k.saldo, k.moeda from public.contas_deriv k join cli on cli.user_id = k.user_id
     where k.marca = p_marca and k.tipo = 'real'
  ),
  banca as (select user_id, sum(coalesce(saldo, 0)) as saldo from contas group by user_id),
  ses as (
    select s.user_id, s.demo, s.id from public.sessoes_robos s join cli on cli.user_id = s.user_id
     where s.marca = p_marca and s.situacao = 'rodando'
  ),
  man as (
    select m.user_id, m.demo from public.operacoes_manuais m join cli on cli.user_id = m.user_id
     where m.marca = p_marca and m.situacao = 'aberta' and coalesce(m.expira_em, m.criado_em + interval '1 hour') > now()
  ),
  op_real as (select user_id from ses where not demo union select user_id from man where not demo),
  op_demo as (select user_id from ses where demo union select user_id from man where demo except select user_id from op_real),
  -- o markup sai da contagem interna única (teeds_markup_dias), em dias de Brasília
  com as (
    select d.dia, d.markup, d.operacoes, d.entradas, d.resultado, d.clientes, d.ultima_em
      from public.teeds_markup_dias(array[p_marca], v_par, least(v_hoje - 29, v_ini_mes), v_hoje) d
  ),
  mov as (
    select v.tipo, v.valor, v.ocorrida_em from public.movimentacoes_deriv v join cli on cli.user_id = v.user_id
     where v.marca = p_marca and not v.demo and v.ocorrida_em > now() - interval '30 days'
  ),
  faixas as (
    select f.ordem, f.rotulo, count(b.user_id) as clientes, coalesce(sum(b.saldo), 0) as soma
      from (values (1, 'Até US$ 50', 0.01, 50), (2, 'US$ 50 a 200', 50, 200), (3, 'US$ 200 a 1 mil', 200, 1000),
                   (4, 'US$ 1 mil a 5 mil', 1000, 5000), (5, 'Mais de US$ 5 mil', 5000, 1e12)) f(ordem, rotulo, de, ate)
      left join banca b on b.saldo >= f.de and b.saldo < f.ate
     group by f.ordem, f.rotulo
  )
  select jsonb_build_object(
    'agora', jsonb_build_object(
      'na_plataforma', (select count(*) from cli where visto_em >= now() - interval '3 minutes'),
      'operando_real', (select count(*) from op_real),
      'operando_demo', (select count(*) from op_demo),
      'banca_operando_real', (select coalesce(sum(b.saldo), 0) from banca b where b.user_id in (select user_id from op_real)),
      'ias_real', (select count(*) from ses where not demo),
      'ias_demo', (select count(*) from ses where demo),
      'manuais_real', (select count(*) from man where not demo)
    ),
    'banca', jsonb_build_object(
      'total', (select coalesce(sum(saldo), 0) from banca),
      'clientes_com_saldo', (select count(*) from banca where saldo > 0),
      'contas_reais', (select count(*) from contas),
      'maior', (select coalesce(max(saldo), 0) from banca),
      'faixas', (select coalesce(jsonb_agg(jsonb_build_object('rotulo', rotulo, 'clientes', clientes, 'soma', soma) order by ordem), '[]'::jsonb) from faixas),
      'top', (select coalesce(jsonb_agg(t order by t.saldo desc), '[]'::jsonb) from (
                select b.user_id, cli.nome, cli.foto_url, cli.parceiro, b.saldo,
                       b.user_id in (select user_id from op_real) as operando,
                       cli.visto_em >= now() - interval '3 minutes' as online
                  from banca b join cli on cli.user_id = b.user_id where b.saldo > 0 order by b.saldo desc limit 5) t)
    ),
    'markup', jsonb_build_object(
      'hoje', (select coalesce(sum(markup), 0) from com where dia = v_hoje),
      'd7', (select coalesce(sum(markup), 0) from com where dia > v_hoje - 7),
      'd30', (select coalesce(sum(markup), 0) from com where dia > v_hoje - 30),
      'mes', (select coalesce(sum(markup), 0) from com where dia >= v_ini_mes),
      'ultima_em', (select max(ultima_em) from com),
      'serie', (select coalesce(jsonb_agg(jsonb_build_object('dia', g.dia::date, 'markup', coalesce(c.markup, 0), 'operacoes', coalesce(c.operacoes, 0)) order by g.dia), '[]'::jsonb)
                  from generate_series(v_hoje - 29, v_hoje, interval '1 day') g(dia) left join com c on c.dia = g.dia::date)
    ),
    'hoje', jsonb_build_object(
      'operacoes', (select coalesce(sum(operacoes), 0) from com where dia = v_hoje),
      'volume', (select coalesce(sum(entradas), 0) from com where dia = v_hoje),
      'resultado', (select coalesce(sum(resultado), 0) from com where dia = v_hoje),
      'operaram', (select coalesce(sum(clientes), 0) from com where dia = v_hoje)
    ),
    'funil', jsonb_build_object(
      'cadastrados', (select count(*) from cli),
      'ativos', (select count(*) from cli where status_acesso = 'ativo'),
      'conectaram', (select count(distinct k.user_id) from public.contas_deriv k join cli on cli.user_id = k.user_id where k.marca = p_marca),
      'conta_real', (select count(distinct user_id) from contas),
      'com_saldo', (select count(*) from banca where saldo > 0),
      'operaram_real', (select count(distinct d.user_id) from public.comissoes_diarias d join cli on cli.user_id = d.user_id
                         where d.marca = p_marca and not d.demo and d.dia > v_hoje - 30 and d.operacoes > 0),
      'ativos_24h', (select count(*) from cli where visto_em > now() - interval '24 hours')
    ),
    'dinheiro', jsonb_build_object(
      'depositos_7d', (select coalesce(sum(abs(valor)), 0) from mov where tipo = 'deposit' and ocorrida_em > now() - interval '7 days'),
      'saques_7d', (select coalesce(sum(abs(valor)), 0) from mov where tipo = 'withdrawal' and ocorrida_em > now() - interval '7 days'),
      'depositos_30d', (select coalesce(sum(abs(valor)), 0) from mov where tipo = 'deposit'),
      'saques_30d', (select coalesce(sum(abs(valor)), 0) from mov where tipo = 'withdrawal'),
      'depositantes_30d', (select count(distinct v.user_id) from public.movimentacoes_deriv v join cli on cli.user_id = v.user_id
                            where v.marca = p_marca and not v.demo and v.tipo = 'deposit' and v.ocorrida_em > now() - interval '30 days')
    ),
    'alertas', jsonb_build_object(
      'expirados', (select count(*) from cli where status_acesso = 'expirado'),
      'vencem_7d', (select count(*) from cli where status_acesso = 'ativo' and acesso_expira_em between now() and now() + interval '7 days')
    ),
    'lido_em', now()
  ) into r;
  return r;
end $$;
revoke all on function public.teeds_painel_visao_geral(text, text) from public, anon;
grant execute on function public.teeds_painel_visao_geral(text, text) to authenticated;

-- A Análise das I.A. da aba Comissões usa a mesma régua quando pedida (p_sem_equipe e p_parceiro): equipe
-- fora e parceiro do topo. Quem não pede (Centro de estudo, Plataformas) continua vendo como antes.
create or replace function public.teeds_ids_da_equipe()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct a.user_id), array[]::uuid[]) from public.administradores a
$$;
revoke all on function public.teeds_ids_da_equipe() from public, anon;
grant execute on function public.teeds_ids_da_equipe() to authenticated;

drop function if exists public.teeds_analise_operacoes(text, timestamptz, timestamptz, integer, integer, text, text, boolean, text);
create or replace function public.teeds_analise_operacoes(
  p_marca text default 'teeds', p_de timestamptz default (now() - '30 days'::interval), p_ate timestamptz default now(),
  p_hora_de integer default 0, p_hora_ate integer default 23, p_fuso text default 'America/Sao_Paulo',
  p_robo text default null, p_demo boolean default false, p_conta text default null,
  p_parceiro text default null, p_sem_equipe boolean default false)
returns jsonb language plpgsql stable set search_path to 'public' as $$
declare
  v_marcas text[] := public.teeds_marcas_em_foco(p_marca);
  v_hd int := coalesce(p_hora_de, 0);
  v_ha int := coalesce(p_hora_ate, 23);
  v_equipe uuid[] := case when p_sem_equipe then public.teeds_ids_da_equipe() else array[]::uuid[] end;
  v_par text := nullif(trim(coalesce(public.teeds_parceiro_forcado(p_marca), p_parceiro, '')), '');
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
      and o.user_id <> all(v_equipe)
      and (v_par is null or exists (
        select 1 from public.clientes c where c.user_id = o.user_id and c.marca = o.marca
           and ((v_par = 'direto' and c.parceiro is null) or c.parceiro = v_par)))
  ),
  f as materialized (
    select * from base
    where case
      when v_hd <= v_ha then extract(hour from local) between v_hd and v_ha
      else extract(hour from local) >= v_hd or extract(hour from local) <= v_ha
    end
  )
  select jsonb_build_object(
    'total', (select jsonb_build_object('operacoes', count(*), 'ganhas', count(*) filter (where ganhou), 'entradas', coalesce(sum(entrada), 0), 'pagamentos', coalesce(sum(pagamento), 0), 'markup', coalesce(sum(markup), 0), 'markup_deriv', coalesce(sum(markup_deriv), 0), 'resultado', coalesce(sum(resultado), 0), 'clientes', count(distinct user_id), 'contas', count(distinct conta_id)) from f),
    'por_hora', (select coalesce(jsonb_agg(x order by x.hora), '[]'::jsonb) from (select extract(hour from local)::int as hora, count(*) as operacoes, count(*) filter (where ganhou) as ganhas, coalesce(sum(markup), 0) as markup, coalesce(sum(resultado), 0) as resultado from f group by 1) x),
    'por_dia', (select coalesce(jsonb_agg(x order by x.dia), '[]'::jsonb) from (select to_char(local::date, 'YYYY-MM-DD') as dia, count(*) as operacoes, count(*) filter (where ganhou) as ganhas, coalesce(sum(entrada), 0) as entradas, coalesce(sum(markup), 0) as markup, coalesce(sum(resultado), 0) as resultado from f group by 1) x),
    'por_robo', (select coalesce(jsonb_agg(x order by x.markup desc, x.operacoes desc), '[]'::jsonb) from (select robo_id, max(robo_nome) as robo_nome, count(*) as operacoes, count(*) filter (where ganhou) as ganhas, count(distinct user_id) as clientes, coalesce(sum(entrada), 0) as entradas, coalesce(sum(markup), 0) as markup, coalesce(sum(resultado), 0) as resultado from f group by 1) x),
    'por_conta', (select coalesce(jsonb_agg(x order by x.markup desc, x.operacoes desc), '[]'::jsonb) from (select conta_id, bool_or(demo) as demo, count(*) as operacoes, coalesce(sum(markup), 0) as markup, coalesce(sum(resultado), 0) as resultado from f group by 1) x),
    'por_marca', (select coalesce(jsonb_agg(x order by x.markup desc), '[]'::jsonb) from (select marca, count(*) as operacoes, count(*) filter (where ganhou) as ganhas, coalesce(sum(entrada), 0) as entradas, coalesce(sum(markup), 0) as markup, coalesce(sum(resultado), 0) as resultado, count(distinct conta_id) as contas from f group by 1) x)
  ) into r;
  return r;
end $$;
grant execute on function public.teeds_analise_operacoes(text, timestamptz, timestamptz, integer, integer, text, text, boolean, text, text, boolean) to authenticated;
