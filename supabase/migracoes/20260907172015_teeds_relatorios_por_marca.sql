-- Os relatórios da Administração passam a enxergar uma plataforma só.
--
-- Eu tinha filtrado as leituras diretas por marca e parado ali. Os painéis
-- de Administração não leem tabela: chamam estas funções — e elas somavam
-- tudo. Resultado: a Administração da OMNI mostrava 38 mil operações e US$
-- 10 mil de comissão que eram da Teeds, e cada cliente aparecia duas vezes
-- (uma por ficha, agora que a chave é pessoa+marca).
--
-- Número de uma plataforma aparecendo na outra é pior que número faltando:
-- o que falta a pessoa procura, o que sobra ela acredita.

drop function if exists public.teeds_relatorio_clientes(integer, boolean);
create or replace function public.teeds_relatorio_clientes(
  p_dias integer default 30, p_incluir_demo boolean default true, p_marca text default 'teeds'
)
returns table (
  user_id uuid, nome text, email text, contas bigint, contas_reais bigint,
  operacoes bigint, entradas numeric, pagamentos numeric, resultado numeric,
  comissao_calculada numeric, comissao_real numeric, dias_com_dados bigint,
  dias_sem_resultado bigint, operacoes_robos bigint, resultado_robos numeric,
  markup_robos numeric, ultimo_dia date, visto_em timestamptz
)
language sql stable set search_path to 'public'
as $function$
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
    where k.marca = p_marca and k.dia >= j.corte and (p_incluir_demo or not k.demo)
    group by k.user_id
  ),
  robos as (
    select o.user_id,
           count(*) as operacoes,
           coalesce(sum(o.resultado), 0) as resultado,
           coalesce(sum(o.markup), 0) as markup
    from public.operacoes_robos o, janela j
    where o.marca = p_marca and o.executada_em >= j.corte::timestamptz
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
  -- a ficha desta plataforma, e só ela: sem isto a mesma pessoa aparece
  -- uma vez por marca em que tem cadastro
  from public.clientes c
  left join diario d on d.user_id = c.user_id
  left join robos  r on r.user_id = c.user_id
  where public.teeds_sou_admin() and c.marca = p_marca
  order by coalesce(d.comissao, 0) desc, coalesce(d.operacoes, 0) desc;
$function$;

drop function if exists public.teeds_metricas_robos(integer);
create or replace function public.teeds_metricas_robos(
  p_dias integer default 90, p_marca text default 'teeds'
)
returns table (
  robo_id text, robo_nome text, operacoes bigint, vitorias bigint,
  clientes bigint, volume numeric, resultado numeric, markup numeric
)
language sql stable set search_path to 'public'
as $function$
  select o.robo_id,
         max(o.robo_nome) as robo_nome,
         count(*) as operacoes,
         count(*) filter (where o.ganhou) as vitorias,
         count(distinct o.user_id) as clientes,
         coalesce(sum(o.entrada), 0) as volume,
         coalesce(sum(o.resultado), 0) as resultado,
         coalesce(sum(o.markup) filter (where not o.demo), 0) as markup
  from public.operacoes_robos o
  where public.teeds_sou_admin() and o.marca = p_marca
    and o.executada_em >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 90), 3650)))
  group by o.robo_id
  order by markup desc, operacoes desc;
$function$;

drop function if exists public.teeds_operacoes_cliente(uuid, integer);
create or replace function public.teeds_operacoes_cliente(
  p_user_id uuid, p_dias integer default 30, p_marca text default 'teeds'
)
returns table (
  contract_id bigint, conta_id text, demo boolean, robo_id text, robo_nome text,
  ativo text, tipo_contrato text, entrada numeric, pagamento numeric,
  resultado numeric, markup numeric, markup_deriv numeric, ganhou boolean,
  executada_em timestamptz
)
language sql stable set search_path to 'public'
as $function$
  select o.contract_id, o.conta_id, o.demo,
         o.robo_id, o.robo_nome, o.ativo, o.tipo_contrato,
         o.entrada, o.pagamento, o.resultado,
         o.markup, o.markup_deriv, o.ganhou, o.executada_em
  from public.operacoes_robos o
  where (public.teeds_sou_admin() or o.user_id = (select auth.uid()))
    and o.user_id = p_user_id and o.marca = p_marca
    and o.executada_em >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 3650)))
  order by o.executada_em desc
  limit 5000;
$function$;

grant execute on function public.teeds_relatorio_clientes(integer, boolean, text) to authenticated;
grant execute on function public.teeds_metricas_robos(integer, text) to authenticated;
grant execute on function public.teeds_operacoes_cliente(uuid, integer, text) to authenticated;
