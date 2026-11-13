-- 13/11/2026: "Comissão calculada" de Resultados por cliente igual à da tela Comissões
-- (operação por operação, I.A. + manuais, sem a equipe, dia de Brasília). Ver o comentário no corpo.
-- APLICAR SÓ DEPOIS de conferir que a versão no banco é a de 20261028210000 (pg_get_functiondef).
create or replace function public.teeds_relatorio_clientes_por_conta(p_dias integer default 30, p_marca text default 'teeds')
returns table(user_id uuid, nome text, email text, contas_reais bigint, contas_demo bigint, operacoes_real bigint, operacoes_demo bigint, entradas_real numeric, entradas_demo numeric, pagamentos_real numeric, pagamentos_demo numeric, resultado_real numeric, resultado_demo numeric, comissao_real numeric, comissao_demo numeric, dias_com_dados bigint, dias_sem_resultado bigint, operacoes_robos_real bigint, operacoes_robos_demo bigint, resultado_robos_real numeric, resultado_robos_demo numeric, markup_robos_real numeric, markup_robos_demo numeric, ultimo_dia_real date, ultimo_dia_demo date, visto_em timestamptz)
language plpgsql stable set search_path to 'public' as $$
declare
  v_marcas text[] := public.teeds_marcas_em_foco(p_marca);
  v_corte date := (current_date - greatest(0, least(coalesce(p_dias, 30), 3650) - 1))::date;
  -- a comissão conta pelo dia de Brasília, como a tela Comissões (13/11/2026)
  v_ini timestamptz := ((((now() at time zone 'America/Sao_Paulo')::date - greatest(0, least(coalesce(p_dias, 30), 3650) - 1))::timestamp) at time zone 'America/Sao_Paulo');
begin
  return query
  with diario as (
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
           count(*) filter (where k.operacoes > 0 and k.atualizado_em < timestamptz '2026-09-04 00:00:00+00') as dias_sem_resultado,
           max(k.dia) filter (where not k.demo and k.operacoes > 0) as ultimo_dia_real,
           max(k.dia) filter (where k.demo and k.operacoes > 0)     as ultimo_dia_demo
    from public.comissoes_diarias k
    where k.marca = any(v_marcas) and k.dia >= v_corte
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
    from public.operacoes_robos o
    where o.marca = any(v_marcas) and o.executada_em >= v_corte::timestamptz
    group by o.user_id
  ),
  -- 13/11/2026 (Tiago: "a comissão calculada não está batendo com a comissão certa"): a comissão
  -- passa a ser a mesma da tela Comissões — operação por operação, I.A. + manuais, cada contrato
  -- uma vez só, dia de Brasília. A de comissoes_diarias dependia do extrato da Deriv para saber o
  -- app de cada contrato e deixava as manuais de fora quando ele falhava.
  ops as (
    select distinct on (x.contract_id) x.* from (
      select 'ia'::text as origem, o.contract_id, o.user_id as uid, o.demo, coalesce(o.markup, 0) as mk
        from public.operacoes_robos o
       where o.marca = any(v_marcas) and o.executada_em >= v_ini
      union all
      select 'manual', m.contract_id, m.user_id, m.demo, coalesce(m.markup, 0)
        from public.operacoes_manuais m
       where m.marca = any(v_marcas) and m.comprada_em >= v_ini and coalesce(m.pagamento, 0) > 0
    ) x
    order by x.contract_id, x.origem
  ),
  mk as (
    select ops.uid,
           coalesce(sum(ops.mk) filter (where not ops.demo), 0) as real,
           coalesce(sum(ops.mk) filter (where ops.demo), 0)     as demo
    from ops group by ops.uid
  )
  select c.user_id, c.nome, c.email,
         coalesce(d.contas_reais, 0), coalesce(d.contas_demo, 0),
         coalesce(d.operacoes_real, 0)::bigint, coalesce(d.operacoes_demo, 0)::bigint,
         coalesce(d.entradas_real, 0), coalesce(d.entradas_demo, 0),
         coalesce(d.pagamentos_real, 0), coalesce(d.pagamentos_demo, 0),
         coalesce(d.resultado_real, 0), coalesce(d.resultado_demo, 0),
         coalesce(k.real, 0), coalesce(k.demo, 0),
         coalesce(d.dias_com_dados, 0), coalesce(d.dias_sem_resultado, 0),
         coalesce(r.operacoes_real, 0), coalesce(r.operacoes_demo, 0),
         coalesce(r.resultado_real, 0), coalesce(r.resultado_demo, 0),
         coalesce(r.markup_real, 0), coalesce(r.markup_demo, 0),
         d.ultimo_dia_real, d.ultimo_dia_demo, c.visto_em
  from public.clientes c
  left join diario d on d.user_id = c.user_id
  left join robos  r on r.user_id = c.user_id
  left join mk     k on k.uid = c.user_id
  where c.marca = any(v_marcas)
    -- a equipe fora, como na tela Comissões
    and not exists (select 1 from public.administradores a where a.user_id = c.user_id)
  order by coalesce(k.real, 0) desc,
           coalesce(d.operacoes_real, 0) desc,
           coalesce(k.demo, 0) desc,
           coalesce(d.operacoes_demo, 0) desc;
end $$;
