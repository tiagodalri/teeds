-- Financeiro: o markup passa a ser a MESMA contagem da plataforma (12/11/2026, Tiago: "a Deriv já mostra 1729...
-- a comissão mostrada na plataforma tá certinha... além das IAs temos as operações manuais").
-- A versão anterior somava comissoes_diarias, que só vê o que o robô registrou (I.A.): ficava sem a operação
-- manual (US$ 268 em nov). Agora usa teeds_markup_dias por parceiro (I.A. + manual, conta real), a mesma da
-- Visão geral e da aba Comissões. Conferido em 12/11: plataforma US$ 1.770,79 x Deriv US$ 1.729 (atrasada ~1 h).
-- O resto da função (Cakto, contas, categorias) não muda.

create or replace function public.fin_sincronizar_receitas_agora(p_marca text, p_cotacao numeric default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_cot numeric;
  v_cat_vendas uuid; v_cat_markup uuid; v_cat_reemb uuid;
  v_conta_naor uuid; v_conta_victor uuid; v_conta_deriv uuid;
  v_cakto int := 0; v_markup int := 0; n int;
begin
  -- cotação: a que a tela mandou (guardada para o dia) ou a última guardada
  if p_cotacao is not null and p_cotacao between 1 and 50 then
    insert into public.fin_cotacoes (dia, usd_brl) values (v_hoje, p_cotacao)
    on conflict (dia) do update set usd_brl = excluded.usd_brl, atualizado_em = now();
  end if;
  select usd_brl into v_cot from public.fin_cotacoes order by dia desc limit 1;

  -- categorias e contas que a sincronia usa (criadas uma vez; depois podem ser renomeadas à vontade)
  select id into v_cat_vendas from public.fin_categorias where marca = p_marca and tipo = 'entrada' and nome = 'Vendas de planos' limit 1;
  if v_cat_vendas is null then insert into public.fin_categorias (marca, tipo, nome, cor, ordem) values (p_marca, 'entrada', 'Vendas de planos', '#B78D39', 2) returning id into v_cat_vendas; end if;
  select id into v_cat_markup from public.fin_categorias where marca = p_marca and tipo = 'entrada' and nome = 'Markup da Deriv' limit 1;
  if v_cat_markup is null then insert into public.fin_categorias (marca, tipo, nome, cor, ordem) values (p_marca, 'entrada', 'Markup da Deriv', '#0B9E4A', 1) returning id into v_cat_markup; end if;
  select id into v_cat_reemb from public.fin_categorias where marca = p_marca and tipo = 'saida' and nome = 'Reembolsos de vendas' limit 1;
  if v_cat_reemb is null then insert into public.fin_categorias (marca, tipo, nome, cor, ordem) values (p_marca, 'saida', 'Reembolsos de vendas', '#E11D48', 10) returning id into v_cat_reemb; end if;

  select id into v_conta_naor from public.fin_contas where marca = p_marca and nome = 'Cakto Naor' limit 1;
  if v_conta_naor is null then insert into public.fin_contas (marca, nome, tipo, cor, ordem) values (p_marca, 'Cakto Naor', 'plataforma', '#0E8C9B', 3) returning id into v_conta_naor; end if;
  select id into v_conta_victor from public.fin_contas where marca = p_marca and nome = 'Cakto Victor' limit 1;
  if v_conta_victor is null then insert into public.fin_contas (marca, nome, tipo, cor, ordem) values (p_marca, 'Cakto Victor', 'plataforma', '#B78D39', 4) returning id into v_conta_victor; end if;
  select id into v_conta_deriv from public.fin_contas where marca = p_marca and nome = 'Deriv · markup' limit 1;
  if v_conta_deriv is null then insert into public.fin_contas (marca, nome, tipo, cor, ordem) values (p_marca, 'Deriv · markup', 'plataforma', '#DC1F2E', 5) returning id into v_conta_deriv; end if;

  -- ── Cakto ──────────────────────────────────────────────────────────────────────────────────────
  create temp table if not exists _fin_cakto (origem text, origem_id text, tipo text, descricao text, valor numeric, dia date,
    conta uuid, projeto uuid, contraparte text) on commit drop;
  truncate _fin_cakto;

  with ev as (
    select cc.*, (cc.recebido_em at time zone 'America/Sao_Paulo')::date as dia
      from public.compras_cakto cc where cc.marca = p_marca
  ), ped as (
    select e.pedido,
           max(e.valor) as valor,
           (array_agg(e.produto order by e.recebido_em))[1] as produto,
           (array_agg(e.user_id order by e.recebido_em) filter (where e.user_id is not null))[1] as user_id,
           (array_agg(e.email order by e.recebido_em))[1] as email,
           min(e.dia) filter (where e.evento in ('purchase_approved', 'paid', 'approved', 'subscription_created')) as aprovado,
           min(e.dia) filter (where e.evento in ('refund', 'refunded', 'chargeback', 'chargedback')) as reembolso,
           bool_or(e.evento in ('chargeback', 'chargedback')) as chargeback
      from ev e group by e.pedido
  ), base as (
    select p.*, c.nome as cliente, c.parceiro,
           coalesce(pr.nome, p.produto) as produto_nome,
           case when c.parceiro = 'n' then v_conta_naor else v_conta_victor end as conta,
           (select fp.id from public.fin_projetos fp where fp.marca = p_marca and fp.parceiro = c.parceiro and fp.ativo order by fp.ordem limit 1) as projeto
      from ped p
      left join public.clientes c on c.user_id = p.user_id and c.marca = p_marca
      left join public.produtos pr on pr.id = p.produto
  )
  insert into _fin_cakto
  -- a compra
  select 'cakto', b.pedido, 'receita', 'Cakto · ' || b.produto_nome || ' — ' || coalesce(b.cliente, b.email, 'cliente'),
         b.valor, b.aprovado, b.conta, b.projeto, coalesce(b.cliente, b.email)
    from base b where b.aprovado is not null and coalesce(b.valor, 0) > 0
  union all
  -- cada renovação do mesmo pedido (um ano depois a Cakto manda subscription_renewed no mesmo pedido)
  select 'cakto', b.pedido || ':renovou:' || r.dia, 'receita', 'Cakto · renovação ' || b.produto_nome || ' — ' || coalesce(b.cliente, b.email, 'cliente'),
         coalesce(r.valor, b.valor), r.dia, b.conta, b.projeto, coalesce(b.cliente, b.email)
    from base b join (select distinct on (pedido, dia) pedido, dia, valor from ev where evento = 'subscription_renewed' order by pedido, dia, recebido_em) r on r.pedido = b.pedido
   where r.dia > b.aprovado and coalesce(r.valor, b.valor, 0) > 0
  union all
  -- reembolso / chargeback: sai na data em que aconteceu
  select 'cakto-reembolso', b.pedido, 'despesa',
         case when b.chargeback then 'Chargeback Cakto · ' else 'Reembolso Cakto · ' end || b.produto_nome || ' — ' || coalesce(b.cliente, b.email, 'cliente'),
         b.valor, b.reembolso, b.conta, b.projeto, coalesce(b.cliente, b.email)
    from base b where b.aprovado is not null and b.reembolso is not null and coalesce(b.valor, 0) > 0;

  insert into public.fin_lancamentos (marca, tipo, descricao, valor, vencimento, pago_em, categoria_id, conta_id, projeto_id,
                                      contraparte, forma, origem, origem_id, anexos, pago_fora)
  select p_marca, x.tipo, x.descricao, x.valor, x.dia, x.dia,
         case when x.tipo = 'receita' then v_cat_vendas else v_cat_reemb end, x.conta, x.projeto,
         x.contraparte, 'Plataforma', x.origem, x.origem_id, '[]'::jsonb, false
    from _fin_cakto x
  on conflict (marca, origem, origem_id) where origem is not null do update
     set valor = excluded.valor, vencimento = excluded.vencimento, pago_em = excluded.pago_em
   where (fin_lancamentos.valor, fin_lancamentos.vencimento, fin_lancamentos.pago_em) is distinct from (excluded.valor, excluded.vencimento, excluded.pago_em);
  get diagnostics n = row_count;
  v_cakto := n;

  -- ── Markup da Deriv ────────────────────────────────────────────────────────────────────────────
  if v_cot is not null then
    with par as (
      -- cada parceiro da marca e os diretos (sem parceiro)
      select pa.codigo from public.parceiros pa where pa.marca = p_marca
      union select 'direto'
    ), mes as (
      -- a mesma contagem da plataforma (Visão geral, Comissões): teeds_markup_dias, operação por operação,
      -- I.A. e manual, conta real. Por parceiro, desde out/2026, até hoje.
      select date_trunc('month', x.dia)::date as mes, nullif(par.codigo, 'direto') as parceiro,
             sum(x.markup) as usd, sum(x.ia_markup) as ia, sum(x.manual_markup) as manual, max(x.dia) as ultimo
        from par, lateral public.teeds_markup_dias(array[p_marca], par.codigo, date '2026-10-01', v_hoje) x
       group by 1, 2
    )
    insert into public.fin_lancamentos (marca, tipo, descricao, valor, vencimento, pago_em, categoria_id, conta_id, projeto_id,
                                        contraparte, forma, observacoes, origem, origem_id, anexos, pago_fora)
    select p_marca, 'receita',
           'Markup Deriv · ' || to_char(m.mes, 'MM/YYYY') || ' — ' || coalesce(pa.nome, 'sem parceiro'),
           round(m.usd * v_cot, 2), m.ultimo, m.ultimo, v_cat_markup, v_conta_deriv,
           (select fp.id from public.fin_projetos fp where fp.marca = p_marca and fp.parceiro = m.parceiro and fp.ativo order by fp.ordem limit 1),
           'Deriv', 'Plataforma',
           'US$ ' || replace(round(m.usd, 2)::text, '.', ',') || ' (I.A. US$ ' || replace(round(m.ia, 2)::text, '.', ',')
             || ' + manual US$ ' || replace(round(m.manual, 2)::text, '.', ',') || ') × R$ ' || replace(round(v_cot, 4)::text, '.', ',')
             || ' — a mesma contagem do markup da plataforma (conta real)',
           'markup-deriv', to_char(m.mes, 'YYYY-MM') || ':' || coalesce(m.parceiro, 'geral'), '[]'::jsonb, false
      from mes m left join public.parceiros pa on pa.marca = p_marca and pa.codigo = m.parceiro
     where round(m.usd * v_cot, 2) > 0
    on conflict (marca, origem, origem_id) where origem is not null do update
       set valor = excluded.valor, vencimento = excluded.vencimento, pago_em = excluded.pago_em, observacoes = excluded.observacoes
     -- mês fechado há mais de 5 dias: congela (valor e cotação de quando fechou)
     where (date_trunc('month', fin_lancamentos.vencimento) + interval '1 month' + interval '5 days')::date > v_hoje
       and (fin_lancamentos.valor, fin_lancamentos.vencimento) is distinct from (excluded.valor, excluded.vencimento);
    get diagnostics n = row_count;
    v_markup := n;
  end if;

  return json_build_object('cakto', v_cakto, 'markup', v_markup, 'cotacao', v_cot);
end $$;

-- os lançamentos de markup da versão anterior (só comissoes_diarias, sem a manual) saem e voltam pela conta nova
delete from public.fin_lancamentos where origem = 'markup-deriv';
