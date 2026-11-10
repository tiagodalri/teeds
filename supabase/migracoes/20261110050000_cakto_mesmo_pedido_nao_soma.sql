-- 10/11/2026 (aplicada em produção pelo MCP antes de entrar no repo):
-- a Cakto manda dois eventos que liberam para a MESMA compra
-- (purchase_approved e subscription_created, no mesmo minuto). Cada um somava
-- 1 ano + 5 dias ao acesso: a primeira venda Prestige da live de 09/11 ficou
-- com 2 anos. Agora, se o mesmo pedido já liberou nas últimas 24 h, o evento
-- novo só fica registrado ('mesmo-pedido') e repete a validade já dada.
-- Renovação de verdade (um ano depois) continua somando.
create or replace function public.teeds_cakto_aplicar(p_pedido text, p_evento text, p_marca text, p_email text, p_produto text default null::text, p_valor numeric default null::numeric)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_email   text := lower(trim(p_email));
  v_prod    text := lower(trim(coalesce(p_produto, '')));
  v_user    uuid;
  v_acao    text;
  v_libera  boolean;
  v_revoga  boolean;
  v_novo    integer;
  v_atual   timestamptz;
  v_expira  timestamptz;
  v_mesmo   timestamptz;
  v_vitalicio boolean := exists (select 1 from public.cakto_produtos cp where cp.produto = v_prod and cp.vitalicio);
begin
  if coalesce(v_email, '') = '' or coalesce(p_pedido, '') = '' then
    return json_build_object('erro', 'pedido e e-mail são obrigatórios');
  end if;
  if v_prod not in ('gf-gulf', 'gf-phenom', 'gf-pack', 'gf-black', 'gf-prestige')
     and not exists (select 1 from public.cakto_produtos cp where cp.produto = v_prod) then
    return json_build_object('erro', 'produto desconhecido: ' || v_prod);
  end if;

  v_libera := p_evento in ('purchase_approved', 'subscription_created',
                           'subscription_renewed', 'subscription_resumed',
                           'subscription_late_recovered', 'paid', 'approved');
  v_revoga := p_evento in ('refund', 'chargeback', 'refunded', 'chargedback');
  v_acao := case when v_libera then 'liberou' when v_revoga then 'revogou' else 'ignorou' end;

  select c.user_id into v_user
  from public.clientes c
  where c.marca = p_marca and lower(c.email) = v_email
  limit 1;

  if v_libera and v_user is not null and not v_vitalicio then
    -- a mesma compra já liberou há pouco (outro evento do mesmo pedido): não soma de novo
    select max(cc.expira_em) into v_mesmo
    from public.compras_cakto cc
    where cc.pedido = p_pedido and cc.evento <> p_evento and cc.produto = v_prod
      and cc.acao in ('liberou', 'renovou', 'mesmo-pedido') and cc.expira_em is not null
      and cc.recebido_em > now() - interval '1 day';
    if v_mesmo is not null then
      v_expira := v_mesmo;
      v_acao := 'mesmo-pedido';
    else
      select max(cp.expira_em) into v_atual
      from public.cliente_produtos cp
      where cp.user_id = v_user and cp.marca = p_marca and cp.produto_id = v_prod and cp.ativo;
      v_expira := greatest(coalesce(v_atual, now()), now()) + interval '1 year' + interval '5 days';
      if v_atual is not null then v_acao := 'renovou'; end if;
    end if;
  end if;

  insert into public.compras_cakto (pedido, evento, marca, email, produto, valor, user_id, acao, expira_em)
  values (p_pedido, p_evento, p_marca, v_email, v_prod, p_valor, v_user,
          case when v_user is null and v_libera then 'sem-cadastro' when v_user is null and v_revoga then 'sem-cadastro-revogou' else v_acao end, v_expira)
  on conflict (pedido, evento) do nothing;
  get diagnostics v_novo = row_count;
  if v_novo = 0 then
    return json_build_object('repetido', true, 'acao', 'nada', 'achou', v_user is not null);
  end if;

  if v_user is null then
    return json_build_object('repetido', false, 'achou', false, 'acao', 'sem-cadastro');
  end if;

  if v_libera then
    insert into public.cliente_produtos (user_id, produto_id, marca, ativo, origem, concedido_em, expira_em)
    values (v_user, v_prod, p_marca, true, 'cakto', now(), v_expira)
    on conflict (user_id, produto_id, marca)
      do update set ativo = true, expira_em = excluded.expira_em, concedido_em = now(), origem = 'cakto';
  elsif v_revoga then
    update public.cliente_produtos
       set ativo = false
     where user_id = v_user and marca = p_marca and produto_id = v_prod;
  end if;

  return json_build_object('repetido', false, 'achou', true, 'user_id', v_user,
                           'acao', v_acao, 'produto', v_prod, 'expira_em', v_expira);
end;
$function$;

-- a venda Prestige da live (pedido b4ddd568…): volta para 1 ano + 5 dias, como o primeiro evento deu
update public.cliente_produtos cp
   set expira_em = c.expira_em
  from public.compras_cakto c
 where c.pedido = 'b4ddd568-34f1-4c7b-9eb6-206eb89376ac' and c.evento = 'purchase_approved'
   and cp.user_id = c.user_id and cp.marca = c.marca and cp.produto_id = c.produto
   and cp.expira_em = '2028-11-20 01:57:41.794389+00';
update public.compras_cakto c
   set acao = 'mesmo-pedido', expira_em = p.expira_em
  from public.compras_cakto p
 where c.pedido = 'b4ddd568-34f1-4c7b-9eb6-206eb89376ac' and c.evento = 'subscription_created'
   and p.pedido = c.pedido and p.evento = 'purchase_approved';
