-- A compra do Simulador na Kiwify libera o acesso sozinha.
--
-- O produto "Simulador de Treinamento Teeds" (R$ 497, pagamento único) vende
-- fora da plataforma. Quem paga precisa achar o simulador ligado na conta dele
-- sem ninguém mexer à mão — e quem pede reembolso precisa perder o acesso pelo
-- mesmo caminho, senão o estorno vira acesso de graça.
--
-- A trava do simulador (teeds_simulador_permitido) exige plano `pro`, acesso
-- `ativo` e validade não vencida. Então é exatamente isso que a liberação
-- escreve, e nada mais: nome, telefone e o resto do cadastro não são tocados.
--
-- GUARDA O PLANO ANTERIOR. Quem já era `vitalicio` e compra o simulador não
-- pode ser rebaixado para `essencial` num eventual estorno — o reembolso
-- devolve a pessoa ao plano em que ela estava, não a um plano inventado.
--
-- A CHAVE É (pedido, evento), e é o que torna o gancho idempotente. A Kiwify
-- repete o aviso quando não recebe 200 na primeira tentativa; sem isso, o
-- mesmo pedido entraria duas vezes no histórico e um estorno repetido poderia
-- rebaixar alguém que já tinha recomprado.

create table if not exists public.compras_kiwify (
  pedido        text        not null,
  evento        text        not null,
  marca         text        not null,
  email         text        not null,
  produto       text,
  valor         numeric(12,2),
  -- Quem foi encontrado no cadastro. Nulo = pagou com um e-mail que não existe
  -- na base; fica registrado para alguém resolver à mão.
  user_id       uuid,
  plano_anterior text,
  acao          text        not null,
  recebido_em   timestamptz not null default now(),
  primary key (pedido, evento)
);

comment on table public.compras_kiwify is
  'Avisos de compra da Kiwify, um por (pedido, evento). Histórico e trava de repetição.';

create index if not exists compras_kiwify_email_idx on public.compras_kiwify (marca, lower(email));
create index if not exists compras_kiwify_quando_idx on public.compras_kiwify (recebido_em desc);

alter table public.compras_kiwify enable row level security;

-- Sem política de leitura de propósito: só a chave de serviço (o motor) e as
-- funções `security definer` entram aqui. Nenhum cliente precisa ver isto.

/*
  Aplica um aviso da Kiwify.

  `security definer` com guarda explícita: a tabela `clientes` tem RLS, e um
  `invoker` devolveria zero linhas em silêncio — foi assim que as visitas
  anunciaram "nenhuma visita" com o banco cheio. Aqui quem chama é o motor com
  a chave de serviço, e a guarda é a própria natureza da função: ela só mexe em
  `clientes` da marca pedida e só nos três campos do acesso.

  Devolve o que aconteceu, para o log do servidor contar a verdade:
    { repetido, achou, user_id, acao, plano_anterior }
*/
create or replace function public.teeds_kiwify_aplicar(
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
  v_libera  boolean;
  v_cli     record;
  v_acao    text;
  v_antes   text;
  v_novo    integer;
begin
  if coalesce(v_email, '') = '' or coalesce(p_pedido, '') = '' then
    return json_build_object('erro', 'pedido e e-mail são obrigatórios');
  end if;

  -- Aprovado libera; estorno, chargeback e cancelamento tiram. Qualquer outro
  -- aviso (boleto gerado, carrinho abandonado) é só registrado.
  v_libera := p_evento in ('order_approved', 'paid', 'approved');
  v_acao := case
    when v_libera then 'liberou'
    when p_evento in ('order_refunded', 'refunded', 'chargedback', 'chargeback', 'canceled', 'cancelled') then 'revogou'
    else 'ignorou' end;

  select c.user_id, c.plano_id into v_cli
  from public.clientes c
  where c.marca = p_marca and lower(c.email) = v_email
  limit 1;

  -- A trava de repetição: se este (pedido, evento) já entrou, não aplica de novo.
  insert into public.compras_kiwify (pedido, evento, marca, email, produto, valor, user_id, plano_anterior, acao)
  values (p_pedido, p_evento, p_marca, v_email, p_produto, p_valor, v_cli.user_id, v_cli.plano_id, v_acao)
  on conflict (pedido, evento) do nothing;
  get diagnostics v_novo = row_count;
  if v_novo = 0 then
    return json_build_object('repetido', true, 'acao', 'nada', 'achou', v_cli.user_id is not null);
  end if;

  if v_cli.user_id is null then
    return json_build_object('repetido', false, 'achou', false, 'acao', 'sem-cadastro');
  end if;

  if v_acao = 'liberou' then
    update public.clientes
       set plano_id = 'pro', status_acesso = 'ativo', acesso_expira_em = null,
           observacoes = coalesce(observacoes || E'\n', '') ||
             'Simulador liberado pela compra ' || p_pedido || ' na Kiwify em ' ||
             to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || '.'
     where user_id = v_cli.user_id and marca = p_marca;

  elsif v_acao = 'revogou' then
    -- Volta ao plano em que a pessoa estava antes desta compra. Procura o
    -- registro da liberação deste mesmo pedido; sem ele, cai no essencial.
    select cp.plano_anterior into v_antes
    from public.compras_kiwify cp
    where cp.pedido = p_pedido and cp.acao = 'liberou'
    order by cp.recebido_em asc limit 1;

    update public.clientes
       set plano_id = coalesce(nullif(v_antes, 'pro'), 'essencial'),
           observacoes = coalesce(observacoes || E'\n', '') ||
             'Simulador revogado (' || p_evento || ') da compra ' || p_pedido || ' em ' ||
             to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || '.'
     where user_id = v_cli.user_id and marca = p_marca;
  end if;

  return json_build_object(
    'repetido', false, 'achou', true, 'user_id', v_cli.user_id,
    'acao', v_acao, 'plano_anterior', v_cli.plano_id);
end;
$function$;

revoke all on function public.teeds_kiwify_aplicar(text, text, text, text, text, numeric) from public, anon, authenticated;
