-- Financeiro puxa sozinho a Cakto e o markup da Deriv (12/11/2026, Tiago: "puxasse as infos da cakto de
-- cada um certinho, do markup gerado também").
--
-- fin_sincronizar_receitas(marca, cotação) é chamada pela tela toda vez que o financeiro abre ou atualiza.
-- Ela grava lançamentos com origem, e o índice único (marca, origem, origem_id) impede duplicar:
--
--   Cakto (origem 'cakto'): uma receita por pagamento aprovado — o pedido, e cada renovação do mesmo pedido.
--     Valor = o que o cliente pagou (bruto, antes da taxa da Cakto). Recebida na data da aprovação,
--     na conta "Cakto Naor" (cliente do /n) ou "Cakto Victor" (todo o resto — a mesma regra de
--     teeds_vendas_planos e do checkout_por_parceiro). Projeto = o do parceiro do cliente.
--     Reembolso ou chargeback vira uma despesa (origem 'cakto-reembolso') na data em que aconteceu.
--
--   Markup (origem 'markup-deriv'): uma receita por mês e por parceiro, somando comissoes_diarias (o servidor
--     mede conta a conta, em todos os apps — o da marca e o de cada parceiro —, só conta real) pelo parceiro
--     do cliente. NÃO usa markup_oficial_diario: ela só tem o app da marca (o Naor e o Douglas têm app próprio)
--     e não é atualizada sozinha. Conferido em 10/11: Victor (app da marca) medido US$ 211,98 x oficial
--     US$ 219,21. Convertido de dólar pela cotação que a tela manda; o mês fechado há mais de 5 dias congela
--     (valor e cotação não mudam mais). Recebida na conta "Deriv · markup", no último dia medido do mês.
--
-- Depois de criado, o lançamento só tem valor e datas atualizados pela sincronia: categoria, projeto,
-- conta e descrição que alguém mudar à mão ficam como a pessoa deixou. Só grava quando algo mudou,
-- para não encher o histórico.

create table if not exists public.fin_cotacoes (
  dia date primary key,
  usd_brl numeric not null check (usd_brl > 0),
  atualizado_em timestamptz not null default now()
);
alter table public.fin_cotacoes enable row level security;
revoke all on public.fin_cotacoes from anon, authenticated;

-- o trabalho em si (sem checar quem pede: só a função de fora, abaixo, e o banco chamam)
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
    with mes as (
      -- o markup que o servidor mede conta a conta (comissoes_diarias, a cada poucos minutos, em todos os apps:
      -- o da marca e o de cada parceiro). Só conta real; o parceiro é o do cliente.
      select date_trunc('month', d.dia)::date as mes, c.parceiro, sum(d.comissao) as usd, max(d.dia) as ultimo
        from public.comissoes_diarias d
        left join public.clientes c on c.user_id = d.user_id and c.marca = d.marca
       where d.marca = p_marca and not d.demo and coalesce(d.moeda, 'USD') = 'USD' and d.comissao > 0
       group by 1, 2
    )
    insert into public.fin_lancamentos (marca, tipo, descricao, valor, vencimento, pago_em, categoria_id, conta_id, projeto_id,
                                        contraparte, forma, observacoes, origem, origem_id, anexos, pago_fora)
    select p_marca, 'receita',
           'Markup Deriv · ' || to_char(m.mes, 'MM/YYYY') || ' — ' || coalesce(pa.nome, 'sem parceiro'),
           round(m.usd * v_cot, 2), m.ultimo, m.ultimo, v_cat_markup, v_conta_deriv,
           (select fp.id from public.fin_projetos fp where fp.marca = p_marca and fp.parceiro = m.parceiro and fp.ativo order by fp.ordem limit 1),
           'Deriv', 'Plataforma',
           'US$ ' || replace(round(m.usd, 2)::text, '.', ',') || ' × R$ ' || replace(round(v_cot, 4)::text, '.', ',')
             || ' (markup medido pelo servidor em cada conta real dos clientes deste parceiro, todos os apps)',
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
revoke all on function public.fin_sincronizar_receitas_agora(text, numeric) from public, anon, authenticated;

-- a que a tela chama: quem lê o financeiro desta marca pode mandar sincronizar (o resultado não depende de quem pede)
create or replace function public.fin_sincronizar_receitas(p_marca text, p_cotacao numeric default null)
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  if not (array[p_marca, '*'] && public.fin_marcas('leitor')) then raise exception 'O financeiro foi bloqueado.' using errcode = '42501'; end if;
  return public.fin_sincronizar_receitas_agora(p_marca, p_cotacao);
end $$;
revoke all on function public.fin_sincronizar_receitas(text, numeric) from public, anon;
grant execute on function public.fin_sincronizar_receitas(text, numeric) to authenticated;
