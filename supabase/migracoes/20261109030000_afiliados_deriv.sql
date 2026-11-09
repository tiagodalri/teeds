-- Métricas da conta de afiliado da Deriv, por parceiro (09/11/2026).
--
-- Tiago: "como faz pra trazermos essas métricas pra plataforma? segregado
-- certinho victor/naor". A Deriv (Partners API, Beta) devolve os números da
-- conta de afiliado de QUEM AUTORIZOU: cadastros, contas reais, 1º depósito,
-- 1ª operação, quem operou e a comissão paga e a receber. Não abre por cliente.
-- Então a separação é por conta: cada parceiro liga a própria conta de afiliado
-- (a Deriv dele já conectada na plataforma), e o servidor coleta dia a dia.
--
-- Só o servidor lê e escreve (service_role). A tela fala com /api/afiliados,
-- que aplica a mesma regra das outras abas: o admin geral vê todos, o admin
-- do parceiro vê só o dele.

create table if not exists public.afiliados_contas (
  marca         text not null,
  -- o código do parceiro ('n', 'v', 'd'); '' = Direto (a conta de afiliado da casa)
  parceiro      text not null default '',
  -- de quem é a autorização da Deriv usada nas leituras (fica no cofre do servidor)
  user_id       uuid not null references auth.users(id) on delete cascade,
  vinculado_em  timestamptz not null default now(),
  -- última leitura: 'ok' | 'nao-e-afiliado' | 'reconectar' | 'erro'
  situacao      text not null default 'ok',
  detalhe       text,
  coletado_em   timestamptz,
  primary key (marca, parceiro)
);

create table if not exists public.afiliados_metricas_diarias (
  marca               text not null,
  parceiro            text not null default '',
  dia                 date not null,
  cadastros           integer not null default 0,
  contas_reais        integer not null default 0,
  primeiro_deposito   integer not null default 0,
  primeira_operacao   integer not null default 0,
  operaram            integer not null default 0,
  comissao_paga       numeric(14,2) not null default 0,
  comissao_pendente   numeric(14,2) not null default 0,
  subafiliados_ativos integer not null default 0,
  ganho_subafiliados  numeric(14,2) not null default 0,
  coletado_em         timestamptz not null default now(),
  primary key (marca, parceiro, dia)
);

alter table public.afiliados_contas enable row level security;
alter table public.afiliados_metricas_diarias enable row level security;
-- sem políticas: ninguém lê pelo navegador; o servidor usa a chave de serviço
revoke all on public.afiliados_contas from anon, authenticated;
revoke all on public.afiliados_metricas_diarias from anon, authenticated;
