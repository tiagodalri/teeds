-- A lista de clientes passa a ordenar por qualquer coluna.
--
-- A tabela tem 11.482 fichas e mostra 50 por vez. Ordenar no navegador
-- ordenaria só as 50 da página — o "maior saldo" seria o maior saldo DAQUELA
-- página, o que é pior do que não ordenar, porque parece certo. Então a
-- ordem desce para o banco, antes do corte da página.
--
-- O SALDO ENTRA AQUI PELA PRIMEIRA VEZ. Até agora ele era só desenho: a tela
-- somava as contas reais no navegador, a partir de uma lista carregada à
-- parte. Para ordenar por saldo o banco precisa conhecê-lo, então `base`
-- ganha a soma das contas NÃO demo, pela mesma regra que a tela usa
-- (`tipo <> 'demo'`) — senão a lista ordenaria por um número e exibiria
-- outro, que é o tipo de divergência que ninguém percebe até confiar nela.
--
-- A direção vai dentro do próprio texto da ordem ('saldo' desc, 'saldo-asc'
-- asc) em vez de virar um parâmetro novo. Assim a assinatura não muda e as
-- telas já publicadas continuam chamando como sempre chamaram.
--
-- `acessos` fica intacto: a tela de Criar acesso depende dele, e ele tem uma
-- regra própria (quem já acessou primeiro, depois por data).

create or replace function public.teeds_clientes_pagina(
  p_marca text default 'teeds', p_busca text default null, p_status text default 'todos',
  p_limite integer default 50, p_offset integer default 0, p_ordem text default 'cadastro')
returns jsonb language sql stable set search_path to 'public' as $function$
with marcas as (select public.teeds_marcas_em_foco(p_marca) as lista),
base as (
  select c.*,
    case when c.acesso_expira_em is not null and c.acesso_expira_em < now() and coalesce(c.status_acesso, 'ativo') = 'ativo'
      then 'expirado' else coalesce(c.status_acesso, 'ativo') end as situacao,
    -- Soma das contas reais. Null quando a pessoa não conectou nenhuma: é
    -- diferente de zero, e a ordenação trata os dois casos de forma diferente.
    (select sum(d.saldo) from public.contas_deriv d
      where d.user_id = c.user_id and coalesce(d.tipo, '') <> 'demo') as saldo_real
  from public.clientes c, marcas m
  where c.marca = any(m.lista)
),
totais as (
  select count(*) as total,
    count(*) filter (where situacao = 'ativo') as ativos,
    count(*) filter (where situacao = 'expirado') as expirados,
    count(*) filter (where acesso_expira_em is not null and acesso_expira_em >= now()
                       and acesso_expira_em <= now() + interval '7 days') as vencendo,
    count(*) filter (where coalesce(total_acessos, 0) > 0 and visto_em >= now() - interval '1 day') as ativos24h,
    count(*) filter (where coalesce(total_acessos, 0) > 0) as acessaram
  from base
),
filtrados as (
  select * from base
  where (p_status = 'todos' or situacao = p_status)
    and (
      p_busca is null or btrim(p_busca) = ''
      or nome ilike '%' || btrim(p_busca) || '%'
      or email ilike '%' || btrim(p_busca) || '%'
      or telefone ilike '%' || btrim(p_busca) || '%'
      or cpf ilike '%' || btrim(p_busca) || '%'
    )
),
pagina as (
  select * from filtrados
  order by
    -- Quem não tem o dado da coluna escolhida vai para o fim, subindo ou
    -- descendo. Uma lista por saldo que começa com quem não conectou conta
    -- nenhuma não responde à pergunta que foi feita.
    case
      when p_ordem in ('acesso', 'acesso-asc') and visto_em is null then 1
      when p_ordem in ('saldo', 'saldo-asc') and saldo_real is null then 1
      else 0
    end,
    case when p_ordem = 'acessos' and coalesce(total_acessos, 0) > 0 then 0 else 1 end,
    case when p_ordem = 'acessos' then visto_em end desc nulls last,
    case when p_ordem = 'acesso' then visto_em end desc,
    case when p_ordem = 'acesso-asc' then visto_em end asc,
    case when p_ordem = 'saldo' then saldo_real end desc,
    case when p_ordem = 'saldo-asc' then saldo_real end asc,
    case when p_ordem = 'nome' then lower(coalesce(nullif(btrim(nome), ''), email)) end asc,
    case when p_ordem = 'nome-desc' then lower(coalesce(nullif(btrim(nome), ''), email)) end desc,
    case when p_ordem = 'status' then situacao end asc,
    case when p_ordem = 'status-desc' then situacao end desc,
    case when p_ordem = 'plano' then coalesce(plano_id, 'essencial') end asc,
    case when p_ordem = 'plano-desc' then coalesce(plano_id, 'essencial') end desc,
    case when p_ordem = 'cadastro-asc' then criado_em end asc,
    -- O padrão, e o desempate de todas as outras: mais novo primeiro.
    criado_em desc, user_id desc
  limit greatest(1, least(coalesce(p_limite, 50), 200))
  offset greatest(0, coalesce(p_offset, 0))
),
por_plano as (
  select coalesce(plano_id, 'essencial') as plano, count(*) as total from base group by 1
),
por_marca as (
  select marca, count(*) as total,
         count(*) filter (where coalesce(total_acessos, 0) > 0 and visto_em >= now() - interval '1 day') as ativos24h
  from base group by 1
)
select jsonb_build_object(
  'total', (select total from totais),
  'ativos', (select ativos from totais),
  'expirados', (select expirados from totais),
  'vencendo', (select vencendo from totais),
  'ativos24h', (select ativos24h from totais),
  'acessaram', (select acessaram from totais),
  'filtrados', (select count(*) from filtrados),
  'por_plano', (select coalesce(jsonb_object_agg(plano, total), '{}'::jsonb) from por_plano),
  'por_marca', (select coalesce(jsonb_agg(jsonb_build_object('marca', marca, 'total', total, 'ativos24h', ativos24h) order by total desc), '[]'::jsonb) from por_marca),
  'pagina', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from (select * from pagina) p)
);
$function$;

-- A soma do saldo roda uma vez por ficha da marca; sem este índice ela varre
-- contas_deriv inteira 11 mil vezes.
create index if not exists contas_deriv_user_tipo on public.contas_deriv (user_id, tipo);
