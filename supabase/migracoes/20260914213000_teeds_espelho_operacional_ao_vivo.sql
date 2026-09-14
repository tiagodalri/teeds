-- O espelho operacional ao vivo: a cabine de cada cliente, vista pelo admin.
--
-- O servidor que opera os robôs já grava a sessão (sessoes_robos) e cada
-- operação liquidada (operacoes_robos). O que faltava para reconstruir a
-- cabine de longe era o meio do caminho: contrato aberto, próxima entrada,
-- motivo de espera, fita de dígitos, análise da estratégia, recusa da Deriv,
-- batimento de vida.
--
-- Três tabelas novas, escritas SOMENTE pelo servidor (chave de serviço):
--   sessoes_robos_ao_vivo  — a foto atual de cada sessão (uma linha por sessão)
--   pulsos_robos_ao_vivo   — o que muda entre eventos, pequeno (dígitos, fase, análise)
--   eventos_robos_ao_vivo  — o que mudou, evento a evento, numerado, permanente (replay)
-- E uma de auditoria: quem, quando e de quem abriu uma cabine.
--
-- Integridade que não depende de o servidor "mandar certo": as três tabelas
-- referenciam sessoes_robos por chave composta (id, marca) — e a foto por
-- (id, marca, user_id). Um evento Teeds apontando para uma sessão OMNI, ou
-- uma foto de um usuário apontando para a sessão de outro, é recusado pelo
-- próprio Postgres.
--
-- Quem lê é só o administrador da marca (teeds_sou_admin_da), pela RLS — que
-- o Realtime também respeita. Cliente não tem política nenhuma aqui: não
-- lista, não assina, não descobre id de sessão de terceiros.
--
-- AINDA NÃO APLICADA. Fica no repositório até o Tiago autorizar. Depois de
-- aplicada, exportar de novo com scripts/exportar-banco.sh. Rollback no fim
-- deste arquivo (comentado).

-- ------------------------------------------- chaves compostas na mãe
-- O Postgres só aceita FK composta contra uma unicidade equivalente.
alter table public.sessoes_robos add constraint sessoes_robos_id_marca_key unique (id, marca);
alter table public.sessoes_robos add constraint sessoes_robos_id_marca_user_key unique (id, marca, user_id);

-- ---------------------------------------------------------- a foto atual
create table if not exists public.sessoes_robos_ao_vivo (
  sessao_id     uuid primary key,
  marca         text not null check (marca in ('teeds', 'omni')),
  user_id       uuid not null,
  seq           integer not null default 0 check (seq >= 0),
  fase          text not null default 'aguardando',
  -- A foto compacta (EstadoEspelho, ver src/core/teeds/espelho.ts). Sem token, sem segredo.
  estado        jsonb not null default '{}'::jsonb,
  -- A configuração com que o robô foi ligado (ConfigEstrategia).
  config        jsonb not null default '{}'::jsonb,
  -- Epoch em milissegundos, pelo relógio do servidor, do último evento que gerou esta foto.
  emitido_em    bigint not null default 0,
  atualizada_em timestamptz not null default now(),
  constraint sessoes_robos_ao_vivo_sessao_fkey foreign key (sessao_id, marca, user_id)
    references public.sessoes_robos (id, marca, user_id) on delete cascade
);
comment on table public.sessoes_robos_ao_vivo is
  'A foto atual da cabine de cada sessão de robô, escrita pelo servidor. Só o admin da marca lê.';
create index if not exists sessoes_robos_ao_vivo_marca_idx on public.sessoes_robos_ao_vivo (marca, atualizada_em desc);

-- ------------------------------------------------------ o pulso
-- Uma linha por sessão, reescrita no máximo a cada 2 s e só se mudou
-- (ver LIMITES.pulsoMs). Pequena de propósito: é ela que o Realtime entrega
-- a cada admin assinante. O batimento de presença também passa por aqui.
create table if not exists public.pulsos_robos_ao_vivo (
  sessao_id     uuid primary key,
  marca         text not null check (marca in ('teeds', 'omni')),
  seq           integer not null default 0 check (seq >= 0),
  pulso         jsonb not null default '{}'::jsonb,
  emitido_em    bigint not null default 0,
  atualizada_em timestamptz not null default now(),
  constraint pulsos_robos_ao_vivo_sessao_fkey foreign key (sessao_id, marca)
    references public.sessoes_robos (id, marca) on delete cascade
);
comment on table public.pulsos_robos_ao_vivo is
  'O que muda entre eventos (fase, dígitos, análise) e o batimento de presença. Pequeno; escrito pelo servidor.';
