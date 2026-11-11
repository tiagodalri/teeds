-- 11/11/2026 (Tiago: "eu gostaria que mostrasse em tempo real, mas também gostaria de ter a opção de
-- selecionar período, sabe? Período personalizado etc."). A Visão geral ganha um seletor de período:
-- Agora, Hoje, Ontem, 7 dias, 30 dias, Este mês e Personalizado (data e hora de início e de fim).
--
-- O markup continua com UMA contagem só. O que mudou foi onde ela mora:
--   * teeds_markup_operacoes: a lista de contratos que contam (só conta real, um contrato conta uma vez,
--     equipe fora, parceiro do topo), agora numa janela de horário qualquer. É o miolo que estava dentro
--     de teeds_markup_dias, copiado sem mudar uma vírgula da regra.
--   * teeds_markup_dias passa a somar por dia a partir dela (mesmo resultado de antes, mesma assinatura):
--     a aba Comissões e o painel de agora seguem iguais.
--   * teeds_painel_periodo (nova): os blocos de período da Visão geral (markup, operações, resultado,
--     pessoas que operaram, depósitos e saques) entre dois instantes, no mesmo escopo de cada admin.
--     A teeds_painel_visao_geral de hoje não muda: ela segue sendo o retrato de agora.

-- 1. A lista de contratos que contam, numa janela [p_de, p_ate). Interna (só as funções abaixo chamam).
create or replace function public.teeds_markup_operacoes(p_marcas text[], p_parceiro text, p_de timestamptz, p_ate timestamptz)
returns table(origem text, contract_id bigint, user_id uuid, quando timestamptz, markup numeric, entrada numeric, resultado numeric)
language sql stable set search_path = public as $$
  with cli as (
    select c.user_id, c.marca from public.clientes c
     where c.marca = any(p_marcas)
       and not exists (select 1 from public.administradores a where a.user_id = c.user_id)
       and (p_parceiro is null or (p_parceiro = 'direto' and c.parceiro is null) or c.parceiro = p_parceiro)
  )
  select distinct on (x.contract_id) x.* from (
    select 'ia'::text as origem, o.contract_id, o.user_id, o.executada_em as quando,
           coalesce(o.markup, 0) as markup, coalesce(o.entrada, 0) as entrada, coalesce(o.resultado, 0) as resultado
      from public.operacoes_robos o
      join cli on cli.user_id = o.user_id and cli.marca = o.marca
     where o.marca = any(p_marcas) and not o.demo and o.executada_em >= p_de and o.executada_em < p_ate
    union all
    select 'manual', m.contract_id, m.user_id, m.comprada_em,
           coalesce(m.markup, 0), coalesce(m.entrada, 0), coalesce(m.resultado, 0)
      from public.operacoes_manuais m
      join cli on cli.user_id = m.user_id and cli.marca = m.marca
     where m.marca = any(p_marcas) and not m.demo and coalesce(m.pagamento, 0) > 0
       and m.comprada_em >= p_de and m.comprada_em < p_ate
  ) x
  order by x.contract_id, x.origem
$$;
revoke all on function public.teeds_markup_operacoes(text[], text, timestamptz, timestamptz) from public, anon, authenticated;

-- 2. A soma por dia de Brasília, agora a partir da lista acima (mesma assinatura e mesmo resultado).
create or replace function public.teeds_markup_dias(p_marcas text[], p_parceiro text, p_de date, p_ate date)
returns table(dia date, markup numeric, operacoes bigint, entradas numeric, resultado numeric, clientes bigint,
              ia_markup numeric, ia_operacoes bigint, manual_markup numeric, manual_operacoes bigint, ultima_em timestamptz)
language sql stable set search_path = public as $$
  select (o.quando at time zone 'America/Sao_Paulo')::date as dia,
         sum(o.markup), count(*), sum(o.entrada), sum(o.resultado), count(distinct o.user_id),
         coalesce(sum(o.markup) filter (where o.origem = 'ia'), 0), count(*) filter (where o.origem = 'ia'),
         coalesce(sum(o.markup) filter (where o.origem = 'manual'), 0), count(*) filter (where o.origem = 'manual'),
         max(o.quando)
    from public.teeds_markup_operacoes(p_marcas, p_parceiro,
           (p_de::timestamp at time zone 'America/Sao_Paulo'),
           ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')) o
   group by 1
$$;
revoke all on function public.teeds_markup_dias(text[], text, date, date) from public, anon, authenticated;

-- 3. Os blocos de período da Visão geral, entre dois instantes (o fim não entra). Mesmo escopo do painel:
--    admin pleno da marca, parceiro forçado para quem é admin de parceiro, equipe fora.
--    A série vem por hora (até 48 h) ou por dia, sempre no horário de Brasília.
create or replace function public.teeds_painel_periodo(p_marca text, p_de timestamptz, p_ate timestamptz, p_parceiro text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_par text;
  v_de timestamptz := least(p_de, p_ate);
  v_ate timestamptz := greatest(p_de, p_ate);
  v_escala text;
  r jsonb;
begin
  if p_de is null or p_ate is null then raise exception 'Escolha o início e o fim do período'; end if;
  if not public.teeds_admin_pleno_da(p_marca) then raise exception 'Só a administração vê o painel'; end if;
  if v_ate - v_de > interval '400 days' then v_de := v_ate - interval '400 days'; end if;
  v_par := nullif(trim(coalesce(public.teeds_parceiro_forcado(p_marca), p_parceiro, '')), '');
  v_escala := case when v_ate - v_de <= interval '48 hours' then 'hour' else 'day' end;

  with ops as materialized (
    select * from public.teeds_markup_operacoes(array[p_marca], v_par, v_de, v_ate)
  ),
  cli as (
    select c.user_id from public.clientes c
     where c.marca = p_marca
       and not exists (select 1 from public.administradores a where a.user_id = c.user_id)
       and (v_par is null or (v_par = 'direto' and c.parceiro is null) or c.parceiro = v_par)
  ),
  mov as (
    select v.user_id, v.tipo, abs(v.valor) as valor from public.movimentacoes_deriv v join cli on cli.user_id = v.user_id
     where v.marca = p_marca and not v.demo and v.tipo in ('deposit', 'withdrawal')
       and v.ocorrida_em >= v_de and v.ocorrida_em < v_ate
  ),
  baldes as (
    select g as ini from generate_series(
      date_trunc(v_escala, v_de at time zone 'America/Sao_Paulo'),
      date_trunc(v_escala, (v_ate - interval '1 microsecond') at time zone 'America/Sao_Paulo'),
      case when v_escala = 'hour' then interval '1 hour' else interval '1 day' end) g
  ),
  por as (
    select date_trunc(v_escala, quando at time zone 'America/Sao_Paulo') as ini,
           sum(markup) as markup, count(*) as operacoes
      from ops group by 1
  )
  select jsonb_build_object(
    'de', v_de, 'ate', v_ate, 'parceiro', v_par,
    'escala', case when v_escala = 'hour' then 'hora' else 'dia' end,
    'markup', jsonb_build_object(
      'total', (select coalesce(sum(markup), 0) from ops),
      'ia', (select coalesce(sum(markup), 0) from ops where origem = 'ia'),
      'manual', (select coalesce(sum(markup), 0) from ops where origem = 'manual'),
      'ultima_em', (select max(quando) from ops)
    ),
    'operacoes', jsonb_build_object(
      'total', (select count(*) from ops),
      'ia', (select count(*) from ops where origem = 'ia'),
      'manual', (select count(*) from ops where origem = 'manual'),
      'volume', (select coalesce(sum(entrada), 0) from ops),
      'resultado', (select coalesce(sum(resultado), 0) from ops),
      'operaram', (select count(distinct user_id) from ops)
    ),
    'serie', (select coalesce(jsonb_agg(jsonb_build_object(
                 'ini', to_char(b.ini, 'YYYY-MM-DD"T"HH24:MI'),
                 'markup', coalesce(p.markup, 0), 'operacoes', coalesce(p.operacoes, 0)) order by b.ini), '[]'::jsonb)
                from baldes b left join por p on p.ini = b.ini),
    'dinheiro', jsonb_build_object(
      'depositos', (select coalesce(sum(valor), 0) from mov where tipo = 'deposit'),
      'saques', (select coalesce(sum(valor), 0) from mov where tipo = 'withdrawal'),
      'qtd_depositos', (select count(*) from mov where tipo = 'deposit'),
      'qtd_saques', (select count(*) from mov where tipo = 'withdrawal'),
      'depositantes', (select count(distinct user_id) from mov where tipo = 'deposit'),
      'sacaram', (select count(distinct user_id) from mov where tipo = 'withdrawal')
    ),
    'lido_em', now()
  ) into r;
  return r;
end $$;
revoke all on function public.teeds_painel_periodo(text, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.teeds_painel_periodo(text, timestamptz, timestamptz, text) to authenticated;
