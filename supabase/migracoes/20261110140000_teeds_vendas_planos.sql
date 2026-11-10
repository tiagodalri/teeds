-- Vendas dos planos (10/11/2026), aplicada no banco por MCP. Ver o corpo atual com
--   select pg_get_functiondef('public.teeds_vendas_planos'::regproc);
-- Cada pedido de compras_cakto agrupado (situação pelos eventos, conta da Cakto pelo parceiro do
-- cliente: /n = Naor, os outros = Victor, igual a subplanos.checkout_por_parceiro), mais os
-- assinantes ativos de gf-black/gf-prestige e o tamanho da base. security definer com
-- teeds_admin_pleno_da + teeds_parceiro_forcado; administradores fora dos assinantes.

create or replace function public.teeds_vendas_planos(p_marca text, p_parceiro text default null)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_par text;
begin
  if not public.teeds_admin_pleno_da(p_marca) then raise exception 'Só a administração vê as vendas'; end if;
  v_par := nullif(trim(coalesce(public.teeds_parceiro_forcado(p_marca), p_parceiro, '')), '');

  return jsonb_build_object(
    'agora', now(),
    'parceiro', v_par,
    'precos', (select coalesce(jsonb_object_agg('gf-' || s.id, s.preco), '{}'::jsonb) from public.subplanos s where s.marca = p_marca),
    'pedidos', (select coalesce(jsonb_agg(x order by x.primeiro desc), '[]'::jsonb) from (
      select cc.pedido,
             min(cc.recebido_em) as primeiro, max(cc.recebido_em) as ultimo,
             (array_agg(cc.produto order by cc.recebido_em))[1] as produto,
             coalesce(pr.nome, (array_agg(cc.produto order by cc.recebido_em))[1]) as produto_nome,
             max(cc.valor) as valor,
             (array_agg(cc.email order by cc.recebido_em))[1] as email,
             (array_agg(cc.user_id order by cc.recebido_em) filter (where cc.user_id is not null))[1] as user_id,
             jsonb_agg(jsonb_build_object('evento', cc.evento, 'acao', cc.acao, 'em', cc.recebido_em) order by cc.recebido_em) as eventos,
             max(cc.expira_em) as expira_em,
             bool_or(cc.evento in ('refund', 'refunded')) as reembolsada,
             bool_or(cc.evento in ('chargeback', 'chargedback')) as chargeback,
             bool_or(cc.evento in ('purchase_approved', 'paid', 'approved', 'subscription_created', 'subscription_renewed', 'subscription_resumed', 'subscription_late_recovered')) as aprovada,
             bool_or(cc.evento in ('subscription_renewed')) as renovada,
             bool_or(cc.evento in ('subscription_canceled', 'subscription_cancelled')) as cancelou_renovacao,
             bool_or(cc.evento in ('purchase_refused', 'refused')) as recusada,
             bool_or(cc.evento in ('pix_gerado', 'boleto_gerado', 'picpay_gerado', 'openfinance_nubank_gerado', 'waiting_payment')) as aguardando,
             bool_or(cc.evento in ('checkout_abandonment', 'initiate_checkout')) as abandono,
             min(c.nome) as nome, min(c.parceiro) as parceiro, min(pa.nome) as parceiro_nome,
             bool_or(c.user_id is not null) as tem_cadastro,
             case when min(c.parceiro) = 'n' then 'naor' when bool_or(c.user_id is not null) then 'victor' else null end as conta,
             bool_or(exists (select 1 from public.cliente_produtos cp where cp.user_id = c.user_id and cp.marca = p_marca
                     and cp.produto_id = cc.produto and cp.ativo and (cp.expira_em is null or cp.expira_em > now()))) as acesso_ativo
        from public.compras_cakto cc
        left join public.clientes c on c.user_id = cc.user_id and c.marca = cc.marca
        left join public.parceiros pa on pa.marca = cc.marca and pa.codigo = c.parceiro
        left join public.produtos pr on pr.id = cc.produto
       where cc.marca = p_marca
         and (v_par is null
              or (v_par = 'direto' and c.user_id is not null and c.parceiro is null)
              or c.parceiro = v_par)
       group by cc.pedido, pr.nome
       order by min(cc.recebido_em) desc
       limit 5000) x),
    'assinantes', (select coalesce(jsonb_object_agg(t.produto_id, t.n), '{}'::jsonb) from (
      select cp.produto_id, count(distinct cp.user_id) n
        from public.cliente_produtos cp join public.clientes c on c.user_id = cp.user_id and c.marca = cp.marca
       where cp.marca = p_marca and cp.ativo and (cp.expira_em is null or cp.expira_em > now())
         and cp.produto_id in ('gf-black', 'gf-prestige')
         and not exists (select 1 from public.administradores a where a.user_id = cp.user_id)
         and (v_par is null or (v_par = 'direto' and c.parceiro is null) or c.parceiro = v_par)
       group by 1) t),
    'base', (select count(*) from public.clientes c where c.marca = p_marca
         and not exists (select 1 from public.administradores a where a.user_id = c.user_id)
         and (v_par is null or (v_par = 'direto' and c.parceiro is null) or c.parceiro = v_par))
  );
end $function$;
revoke all on function public.teeds_vendas_planos(text, text) from public, anon;
grant execute on function public.teeds_vendas_planos(text, text) to authenticated;
