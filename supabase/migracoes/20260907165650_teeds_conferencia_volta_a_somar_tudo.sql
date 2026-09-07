-- Correção de uma troca errada minha.
--
-- Eu tinha reescrito a conferência para somar de `operacoes_robos`. Parecia
-- melhor (é ao vivo), mas mudava o significado em silêncio: aquela tabela
-- tem só operação de ROBÔ. A conferência precisa somar TUDO — robô e
-- operação manual — porque é contra isso que o número da Deriv é comparado:
-- a Deriv reporta o markup do app inteiro.
--
-- Trocar uma pela outra faria o total encolher sem aviso, e pareceria perda
-- de dinheiro onde só havia mudança de fonte.
--
-- Volta a somar de `comissoes_diarias`, agora por marca, e ganha a coluna
-- `so_demo` — que é o que permite a tela distinguir "não houve operação
-- real" de "a Deriv não bate".
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
  -- o nosso número: todas as operações, robô e manual, só conta real
  nosso as (
    select k.dia,
           coalesce(sum(k.comissao), 0) as calculada,
           coalesce(sum(k.operacoes), 0) as operacoes,
           count(distinct k.user_id) as clientes
    from public.comissoes_diarias k, janela j
    where k.marca = p_marca and not k.demo and k.dia >= j.corte
    group by k.dia
  ),
  -- houve algo nesse dia, mesmo que só em demonstração?
  havia as (
    select k.dia, bool_and(k.demo) as so_demo
    from public.comissoes_diarias k, janela j
    where k.marca = p_marca and k.dia >= j.corte
    group by k.dia
  ),
  -- o que a Deriv reporta para a app desta marca
  deriv as (
    select m.dia, m.comissao, m.contratos
    from public.markup_oficial_diario m, janela j
    where m.dia >= j.corte and (p_app_id is null or m.app_id = p_app_id)
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

comment on function public.teeds_comissao_viva(integer, text) is
  'Comissão de ROBÔ, ao vivo, por marca. Não inclui operação manual — para o total, use comissoes_diarias.';
