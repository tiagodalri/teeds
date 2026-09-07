-- O consumo do chat, anotado desde o primeiro dia.
--
-- Sem isto, o custo só aparece na fatura — quando já foi gasto. A resposta da
-- Anthropic diz exatamente quantos tokens foram em cada mensagem; era só não
-- jogar fora.
--
-- A coluna que mais importa é tokens_cache: ela responde, com número medido,
-- se vale ligar o desconto de repetição. Enquanto ela ficar em zero, o
-- desconto não está pegando.
alter table public.chat_uso add column if not exists tokens_entrada bigint not null default 0;
alter table public.chat_uso add column if not exists tokens_saida   bigint not null default 0;
alter table public.chat_uso add column if not exists tokens_cache   bigint not null default 0;
alter table public.chat_uso add column if not exists idas           integer not null default 0;

-- Soma o gasto de uma mensagem no dia de hoje.
--
-- Separada de chat_registrar_uso de propósito: aquela roda ANTES de falar com
-- a IA (para poder recusar quem passou do teto) e esta roda DEPOIS, quando o
-- consumo já é conhecido. Juntar as duas obrigaria a adivinhar o gasto antes
-- de gastá-lo.
create or replace function public.chat_registrar_gasto(
  p_user uuid, p_entrada bigint, p_saida bigint, p_cache bigint, p_idas integer
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.chat_uso (user_id, dia, mensagens, tokens_entrada, tokens_saida, tokens_cache, idas)
  values (p_user, current_date, 0, p_entrada, p_saida, p_cache, p_idas)
  on conflict (user_id, dia) do update set
    tokens_entrada = public.chat_uso.tokens_entrada + excluded.tokens_entrada,
    tokens_saida   = public.chat_uso.tokens_saida   + excluded.tokens_saida,
    tokens_cache   = public.chat_uso.tokens_cache   + excluded.tokens_cache,
    idas           = public.chat_uso.idas           + excluded.idas;
$$;

revoke all on function public.chat_registrar_gasto(uuid, bigint, bigint, bigint, integer) from public, anon, authenticated;
