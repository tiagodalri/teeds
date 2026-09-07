-- O cofre precisa lembrar de qual marca veio cada autorização.
--
-- A autorização é emitida por uma app da Deriv, e renová-la exige dizer qual
-- app foi. Com duas marcas — duas apps — o servidor não tem como adivinhar:
-- renovar a autorização de um cliente OMNI usando a app da Teeds falha, e o
-- robô dele morreria no meio da sessão sem explicação.
alter table public.deriv_autorizacoes
  add column if not exists marca text not null default 'teeds';

comment on column public.deriv_autorizacoes.marca is
  'Qual marca emitiu esta autorização. Define qual app da Deriv renova o token.';
