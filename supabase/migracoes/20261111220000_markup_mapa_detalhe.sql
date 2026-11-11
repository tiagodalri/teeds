-- 11/11/2026 (Tiago, sobre "Quando o markup acontece": "no gráfico de barras ali quero mais dados, os valores.
-- quero poder clicar em cada barrinha do gráfico e ver o detalhamento dos dados etc.").
-- O detalhe de uma barra: um dia da semana (p_dia, 1 = segunda ... 7 = domingo), uma hora (p_hora, 0 a 23)
-- ou os dois. Mesma contagem de sempre (teeds_markup_operacoes: só conta real, um contrato uma vez, equipe
-- fora, parceiro do topo), mesmo escopo do painel. Só acrescenta o nome da I.A. de cada contrato (pela chave
-- de operacoes_robos) e o nome do cliente, para as listas do detalhe.
create or replace function public.teeds_markup_mapa_detalhe(
  p_marca text, p_de timestamptz, p_ate timestamptz, p_parceiro text default null,
  p_dia integer default null, p_hora integer default null)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_par text;
  v_de timestamptz := least(p_de, p_ate);
  v_ate timestamptz := greatest(p_de, p_ate);
  r jsonb;
begin
  if p_de is null or p_ate is null then raise exception 'Escolha o início e o fim do período'; end if;
  if p_dia is null and p_hora is null then raise exception 'Escolha um dia da semana ou um horário'; end if;
  if p_dia is not null and (p_dia < 1 or p_dia > 7) then raise exception 'Dia da semana inválido'; end if;
  if p_hora is not null and (p_hora < 0 or p_hora > 23) then raise exception 'Horário inválido'; end if;
  if not public.teeds_admin_pleno_da(p_marca) then raise exception 'Só a administração vê o painel'; end if;
  if v_ate - v_de > interval '400 days' then v_de := v_ate - interval '400 days'; end if;
  v_par := nullif(trim(coalesce(public.teeds_parceiro_forcado(p_marca), p_parceiro, '')), '');

  with todas as materialized (
    select o.*, (o.quando at time zone 'America/Sao_Paulo') as local
      from public.teeds_markup_operacoes(array[p_marca], v_par, v_de, v_ate) o
  ),
  ops as materialized (
    select t.*, extract(isodow from t.local)::int as d, extract(hour from t.local)::int as h
      from todas t
     where (p_dia is null or extract(isodow from t.local)::int = p_dia)
       and (p_hora is null or extract(hour from t.local)::int = p_hora)
  ),
  -- o nome da I.A. de cada contrato (a manual não tem)
  ia as (
    select coalesce(nullif(trim(x.robo_nome), ''), x.robo_id, 'I.A.') as nome, ops.markup, ops.user_id
      from ops join public.operacoes_robos x on x.user_id = ops.user_id and x.contract_id = ops.contract_id
     where ops.origem = 'ia'
  ),
  -- as datas do período que caem no recorte (para o "dia a dia")
  datas as (
    select g::date as dia
      from generate_series(date_trunc('day', v_de at time zone 'America/Sao_Paulo'),
                           date_trunc('day', (v_ate - interval '1 microsecond') at time zone 'America/Sao_Paulo'),
                           interval '1 day') g
     where p_dia is null or extract(isodow from g)::int = p_dia
  )
  select jsonb_build_object(
    'de', v_de, 'ate', v_ate, 'parceiro', v_par, 'dia', p_dia, 'hora', p_hora,
    'total_periodo', (select coalesce(sum(markup), 0) from todas),
    'markup', (select coalesce(sum(markup), 0) from ops),
    'operacoes', (select count(*) from ops),
    'volume', (select coalesce(sum(entrada), 0) from ops),
    'resultado', (select coalesce(sum(resultado), 0) from ops),
    'clientes', (select count(distinct user_id) from ops),
    'ia', jsonb_build_object('markup', (select coalesce(sum(markup), 0) from ops where origem = 'ia'), 'operacoes', (select count(*) from ops where origem = 'ia')),
    'manual', jsonb_build_object('markup', (select coalesce(sum(markup), 0) from ops where origem = 'manual'), 'operacoes', (select count(*) from ops where origem = 'manual')),
    'por_data', (select coalesce(jsonb_agg(jsonb_build_object('dia', dt.dia, 'markup', coalesce(x.markup, 0), 'operacoes', coalesce(x.operacoes, 0)) order by dt.dia), '[]'::jsonb)
                   from datas dt left join (select local::date as dia, sum(markup) as markup, count(*) as operacoes from ops group by 1) x on x.dia = dt.dia),
    'por_hora', (select coalesce(jsonb_agg(jsonb_build_object('h', h, 'markup', markup, 'operacoes', operacoes) order by h), '[]'::jsonb)
                   from (select h, sum(markup) as markup, count(*) as operacoes from ops group by 1) x),
    'por_dia_semana', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'markup', markup, 'operacoes', operacoes) order by d), '[]'::jsonb)
                   from (select d, sum(markup) as markup, count(*) as operacoes from ops group by 1) x),
    'por_ia', (select coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'markup', markup, 'operacoes', operacoes, 'clientes', clientes) order by markup desc), '[]'::jsonb)
                 from (select nome, sum(markup) as markup, count(*) as operacoes, count(distinct user_id) as clientes from ia group by 1) x),
    'clientes_top', (select coalesce(jsonb_agg(jsonb_build_object('user_id', x.user_id, 'nome', c.nome, 'foto_url', c.foto_url, 'parceiro', c.parceiro,
                                                                   'markup', x.markup, 'operacoes', x.operacoes, 'resultado', x.resultado) order by x.markup desc), '[]'::jsonb)
                       from (select user_id, sum(markup) as markup, count(*) as operacoes, sum(resultado) as resultado
                               from ops group by 1 order by 2 desc limit 8) x
                       left join public.clientes c on c.user_id = x.user_id and c.marca = p_marca),
    'lido_em', now()
  ) into r;
  return r;
end $$;

revoke all on function public.teeds_markup_mapa_detalhe(text, timestamptz, timestamptz, text, integer, integer) from public, anon;
grant execute on function public.teeds_markup_mapa_detalhe(text, timestamptz, timestamptz, text, integer, integer) to authenticated;
