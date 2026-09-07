-- "Quanto a OMNI rendeu esse mês?"
--
-- Até aqui a comissão vinha de comissoes_diarias, que só é escrita quando
-- alguém ABRE a tela de Gestão. Por isso ela congelou em 3 de setembro
-- enquanto as operações continuavam entrando: ninguém abriu a tela.
--
-- Esta função não depende de ninguém abrir nada. Ela soma direto de
-- operacoes_robos, que o servidor escreve a cada operação liquidada, em
-- tempo real. O markup é 3% do pagamento — a mesma conta que a Deriv faz.
--
-- SECURITY INVOKER de propósito: as regras de acesso do usuário conectado
-- continuam valendo, então um cliente só soma o que é dele e o admin soma
-- o que a política de admin deixa ver.
create or replace function public.teeds_comissao_por_marca(p_dias integer default 30)
returns table (
  marca text,
  dia date,
  operacoes bigint,
  movimentado numeric,
  pagamentos numeric,
  comissao numeric,
  clientes bigint,
  demo boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    o.marca,
    (o.executada_em at time zone 'UTC')::date as dia,
    count(*)                       as operacoes,
    sum(o.entrada)                 as movimentado,
    sum(o.pagamento)               as pagamentos,
    sum(coalesce(o.markup, o.pagamento * 0.03)) as comissao,
    count(distinct o.user_id)      as clientes,
    o.demo
  from public.operacoes_robos o
  where o.executada_em >= (now() - make_interval(days => greatest(p_dias, 1)))
  group by o.marca, (o.executada_em at time zone 'UTC')::date, o.demo
  order by dia desc, o.marca;
$$;

grant execute on function public.teeds_comissao_por_marca(integer) to authenticated;
