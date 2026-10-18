-- Chaves de serviços que só as funções do servidor leem (com a chave de
-- serviço). RLS ligada e nenhuma regra: nenhum usuário, logado ou não, lê.
-- Primeiro uso: endereço e chaves do LiveKit que roda no nosso servidor
-- (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET), lidos pela função
-- live-token. Os valores NÃO ficam neste arquivo.
create table if not exists public.config_servicos (
  chave text primary key,
  valor text not null,
  atualizado_em timestamptz not null default now()
);
alter table public.config_servicos enable row level security;
revoke all on public.config_servicos from anon, authenticated;
