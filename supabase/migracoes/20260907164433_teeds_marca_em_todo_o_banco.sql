-- A marca entra no banco.
--
-- Até aqui as duas plataformas dividiam tudo: um cliente da OMNI apareceria
-- na lista da Teeds, as comissões somariam as duas juntas, e o marketplace
-- seria idêntico. Enquanto só o dono usa, não dói. No dia do primeiro
-- cliente externo, dói tudo de uma vez — e aí vira migração em produção.
--
-- Tudo que já existe é da Teeds: o padrão é 'teeds' e as linhas antigas
-- ficam corretas sem ninguém precisar mexer.

-- ---- registros: uma linha pertence a uma marca ----
alter table public.clientes           add column if not exists marca text not null default 'teeds';
alter table public.administradores    add column if not exists marca text not null default 'teeds';
alter table public.sessoes_robos      add column if not exists marca text not null default 'teeds';
alter table public.operacoes_robos    add column if not exists marca text not null default 'teeds';
alter table public.comissoes_diarias  add column if not exists marca text not null default 'teeds';
alter table public.contas_deriv       add column if not exists marca text not null default 'teeds';
alter table public.chat_uso           add column if not exists marca text not null default 'teeds';
alter table public.chat_limites       add column if not exists marca text not null default 'teeds';

-- ---- catálogos: um item pode servir a mais de uma marca ----
-- Um robô, um produto ou um plano pode ser exclusivo de uma plataforma ou
-- aparecer nas duas. Por isso lista, e não valor único.
alter table public.produtos add column if not exists marcas text[] not null default '{teeds}';
alter table public.planos   add column if not exists marcas text[] not null default '{teeds}';

-- ---- índices: as telas sempre perguntam "desta marca" ----
create index if not exists clientes_marca_idx          on public.clientes (marca);
create index if not exists sessoes_robos_marca_idx     on public.sessoes_robos (marca, criada_em desc);
create index if not exists operacoes_robos_marca_idx   on public.operacoes_robos (marca, executada_em desc);
create index if not exists comissoes_diarias_marca_idx on public.comissoes_diarias (marca, dia desc);

comment on column public.clientes.marca is
  'Em qual plataforma esta pessoa se cadastrou. Separa a lista de cada admin.';
comment on column public.comissoes_diarias.marca is
  'De qual plataforma veio esta comissão. É o que permite responder "quanto a OMNI rendeu".';
comment on column public.produtos.marcas is
  'Em quais plataformas este produto aparece. Um item pode ser exclusivo ou comum.';
