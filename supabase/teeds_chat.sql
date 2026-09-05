-- TEEDS · o chat com IA: limites por cliente e contagem de uso
-- Seguro para executar novamente: tabelas, políticas e função são idempotentes.
--
-- Duas tabelas e nada mais. Não existe tabela de mensagens de propósito: o
-- histórico da conversa vive só no navegador, enquanto a página está aberta.
-- Guardar o que o cliente escreve seria mais dado sensível parado, mais custo
-- e mais superfície de vazamento, em troca de uma conveniência pequena.

-- ---------------------------------------------------------------- limites
-- Uma linha por cliente que precisou de ajuste. Quem não tem linha usa o
-- padrão do servidor, que é deliberadamente apertado (ver limites.ts).
create table if not exists public.chat_limites (
  user_id uuid primary key references auth.users(id) on delete cascade,
  entrada_maxima numeric,      -- maior valor por entrada, em conta real
  fracao_do_saldo numeric,     -- maior stop, como fração do saldo (0.25 = 25%)
  robos_simultaneos integer,   -- quantos robôs ao mesmo tempo
  mensagens_por_dia integer,   -- teto de conversa por dia
  observacao text,             -- por que este cliente tem ajuste
  atualizado_em timestamptz not null default now()
);
alter table public.chat_limites enable row level security;

-- O cliente pode ver os próprios limites (para a tela explicar uma recusa),
-- mas nunca mudá-los: quem escreve aqui é o servidor, com a chave secreta.
drop policy if exists "cliente ve seus limites de chat" on public.chat_limites;
create policy "cliente ve seus limites de chat" on public.chat_limites
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.teeds_sou_admin()));

-- ------------------------------------------------------------------- uso
-- Uma linha por cliente por dia, desde o primeiro dia. Sem isto, o custo do
-- chat só apareceria na fatura — quando já foi gasto.
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

-- --------------------------------------------------------------- contagem
-- Soma uma mensagem no dia de hoje e devolve o total já gasto, numa ida só.
--
-- Ler-somar-gravar do lado do servidor deixaria duas abas abertas contarem a
-- mesma mensagem duas vezes — ou, pior, nenhuma. O banco resolve isso com
-- uma linha, e o `on conflict` torna a operação atômica.
--
-- SECURITY DEFINER porque quem chama é o servidor com a chave secreta, e a
-- função precisa escrever numa tabela que o cliente só pode ler.
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

-- ============================================================================
-- TEEDS · o cofre: a autorização da Deriv de cada cliente
-- ============================================================================
--
-- O cliente autoriza a Teeds uma vez, na página oficial da Deriv. Até agora
-- essa autorização ficava só no navegador dele — e um robô que roda em Nova
-- York com o navegador fechado não alcança navegador nenhum. Ela passa a
-- viver aqui também.
--
-- O que entra nesta tabela JÁ VEM CIFRADO do servidor (AES-256-GCM, chave em
-- servidor/.chave-cofre). Quem enxergar estas linhas não enxerga autorização
-- nenhuma: vê texto embaralhado.
create table if not exists public.deriv_autorizacoes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  segredo text not null,            -- a autorização cifrada; nunca em claro
  expira_em timestamptz,            -- para renovar antes de vencer
  atualizado_em timestamptz not null default now()
);
alter table public.deriv_autorizacoes enable row level security;

-- Nenhuma política, de propósito.
--
-- Com RLS ligado e zero políticas, ninguém alcança esta tabela pela chave
-- pública — nem o dono da linha, nem um admin da Teeds. Só a chave secreta
-- do servidor passa, porque ela ignora RLS por definição. É o comportamento
-- que a gente quer: a autorização entra pelo servidor, é usada pelo servidor,
-- e não tem por que ser lida por mais ninguém em lugar nenhum.
