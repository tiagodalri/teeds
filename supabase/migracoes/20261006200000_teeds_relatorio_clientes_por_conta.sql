-- Resultados por cliente com conta real e demonstração SEPARADAS.
--
-- A função antiga (`teeds_relatorio_clientes`) recebia um booleano
-- `p_incluir_demo` e devolvia UM número por coluna. Com o booleano ligado —
-- que era o padrão da tela — dinheiro de verdade e dinheiro de mentira
-- entravam na mesma soma. O resultado: a "Comissão calculada" anunciava
-- US$ 23.547,45 quando só US$ 25,38 existiam de fato. O destaque da tela era
-- 99,9% ficção (Tiago, 06/10/2026).
--
-- Somar demo com real não é um filtro mal escolhido: é uma conta errada.
-- US$ 1 de demonstração não vale US$ 1. Então aqui a separação deixa de ser
-- opção e passa a ser estrutura: cada medida volta em duas colunas, `_real` e
-- `_demo`, e quem monta a tela decide o que mostrar — sem poder somar as duas
-- por descuido, porque não existe mais uma coluna "total" para isso.
--
-- `contas` continua inteira porque contar contas é legítimo nos dois mundos;
-- ainda assim vem separada, pela mesma razão.
--
-- Invoker (sem `security definer`), como a função antiga: quem chama é o
-- administrador com o próprio crachá, e as políticas de `comissoes_diarias`,
-- `operacoes_robos` e `clientes` já exigem `teeds_sou_admin_da(marca)`.
-- Trocar para `definer` aqui só aumentaria a superfície sem ganhar nada.

create or replace function public.teeds_relatorio_clientes_por_conta(
  p_dias  integer default 30,
  p_marca text default 'teeds'
) returns table (
  user_id uuid, nome text, email text,
  contas_reais bigint, contas_demo bigint,
  operacoes_real bigint, operacoes_demo bigint,
  entradas_real numeric, entradas_demo numeric,
  pagamentos_real numeric, pagamentos_demo numeric,
  resultado_real numeric, resultado_demo numeric,
  comissao_real numeric, comissao_demo numeric,
  dias_com_dados bigint, dias_sem_resultado bigint,
  operacoes_robos_real bigint, operacoes_robos_demo bigint,
  resultado_robos_real numeric, resultado_robos_demo numeric,
  markup_robos_real numeric, markup_robos_demo numeric,
  ultimo_dia_real date, ultimo_dia_demo date,
  visto_em timestamptz
)
language sql stable set search_path to 'public' as $function$
  with marcas as (select public.teeds_marcas_em_foco(p_marca) as lista),
  janela as (
    select (current_date - greatest(0, least(coalesce(p_dias, 30), 3650) - 1))::date as corte
  ),
  diario as (
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
           -- Dias gravados pela varredura antiga, que só conhecia a comissão.
           count(*) filter (where k.operacoes > 0 and k.atualizado_em < timestamptz '2026-09-04 00:00:00+00') as dias_sem_resultado,
           max(k.dia) filter (where not k.demo and k.operacoes > 0) as ultimo_dia_real,
           max(k.dia) filter (where k.demo and k.operacoes > 0)     as ultimo_dia_demo
    from public.comissoes_diarias k, janela j, marcas m
    where k.marca = any(m.lista) and k.dia >= j.corte
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
    from public.operacoes_robos o, janela j, marcas m
    where o.marca = any(m.lista) and o.executada_em >= j.corte::timestamptz
    group by o.user_id
  )
  select c.user_id, c.nome, c.email,
         coalesce(d.contas_reais, 0), coalesce(d.contas_demo, 0),
         coalesce(d.operacoes_real, 0), coalesce(d.operacoes_demo, 0),
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
  where c.marca = any(public.teeds_marcas_em_foco(p_marca))
  -- Ordena pelo que é dinheiro de verdade. A lista é cortada em 1000 linhas
  -- pelo PostgREST, então a ordem decide quem sobrevive ao corte: quem gera
  -- comissão real primeiro, depois quem opera.
  order by coalesce(d.comissao_real, 0) desc,
           coalesce(d.operacoes_real, 0) desc,
           coalesce(d.comissao_demo, 0) desc,
           coalesce(d.operacoes_demo, 0) desc;
$function$;

comment on function public.teeds_relatorio_clientes_por_conta(integer, text) is
  'Resultados por cliente com real e demonstração em colunas separadas. Nunca somados.';

revoke all on function public.teeds_relatorio_clientes_por_conta(integer, text) from public, anon;
grant execute on function public.teeds_relatorio_clientes_por_conta(integer, text) to authenticated;
