-- A comissão deixa de depender de alguém abrir uma tela.
--
-- Até aqui os painéis liam `comissoes_diarias`, que só é escrita quando o
-- dono ABRE a tela de Gestão. Por isso ela congelou em 3 de setembro
-- enquanto 27 mil operações continuavam entrando — e ninguém percebeu,
-- porque a tela mostra o que tem, sem dizer de quando é.
--
-- Agora a fonte é `operacoes_robos`, que o servidor escreve a cada operação
-- liquidada. Sempre atual, sem depender de ninguém.

-- Mesmo formato de antes, para os painéis não precisarem mudar de ideia:
-- uma linha por cliente, conta e dia.
create or replace function public.teeds_comissao_viva(
  p_dias integer default 30, p_marca text default 'teeds'
)
returns table (
  user_id uuid, conta_id text, dia date, operacoes bigint,
  pagamentos numeric, comissao numeric, entradas numeric,
  resultado numeric, moeda text, demo boolean, atualizado_em timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
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
  where o.marca = p_marca
    and o.executada_em >= (now() - make_interval(days => greatest(coalesce(p_dias, 30), 1)))
  group by o.user_id, o.conta_id, (o.executada_em at time zone 'UTC')::date, o.demo
  order by dia desc;
$$;

grant execute on function public.teeds_comissao_viva(integer, text) to authenticated;

-- A conferência contra o número oficial da Deriv, por marca.
--
-- Duas coisas que pareciam defeito e não são:
--  - conta de demonstração NÃO gera markup. Se tudo que rodou foi demo, o
--    lado oficial fica zerado e está certo.
--  - o número da Deriv demora de uma a duas horas para aparecer. O dia de
--    hoje quase sempre mostra diferença, e isso é atraso, não erro.
-- Por isso a coluna `so_demo`: a tela precisa saber distinguir "não houve
-- operação real" de "a Deriv não bate com a nossa conta".
drop function if exists public.teeds_comissao_conferencia(integer);

create or replace function public.teeds_comissao_conferencia(
  p_dias integer default 30, p_marca text default 'teeds', p_app_id text default null
)
returns table (
  dia date, calculada numeric, oficial numeric, diferenca numeric,
  diferenca_pct numeric, operacoes bigint, contratos_deriv integer,
  clientes bigint, so_demo boolean
)
language sql
stable
set search_path = public
as $$
  with janela as (
    select (current_date - greatest(0, least(coalesce(p_dias, 30), 3650) - 1))::date as corte
  ),
  -- o que a Teeds/OMNI calculou, ao vivo, só das contas reais
  nosso as (
    select (o.executada_em at time zone 'UTC')::date as dia,
           sum(coalesce(o.markup, o.pagamento * 0.03)) as calculada,
           count(*) as operacoes,
           count(distinct o.user_id) as clientes
    from public.operacoes_robos o, janela j
    where o.marca = p_marca and not o.demo
      and (o.executada_em at time zone 'UTC')::date >= j.corte
    group by 1
  ),
  -- houve alguma operação nesse dia, mesmo que só em demonstração?
  havia as (
    select (o.executada_em at time zone 'UTC')::date as dia, bool_and(o.demo) as so_demo
    from public.operacoes_robos o, janela j
    where o.marca = p_marca and (o.executada_em at time zone 'UTC')::date >= j.corte
    group by 1
  ),
  -- o que a Deriv reporta para a app desta marca
  deriv as (
    select m.dia, m.comissao, m.contratos
    from public.markup_oficial_diario m, janela j
    where m.dia >= j.corte
      and (p_app_id is null or m.app_id = p_app_id)
  )
  select coalesce(n.dia, d.dia, h.dia) as dia,
         coalesce(n.calculada, 0) as calculada,
         coalesce(d.comissao, 0) as oficial,
         coalesce(n.calculada, 0) - coalesce(d.comissao, 0) as diferenca,
         case when coalesce(d.comissao, 0) = 0 then null
              else round(((coalesce(n.calculada, 0) - d.comissao) / d.comissao * 100)::numeric, 2)
         end as diferenca_pct,
         coalesce(n.operacoes, 0) as operacoes,
         coalesce(d.contratos, 0) as contratos_deriv,
         coalesce(n.clientes, 0) as clientes,
         coalesce(h.so_demo, true) as so_demo
  from nosso n
  full outer join deriv d on d.dia = n.dia
  full outer join havia h on h.dia = coalesce(n.dia, d.dia)
  where public.teeds_sou_admin()
  order by 1 desc;
$$;

grant execute on function public.teeds_comissao_conferencia(integer, text, text) to authenticated;
