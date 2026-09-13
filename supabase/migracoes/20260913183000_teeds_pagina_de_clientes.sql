-- A aba de clientes mostra 50 nomes por vez, mas baixava a base inteira para
-- isso: depois da importacao de leads de 11/09/2026 eram 11.482 fichas em doze
-- consultas seguidas, antes de a tela desenhar qualquer coisa.
--
-- Esta funcao faz a conta no banco e devolve numa resposta so: a pagina pedida
-- (ja buscada, filtrada e ordenada) e os numeros do topo, que precisam olhar a
-- base inteira — total, ativos, expirados, vencendo, ativos em 24h e a
-- distribuicao por plano.
--
-- `p_ordem` existe porque a aba "Acessos e permanencia" mostra a mesma base em
-- outra ordem: primeiro quem ja entrou, do acesso mais recente para o mais
-- antigo. Sem isso ela precisaria baixar tudo de novo so para ordenar.
--
-- Security invoker de proposito: quem le e o usuario, com as regras de RLS da
-- tabela `clientes` valendo. Admin de uma marca continua vendo so a dela.

create index if not exists clientes_marca_criado_idx
  on public.clientes (marca, criado_em desc, user_id desc);

create index if not exists clientes_marca_visto_idx
  on public.clientes (marca, visto_em desc);

create or replace function public.teeds_clientes_pagina(
  p_marca text default 'teeds',
  p_busca text default null,
  p_status text default 'todos',
  p_limite integer default 50,
  p_offset integer default 0,
  p_ordem text default 'cadastro'
) returns jsonb
language sql
stable
as $$
with base as (
  select c.*,
    case when c.acesso_expira_em is not null and c.acesso_expira_em < now() and coalesce(c.status_acesso, 'ativo') = 'ativo'
      then 'expirado' else coalesce(c.status_acesso, 'ativo') end as situacao
  from public.clientes c
  where c.marca = p_marca
),
totais as (
  select count(*) as total,
    count(*) filter (where situacao = 'ativo') as ativos,
    count(*) filter (where situacao = 'expirado') as expirados,
    count(*) filter (where acesso_expira_em is not null and acesso_expira_em >= now()
                       and acesso_expira_em <= now() + interval '7 days') as vencendo,
    -- So quem entrou de verdade. A ficha nasce com "visto agora", e sem este
    -- corte cada conta criada apareceria como ativa no dia do cadastro.
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
    case when p_ordem = 'acessos' and coalesce(total_acessos, 0) > 0 then 0 else 1 end,
    case when p_ordem = 'acessos' then visto_em end desc nulls last,
    criado_em desc, user_id desc
  limit greatest(1, least(coalesce(p_limite, 50), 200))
  offset greatest(0, coalesce(p_offset, 0))
),
por_plano as (
  select coalesce(plano_id, 'essencial') as plano, count(*) as total from base group by 1
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
  'pagina', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from (select * from pagina) p)
);
$$;

grant execute on function public.teeds_clientes_pagina(text, text, text, integer, integer, text) to authenticated;

-- A primeira versao nascia sem `p_ordem`; sai para nao ficar uma sobrecarga
-- antiga respondendo por engano.
drop function if exists public.teeds_clientes_pagina(text, text, text, integer, integer);
