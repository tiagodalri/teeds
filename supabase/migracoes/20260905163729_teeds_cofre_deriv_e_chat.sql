-- TEEDS · o cofre das autorizações da Deriv + os limites do chat com IA
-- Seguro para executar novamente: tabelas, políticas e função são idempotentes.

-- ============================================================================
-- O cofre: a autorização da Deriv de cada cliente
-- ============================================================================
-- O que entra JÁ VEM CIFRADO do servidor (AES-256-GCM, chave em
-- servidor/.chave-cofre). Quem enxergar estas linhas vê texto embaralhado.
create table if not exists public.deriv_autorizacoes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  segredo text not null,
  expira_em timestamptz,
  atualizado_em timestamptz not null default now()
);
alter table public.deriv_autorizacoes enable row level security;
-- Nenhuma política, de propósito: com RLS ligado e zero políticas, ninguém
-- alcança esta tabela pela chave pública — nem o dono da linha, nem um admin.
-- Só a chave secreta do servidor passa, porque ela ignora RLS por definição.

-- ============================================================================
-- Os limites do chat, por cliente
-- ============================================================================
create table if not exists public.chat_limites (
  user_id uuid primary key references auth.users(id) on delete cascade,
  entrada_maxima numeric,
  fracao_do_saldo numeric,
  robos_simultaneos integer,
  mensagens_por_dia integer,
  observacao text,
  atualizado_em timestamptz not null default now()
);
alter table public.chat_limites enable row level security;

drop policy if exists "cliente ve seus limites de chat" on public.chat_limites;
create policy "cliente ve seus limites de chat" on public.chat_limites
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.teeds_sou_admin()));

-- ============================================================================
-- A contagem de uso do chat, desde o primeiro dia
-- ============================================================================
create table if not exists public.chat_uso (
  user_id uuid not null references auth.users(id) on delete cascade,
  dia date not null default current_date,
  mensagens integer not null default 0,
  primary key (user_id, dia)
);
create index if not exists chat_uso_dia_idx on public.chat_uso (dia desc);
alter table public.chat_uso enable row level security;

drop policy if exists "cliente ve seu uso de chat" on public.chat_uso;
create policy "cliente ve seu uso de chat" on public.chat_uso
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.teeds_sou_admin()));

-- Soma uma mensagem no dia de hoje e devolve o total, numa ida só.
create or replace function public.chat_registrar_uso(p_user uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.chat_uso (user_id, dia, mensagens)
  values (p_user, current_date, 1)
  on conflict (user_id, dia)
  do update set mensagens = public.chat_uso.mensagens + 1
  returning mensagens;
$$;

revoke all on function public.chat_registrar_uso(uuid) from public, anon, authenticated;
