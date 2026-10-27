-- Entrar com Face ID / digital (27/10/2026, Tiago: "quero o face id").
--
-- Chaves de acesso (passkeys, WebAuthn): a biometria fica no aparelho; aqui
-- fica só a chave PÚBLICA de cada aparelho, presa ao domínio da plataforma
-- (a chave da GlobalFly não funciona em outro site). A função `biometria`
-- cria os desafios, confere as assinaturas e abre a sessão.
--
-- biometria_credenciais: a pessoa vê e apaga as dela (Meu perfil); quem grava
-- é a função, com a chave de serviço.
-- biometria_desafios: de uso único, valem 5 minutos; só a função lê.

create table if not exists public.biometria_credenciais (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  marca text not null,
  credencial text not null unique,
  chave_publica text not null,
  contador bigint not null default 0,
  transportes text[] not null default '{}',
  aparelho text,
  criada_em timestamptz not null default now(),
  usada_em timestamptz
);
create index if not exists biometria_credenciais_usuario_idx on public.biometria_credenciais (user_id, marca);
alter table public.biometria_credenciais enable row level security;
drop policy if exists "biometria: a pessoa vê os próprios aparelhos" on public.biometria_credenciais;
create policy "biometria: a pessoa vê os próprios aparelhos" on public.biometria_credenciais
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "biometria: a pessoa tira o próprio aparelho" on public.biometria_credenciais;
create policy "biometria: a pessoa tira o próprio aparelho" on public.biometria_credenciais
  for delete to authenticated using (user_id = (select auth.uid()));

create table if not exists public.biometria_desafios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  marca text not null,
  tipo text not null check (tipo in ('cadastro', 'entrada')),
  desafio text not null,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '5 minutes'
);
alter table public.biometria_desafios enable row level security;
-- sem políticas: só a chave de serviço (a função) lê e grava
