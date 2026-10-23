-- A compra dos robôs avulsos da GlobalFly na Cakto libera o acesso sozinha.
--
-- Gulf (gf-gulf), Phenom (gf-phenom) e o Pack (gf-pack) são vendidos como
-- ASSINATURA ANUAL na Cakto. Quando o pagamento é confirmado, a Cakto chama o
-- gancho (servidor/src/cakto.ts) e o acesso é ligado na conta do cliente, por
-- 1 ano. A cada renovação paga, soma mais 1 ano. Estorno e chargeback tiram o
-- acesso na hora; o cancelamento NÃO tira — a pessoa fica com o que já pagou
-- até o fim do ano (Tiago, 23/10/2026).
--
-- Mesma espinha da Kiwify (teeds_kiwify_aplicar): acha o cliente pelo e-mail,
-- é idempotente pela chave (pedido, evento) e devolve o que fez para o log do
-- servidor. A diferença é que aqui o acesso é por PRODUTO em cliente_produtos
-- (não o plano), com validade, e o Pack libera os dois robôs porque
-- teeds_robo_liberado já trata 'gf-pack' como as duas I.A.

create table if not exists public.compras_cakto (
  pedido        text        not null,
  evento        text        not null,
  marca         text        not null,
  email         text        not null,
  produto       text,                     -- gf-gulf | gf-phenom | gf-pack
  valor         numeric(12,2),
  user_id       uuid,                      -- nulo = pagou com e-mail sem cadastro
  acao          text        not null,      -- liberou | renovou | revogou | ignorou | sem-cadastro
  expira_em     timestamptz,               -- a validade gravada nesta aplicação
  recebido_em   timestamptz not null default now(),
  primary key (pedido, evento)
);

comment on table public.compras_cakto is
  'Avisos de compra da Cakto (robôs avulsos GlobalFly), um por (pedido, evento). Histórico e trava de repetição.';

create index if not exists compras_cakto_email_idx on public.compras_cakto (marca, lower(email));
create index if not exists compras_cakto_quando_idx on public.compras_cakto (recebido_em desc);

alter table public.compras_cakto enable row level security;
-- Sem política de leitura: só a chave de serviço e esta função security definer.

create or replace function public.teeds_cakto_aplicar(
  p_pedido  text,
  p_evento  text,
  p_marca   text,
  p_email   text,
  p_produto text default null,
  p_valor   numeric default null
) returns json
language plpgsql security definer set search_path to 'public' as $function$
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
begin
  if coalesce(v_email, '') = '' or coalesce(p_pedido, '') = '' then
    return json_build_object('erro', 'pedido e e-mail são obrigatórios');
  end if;
  if v_prod not in ('gf-gulf', 'gf-phenom', 'gf-pack') then
    return json_build_object('erro', 'produto desconhecido: ' || v_prod);
  end if;

  -- Libera: compra aprovada, assinatura criada/renovada/retomada/recuperada.
  -- Revoga na hora: estorno e chargeback. Cancelamento e pausa mantêm o acesso
  -- até o fim do que já foi pago (não entram aqui como revogação).
  v_libera := p_evento in ('purchase_approved', 'subscription_created',
                           'subscription_renewed', 'subscription_resumed',
                           'subscription_late_recovered', 'paid', 'approved');
  v_revoga := p_evento in ('refund', 'chargeback', 'refunded', 'chargedback');
  v_acao := case when v_libera then 'liberou' when v_revoga then 'revogou' else 'ignorou' end;

  select c.user_id into v_user
  from public.clientes c
  where c.marca = p_marca and lower(c.email) = v_email
  limit 1;

  -- Validade: estende a partir da maior data entre a atual e agora, +1 ano
  -- (com uma folga de alguns dias para a renovação não deixar buraco).
  if v_libera and v_user is not null then
    select max(cp.expira_em) into v_atual
    from public.cliente_produtos cp
    where cp.user_id = v_user and cp.marca = p_marca and cp.produto_id = v_prod and cp.ativo;
    v_expira := greatest(coalesce(v_atual, now()), now()) + interval '1 year' + interval '5 days';
    if v_atual is not null then v_acao := 'renovou'; end if;
  end if;

  -- Trava de repetição: (pedido, evento) só entra uma vez.
  insert into public.compras_cakto (pedido, evento, marca, email, produto, valor, user_id, acao, expira_em)
  values (p_pedido, p_evento, p_marca, v_email, v_prod, p_valor, v_user, v_acao, v_expira)
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

revoke all on function public.teeds_cakto_aplicar(text, text, text, text, text, numeric) from public, anon, authenticated;
