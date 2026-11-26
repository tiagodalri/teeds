-- 26/11/2026 (aplicada no banco pelo painel do Supabase):
--  * teeds_ficha_do_membro(p_marca, p_user): a ficha completa de um membro na live, no mesmo formato
--    da ficha da lateral do WhatsApp do Assessor (servidor/src/ficha-cliente.ts). Só a equipe, no escopo
--    de cada administrador (teeds_sou_equipe_da + teeds_ve_cliente). Markup e resultado reais = só conta real.
--  * teeds_fichas_da_live: os administradores ficam de fora da lista e do markup.
-- A definição completa e atual está no banco: select pg_get_functiondef('public.teeds_ficha_do_membro(text,uuid)'::regprocedure);
-- Resumo do que ela junta: clientes, contas_deriv (saldos), movimentacoes_deriv (depósitos e saques reais),
-- sessoes_robos e operacoes_manuais (resultado real e demo, 30 dias, por I.A.), operacoes_robos + manuais
-- (markup real: total, mês, hoje), aulas_grade + aulas_progresso, transmissoes.presencas (lives na plataforma),
-- acessos_diarios, compras_cakto, cliente_produtos, suporte_conversas e assessor_whatsapp_vinculos.

create or replace function public.teeds_fichas_da_live(p_marca text, p_ids uuid[], p_desde timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.teeds_sou_equipe_da(p_marca) then return '[]'::jsonb; end if;
  with ids as (select distinct u from unnest(coalesce(p_ids, '{}'::uuid[])) u limit 300),
  cli as (
    select c.user_id, c.nome, c.foto_url, c.criado_em, c.acesso_inicio, c.plano_id, c.categoria, c.cidade, c.end_uf, c.regiao
      from public.clientes c join ids on ids.u = c.user_id
     where c.marca = p_marca and public.teeds_ve_cliente(p_marca, c.user_id)
       and not exists (select 1 from public.administradores a where a.user_id = c.user_id)
  ),
  ops as (
    select distinct on (x.user_id, x.contract_id) x.* from (
      select o.user_id, 'ia'::text as origem, o.contract_id, o.executada_em as quando, coalesce(o.markup, 0) as mk
        from public.operacoes_robos o join cli on cli.user_id = o.user_id where o.marca = p_marca and not o.demo
      union all
      select m.user_id, 'manual', m.contract_id, m.comprada_em, coalesce(m.markup, 0)
        from public.operacoes_manuais m join cli on cli.user_id = m.user_id
       where m.marca = p_marca and not m.demo and coalesce(m.pagamento, 0) > 0
    ) x order by x.user_id, x.contract_id, x.origem
  ),
  soma as (
    select user_id, coalesce(sum(mk), 0) as total, coalesce(sum(mk) filter (where quando >= p_desde), 0) as na_live,
           count(*) filter (where quando >= p_desde) as ops_na_live, max(quando) as ultima
      from ops group by user_id
  ),
  saldo as (
    select d.user_id, sum(d.saldo) as saldo, max(d.moeda) as moeda from public.contas_deriv d join cli on cli.user_id = d.user_id
     where d.tipo = 'real' and (d.marca is null or d.marca = p_marca) group by d.user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', cli.user_id, 'nome', cli.nome, 'foto', cli.foto_url, 'desde', coalesce(cli.acesso_inicio, cli.criado_em), 'plano', coalesce(cli.categoria, cli.plano_id),
    'cidade', coalesce(cli.cidade, ''), 'uf', coalesce(cli.end_uf, cli.regiao, ''), 'saldo', saldo.saldo, 'moeda', coalesce(saldo.moeda, 'USD'),
    'markup_total', coalesce(soma.total, 0), 'markup_live', coalesce(soma.na_live, 0), 'ops_live', coalesce(soma.ops_na_live, 0), 'ultima_op', soma.ultima
  )), '[]'::jsonb) into r
  from cli left join soma on soma.user_id = cli.user_id left join saldo on saldo.user_id = cli.user_id;
  return r;
end $$;