create index if not exists pulsos_robos_ao_vivo_marca_idx on public.pulsos_robos_ao_vivo (marca, atualizada_em desc);

-- ------------------------------------------------------ o que mudou
create table if not exists public.eventos_robos_ao_vivo (
  id         bigserial primary key,
  sessao_id  uuid not null,
  marca      text not null check (marca in ('teeds', 'omni')),
  seq        integer not null check (seq > 0),
  tipo       text not null check (tipo in ('abertura','compra','liquidacao','fase','entrada','estrategia','falha','conexao','parada','foto')),
  -- Só as chaves que mudaram (delta de EstadoEspelho). 'abertura' e 'foto' trazem a foto inteira.
  delta      jsonb not null default '{}'::jsonb,
  -- A configuração inicial — só na 'abertura', para o replay não depender da foto viva.
  config     jsonb,
  emitido_em bigint not null,
  criado_em  timestamptz not null default now(),
  -- Idempotência: o mesmo evento gravado duas vezes é um só.
  constraint eventos_robos_ao_vivo_sessao_seq_key unique (sessao_id, seq),
  constraint eventos_robos_ao_vivo_sessao_fkey foreign key (sessao_id, marca)
    references public.sessoes_robos (id, marca) on delete cascade
);
comment on table public.eventos_robos_ao_vivo is
  'Eventos operacionais de cada sessão, numerados, permanentes, só com o que mudou. Servem ao vivo e ao replay.';
create index if not exists eventos_robos_ao_vivo_marca_idx  on public.eventos_robos_ao_vivo (marca, criado_em desc);
create index if not exists eventos_robos_ao_vivo_criado_idx on public.eventos_robos_ao_vivo (criado_em);   -- faxina por data
-- (sessao_id, seq) já é índice pela unicidade: replay por sessão em ordem.

-- ------------------------------------------------------- auditoria
create table if not exists public.auditoria_monitoramento_admin (
  id         bigserial primary key,
  marca      text not null check (marca in ('teeds', 'omni')),
  admin_id   uuid not null,
  cliente_id uuid,
  sessao_id  uuid,
  tipo       text not null check (tipo in ('painel', 'ao-vivo', 'replay', 'busca')),
  acao       text not null check (acao in ('abriu', 'fechou', 'buscou', 'exportou', 'negado')),
  criado_em  timestamptz not null default now()
);
comment on table public.auditoria_monitoramento_admin is
  'Cada abertura e fechamento de painel, cabine e replay pelo monitoramento; buscas; tentativas negadas. Sem segredos.';
create index if not exists auditoria_monitoramento_admin_marca_idx   on public.auditoria_monitoramento_admin (marca, criado_em desc);
create index if not exists auditoria_monitoramento_admin_admin_idx   on public.auditoria_monitoramento_admin (admin_id, criado_em desc);
create index if not exists auditoria_monitoramento_admin_cliente_idx on public.auditoria_monitoramento_admin (cliente_id, criado_em desc) where cliente_id is not null;
create index if not exists auditoria_monitoramento_admin_sessao_idx  on public.auditoria_monitoramento_admin (sessao_id, criado_em desc) where sessao_id is not null;

-- ------------------------------------------------------------ RLS
alter table public.sessoes_robos_ao_vivo         enable row level security;
alter table public.pulsos_robos_ao_vivo          enable row level security;
alter table public.eventos_robos_ao_vivo         enable row level security;
alter table public.auditoria_monitoramento_admin enable row level security;

-- Só leitura, só admin, só da própria marca. Nenhuma política de escrita para
-- `authenticated`: quem escreve é o servidor com a chave de serviço, que não
-- passa pela RLS. Anônimo não tem política nenhuma. Cliente não tem política
-- nenhuma — nem para a própria sessão, porque este é um espelho administrativo.
drop policy if exists "admin da marca ve o espelho" on public.sessoes_robos_ao_vivo;
create policy "admin da marca ve o espelho" on public.sessoes_robos_ao_vivo
  for select to authenticated using (public.teeds_sou_admin_da(marca));

