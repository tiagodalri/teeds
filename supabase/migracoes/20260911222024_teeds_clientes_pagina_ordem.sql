-- A aba "Acessos e permanência" mostra a mesma base em outra ordem: primeiro
-- quem já entrou, do acesso mais recente para o mais antigo. Em vez de baixar
-- tudo de novo do lado do navegador, a ordem vira um parâmetro.
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
drop function if exists public.teeds_clientes_pagina(text, text, text, integer, integer);
