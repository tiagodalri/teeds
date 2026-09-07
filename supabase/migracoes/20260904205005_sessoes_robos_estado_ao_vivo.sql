-- Sessão de robô: o "cabeçalho" que hoje só existe na memória do navegador.
create table if not exists public.sessoes_robos (
  id              uuid primary key default gen_random_uuid(),
  sessao_ref      text unique,                        -- id devolvido pelo servidor (ex.: 4d3325dbcb73)
  user_id         uuid not null references auth.users(id) on delete cascade,
  conta_id        text not null,
  demo            boolean not null default true,
  moeda           text not null default 'USD',

  robo_id         text not null,
  robo_nome       text not null,
  ativo           text not null default '1HZ75V',

  origem          text not null default 'navegador'
                  check (origem in ('navegador','chat','api')),

  entrada_inicial numeric not null default 0,
  entrada_atual   numeric not null default 0,
  stop_loss       numeric,
  take_profit     numeric,
  max_operacoes   integer not null default 0,

  situacao        text not null default 'rodando'
                  check (situacao in ('rodando','encerrada','erro')),
  operacoes       integer not null default 0,
  ganhas          integer not null default 0,
  perdidas        integer not null default 0,
  resultado       numeric not null default 0,
  movimentado     numeric not null default 0,

  motivo_da_parada text,
  erro             text,

  criada_em       timestamptz not null default now(),
  atualizada_em   timestamptz not null default now(),
  encerrada_em    timestamptz
);

comment on table  public.sessoes_robos is 'Uma execução de robô. O servidor é quem escreve; o navegador só lê.';
comment on column public.sessoes_robos.sessao_ref is 'Identificador curto devolvido por iniciar_sessao, para correlacionar chat e tela.';
comment on column public.sessoes_robos.origem is 'Onde a sessão foi ligada: navegador, chat ou api.';
comment on column public.sessoes_robos.entrada_atual is 'Valor da PRÓXIMA entrada, já com martingale aplicado.';

-- Ligar cada operação à sua sessão + as colunas que a tela mostra e a tabela ainda não tinha.
alter table public.operacoes_robos
  add column if not exists sessao_id      uuid references public.sessoes_robos(id) on delete set null,
  add column if not exists seq            integer,
  add column if not exists preco_entrada  numeric,
  add column if not exists digito_entrada smallint check (digito_entrada between 0 and 9),
  add column if not exists preco_saida    numeric,
  add column if not exists digito_saida   smallint check (digito_saida between 0 and 9),
  add column if not exists acumulado      numeric;

comment on column public.operacoes_robos.seq is 'Número da operação dentro da sessão (a coluna # da tela).';
comment on column public.operacoes_robos.acumulado is 'Resultado acumulado da sessão após esta operação.';

create index if not exists idx_sessoes_robos_user_criada
  on public.sessoes_robos (user_id, criada_em desc);

create index if not exists idx_sessoes_robos_rodando
  on public.sessoes_robos (user_id, conta_id)
  where situacao = 'rodando';

create index if not exists idx_operacoes_robos_sessao
  on public.operacoes_robos (sessao_id, seq);

-- atualizada_em se mantém sozinha
create or replace function public.teeds_toca_atualizada_em()
returns trigger language plpgsql as $$
begin
  new.atualizada_em := now();
  return new;
end $$;

drop trigger if exists trg_sessoes_robos_atualizada_em on public.sessoes_robos;
create trigger trg_sessoes_robos_atualizada_em
  before update on public.sessoes_robos
  for each row execute function public.teeds_toca_atualizada_em();

alter table public.sessoes_robos enable row level security;

create policy "cliente ve suas sessoes de robo"
  on public.sessoes_robos for select to authenticated
  using (user_id = (select auth.uid()) or (select public.teeds_sou_admin()));

create policy "cliente grava suas sessoes de robo"
  on public.sessoes_robos for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "cliente atualiza suas sessoes de robo"
  on public.sessoes_robos for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