drop policy if exists "admin da marca ve o pulso" on public.pulsos_robos_ao_vivo;
create policy "admin da marca ve o pulso" on public.pulsos_robos_ao_vivo
  for select to authenticated using (public.teeds_sou_admin_da(marca));

drop policy if exists "admin da marca ve os eventos" on public.eventos_robos_ao_vivo;
create policy "admin da marca ve os eventos" on public.eventos_robos_ao_vivo
  for select to authenticated using (public.teeds_sou_admin_da(marca));

drop policy if exists "admin da marca ve a auditoria" on public.auditoria_monitoramento_admin;
create policy "admin da marca ve a auditoria" on public.auditoria_monitoramento_admin
  for select to authenticated using (public.teeds_sou_admin_da(marca));

-- Sem grants diretos de escrita para os papéis do PostgREST além do que o
-- Supabase já dá a service_role. Deixamos explícito o que anon/authenticated
-- NÃO podem fazer mesmo que a RLS um dia seja relaxada por engano.
revoke insert, update, delete, truncate on public.sessoes_robos_ao_vivo, public.pulsos_robos_ao_vivo, public.eventos_robos_ao_vivo, public.auditoria_monitoramento_admin from anon, authenticated;

-- ----------------------------------------------------------- Realtime
-- Sem REPLICA IDENTITY FULL o Realtime não consegue aplicar a RLS ao UPDATE.
alter table public.sessoes_robos_ao_vivo replica identity full;
alter table public.pulsos_robos_ao_vivo  replica identity full;
alter table public.eventos_robos_ao_vivo replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'sessoes_robos_ao_vivo') then
    alter publication supabase_realtime add table public.sessoes_robos_ao_vivo;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'pulsos_robos_ao_vivo') then
    alter publication supabase_realtime add table public.pulsos_robos_ao_vivo;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'eventos_robos_ao_vivo') then
    alter publication supabase_realtime add table public.eventos_robos_ao_vivo;
  end if;
end $$;

