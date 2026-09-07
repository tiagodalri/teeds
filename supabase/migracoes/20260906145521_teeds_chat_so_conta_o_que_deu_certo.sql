-- Mensagem que falhou não pode gastar a cota do dia.
--
-- Antes, a contagem subia ANTES de falar com a IA — para poder recusar quem
-- passou do teto. O efeito colateral só apareceu quando a API recusou por
-- falta de crédito: cinco tentativas frustradas consumiram cinco das trinta
-- mensagens do dia, sem uma resposta sequer.
--
-- Agora a leitura e a escrita são separadas: conferir o teto é leitura, e a
-- contagem sobe junto com o gasto, depois da resposta chegar.

-- Só lê. Não mexe em nada.
create or replace function public.chat_uso_de_hoje(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select mensagens from public.chat_uso where user_id = p_user and dia = current_date),
    0);
$$;

-- Agora também conta a mensagem — que só chega aqui se a resposta veio.
create or replace function public.chat_registrar_gasto(
  p_user uuid, p_entrada bigint, p_saida bigint, p_cache bigint, p_idas integer
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.chat_uso (user_id, dia, mensagens, tokens_entrada, tokens_saida, tokens_cache, idas)
  values (p_user, current_date, 1, p_entrada, p_saida, p_cache, p_idas)
  on conflict (user_id, dia) do update set
    mensagens      = public.chat_uso.mensagens      + 1,
    tokens_entrada = public.chat_uso.tokens_entrada + excluded.tokens_entrada,
    tokens_saida   = public.chat_uso.tokens_saida   + excluded.tokens_saida,
    tokens_cache   = public.chat_uso.tokens_cache   + excluded.tokens_cache,
    idas           = public.chat_uso.idas           + excluded.idas;
$$;

revoke all on function public.chat_uso_de_hoje(uuid) from public, anon, authenticated;
revoke all on function public.chat_registrar_gasto(uuid, bigint, bigint, bigint, integer) from public, anon, authenticated;

-- As cinco tentativas que falharam hoje não deveriam ter contado.
update public.chat_uso set mensagens = 0
where dia = current_date and tokens_entrada = 0;
