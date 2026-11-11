-- Mapa do markup por dia da semana e hora (11/11/2026, Tiago: "enxergar por dia da semana, por horário").
-- A mesma contagem da Visão geral (teeds_markup_operacoes: só conta real, um contrato uma vez, equipe fora,
-- parceiro do topo), agrupada por dia da semana (1 = segunda ... 7 = domingo) e hora de Brasília.
-- Conferido: em 30 dias bate com teeds_painel_periodo (US$ 803,76 · 18.851 operações); não admin é recusado.
create or replace function public.teeds_markup_mapa(p_marca text, p_de timestamptz, p_ate timestamptz, p_parceiro text default null)
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
  if not public.teeds_admin_pleno_da(p_marca) then raise exception 'Só a administração vê o painel'; end if;
  if v_ate - v_de > interval '400 days' then v_de := v_ate - interval '400 days'; end if;
  v_par := nullif(trim(coalesce(public.teeds_parceiro_forcado(p_marca), p_parceiro, '')), '');

  with ops as materialized (
    select (quando at time zone 'America/Sao_Paulo') as local, markup
      from public.teeds_markup_operacoes(array[p_marca], v_par, v_de, v_ate)
  ),
  cel as (
    select extract(isodow from local)::int as d, extract(hour from local)::int as h,
           sum(markup) as markup, count(*) as operacoes
      from ops group by 1, 2
  ),
  -- quantas vezes cada dia da semana aparece no período (para a média por dia)
  dias as (
    select extract(isodow from g)::int as d, count(*) as n
      from generate_series(date_trunc('day', v_de at time zone 'America/Sao_Paulo'),
                           date_trunc('day', (v_ate - interval '1 microsecond') at time zone 'America/Sao_Paulo'),
                           interval '1 day') g
     group by 1
  )
  select jsonb_build_object(
    'de', v_de, 'ate', v_ate, 'parceiro', v_par,
    'total', (select coalesce(sum(markup), 0) from ops),
    'operacoes', (select count(*) from ops),
    'celulas', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'h', h, 'markup', round(markup, 4), 'operacoes', operacoes) order by d, h), '[]'::jsonb) from cel),
    'dias', (select coalesce(jsonb_object_agg(d::text, n), '{}'::jsonb) from dias),
    'lido_em', now()
  ) into r;
  return r;
end $$;

revoke all on function public.teeds_markup_mapa(text, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.teeds_markup_mapa(text, timestamptz, timestamptz, text) to authenticated;
