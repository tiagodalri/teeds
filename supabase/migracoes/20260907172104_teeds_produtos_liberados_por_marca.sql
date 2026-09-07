-- Produto liberado numa plataforma não vale na outra.
--
-- Um cliente que comprou um robô na Teeds não deve encontrá-lo liberado na
-- OMNI só porque é a mesma pessoa. São plataformas diferentes, com catálogos
-- e vendas próprias.
alter table public.cliente_produtos add column if not exists marca text not null default 'teeds';

alter table public.cliente_produtos drop constraint if exists cliente_produtos_pkey;
alter table public.cliente_produtos add primary key (user_id, produto_id, marca);

-- E o chat também conta por plataforma: custo da OMNI não some no da Teeds.
create or replace function public.chat_uso_de_hoje(p_user uuid, p_marca text default 'teeds')
returns integer language sql stable security definer set search_path = public
as $$
  select coalesce((select mensagens from public.chat_uso
                   where user_id = p_user and dia = current_date and marca = p_marca), 0);
$$;

create or replace function public.chat_registrar_gasto(
  p_user uuid, p_entrada bigint, p_saida bigint, p_cache bigint, p_idas integer,
  p_marca text default 'teeds'
)
returns void language sql security definer set search_path = public
as $$
  insert into public.chat_uso (user_id, dia, marca, mensagens, tokens_entrada, tokens_saida, tokens_cache, idas)
  values (p_user, current_date, p_marca, 1, p_entrada, p_saida, p_cache, p_idas)
  on conflict (user_id, dia) do update set
    mensagens      = public.chat_uso.mensagens      + 1,
    tokens_entrada = public.chat_uso.tokens_entrada + excluded.tokens_entrada,
    tokens_saida   = public.chat_uso.tokens_saida   + excluded.tokens_saida,
    tokens_cache   = public.chat_uso.tokens_cache   + excluded.tokens_cache,
    idas           = public.chat_uso.idas           + excluded.idas;
$$;

revoke all on function public.chat_uso_de_hoje(uuid, text) from public, anon, authenticated;
revoke all on function public.chat_registrar_gasto(uuid, bigint, bigint, bigint, integer, text) from public, anon, authenticated;