-- ---------------------------------------------------------- auditoria (RPC)
-- O painel registra abertura/fechamento de painel, cabine e replay, buscas e
-- tentativas negadas. `security definer` para o admin não precisar de
-- política de INSERT (que ele não deve ter). A função confere que quem chama
-- é admin da marca, que a sessão e o cliente informados são DESSA marca e
-- que combinam entre si — metadado forjado não produz auditoria falsa.
create or replace function public.teeds_auditar_monitoramento(p_marca text, p_tipo text, p_acao text, p_sessao_id uuid default null, p_cliente_id uuid default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_dono uuid; v_id bigint;
begin
  if auth.uid() is null then raise exception 'sem sessao' using errcode = '28000'; end if;
  if p_marca not in ('teeds','omni') then raise exception 'marca invalida' using errcode = '22023'; end if;
  if p_tipo not in ('painel','ao-vivo','replay','busca') or p_acao not in ('abriu','fechou','buscou','exportou','negado') then
    raise exception 'tipo ou acao invalidos' using errcode = '22023';
  end if;
  if not public.teeds_sou_admin_da(p_marca) then raise exception 'somente administradores desta marca' using errcode = '42501'; end if;
  if p_sessao_id is not null then
    select user_id into v_dono from public.sessoes_robos where id = p_sessao_id and marca = p_marca;
    if v_dono is null then raise exception 'sessao nao pertence a esta marca' using errcode = '42501'; end if;
    if p_cliente_id is not null and p_cliente_id <> v_dono then raise exception 'sessao e cliente nao combinam' using errcode = '42501'; end if;
  end if;
  if p_cliente_id is not null and not exists (select 1 from public.clientes where user_id = p_cliente_id and marca = p_marca) then
    raise exception 'cliente nao pertence a esta marca' using errcode = '42501';
  end if;
  insert into public.auditoria_monitoramento_admin (marca, admin_id, cliente_id, sessao_id, tipo, acao)
  values (p_marca, auth.uid(), p_cliente_id, p_sessao_id, p_tipo, p_acao) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.teeds_auditar_monitoramento(text, text, text, uuid, uuid) from public, anon;
grant execute on function public.teeds_auditar_monitoramento(text, text, text, uuid, uuid) to authenticated;

-- Tentativa negada: qualquer usuário autenticado pode registrar QUE foi
-- barrado (sem detalhes), no máximo uma vez por minuto — para o admin ver
-- que alguém tentou. Não expõe nada: só grava o próprio id e a marca.
create or replace function public.teeds_auditar_negado(p_marca text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_marca not in ('teeds','omni') then return; end if;
  if exists (select 1 from public.auditoria_monitoramento_admin where admin_id = auth.uid() and acao = 'negado' and criado_em > now() - interval '1 minute') then return; end if;
  insert into public.auditoria_monitoramento_admin (marca, admin_id, tipo, acao) values (p_marca, auth.uid(), 'painel', 'negado');
end $$;
revoke all on function public.teeds_auditar_negado(text) from public, anon;
grant execute on function public.teeds_auditar_negado(text) to authenticated;

-- ---------------------------------------------------------- retenção
-- Chamada pelo servidor (chave de serviço) uma vez por dia. Eventos vivem
-- 30 dias; a foto e o pulso de uma sessão encerrada, 30 dias; a auditoria,
-- 1 ano. Os mesmos números estão em LIMITES (src/core/teeds/espelho.ts).
-- Só a chave de serviço (papel service_role) ou o dono do banco chamam.
create or replace function public.teeds_limpar_espelho(p_dias_eventos integer default 30, p_dias_fotos integer default 30, p_dias_auditoria integer default 365)
returns json language plpgsql security definer set search_path = public as $$
declare v_eventos integer; v_fotos integer; v_pulsos integer; v_auditoria integer; v_papel text;
begin
  v_papel := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user::text);
  if v_papel not in ('service_role', 'postgres') then
    raise exception 'somente o servidor' using errcode = '42501';
  end if;
  delete from public.eventos_robos_ao_vivo where criado_em < now() - make_interval(days => p_dias_eventos);
  get diagnostics v_eventos = row_count;
  delete from public.sessoes_robos_ao_vivo v using public.sessoes_robos s
    where s.id = v.sessao_id and s.situacao <> 'rodando' and v.atualizada_em < now() - make_interval(days => p_dias_fotos);
  get diagnostics v_fotos = row_count;
  delete from public.pulsos_robos_ao_vivo v using public.sessoes_robos s
    where s.id = v.sessao_id and s.situacao <> 'rodando' and v.atualizada_em < now() - make_interval(days => p_dias_fotos);
  get diagnostics v_pulsos = row_count;
  delete from public.auditoria_monitoramento_admin where criado_em < now() - make_interval(days => p_dias_auditoria);
  get diagnostics v_auditoria = row_count;
  return json_build_object('eventos', v_eventos, 'fotos', v_fotos, 'pulsos', v_pulsos, 'auditoria', v_auditoria);
end $$;
revoke all on function public.teeds_limpar_espelho(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.teeds_limpar_espelho(integer, integer, integer) to service_role;

-- ---------------------------------------------------------- rollback
-- drop function if exists public.teeds_limpar_espelho(integer, integer, integer);
-- drop function if exists public.teeds_auditar_negado(text);
-- drop function if exists public.teeds_auditar_monitoramento(text, text, text, uuid, uuid);
-- alter publication supabase_realtime drop table public.eventos_robos_ao_vivo;
-- alter publication supabase_realtime drop table public.pulsos_robos_ao_vivo;
-- alter publication supabase_realtime drop table public.sessoes_robos_ao_vivo;
-- drop table if exists public.auditoria_monitoramento_admin;
-- drop table if exists public.eventos_robos_ao_vivo;
-- drop table if exists public.pulsos_robos_ao_vivo;
-- drop table if exists public.sessoes_robos_ao_vivo;
-- alter table public.sessoes_robos drop constraint if exists sessoes_robos_id_marca_user_key;
-- alter table public.sessoes_robos drop constraint if exists sessoes_robos_id_marca_key;
