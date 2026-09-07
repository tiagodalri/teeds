-- TEEDS · uma conta Deriv pertence a um login só.
-- Nada é apagado: o que sai vai para public.arquivo_duplicatas.

create table if not exists public.arquivo_duplicatas (
  id bigint generated always as identity primary key,
  tabela text not null,
  user_id uuid,
  conta_id text,
  dados jsonb not null,
  motivo text not null default 'mesma conta Deriv ligada a mais de um login',
  arquivado_em timestamptz not null default now()
);
alter table public.arquivo_duplicatas enable row level security;
drop policy if exists "admin le o arquivo de duplicatas" on public.arquivo_duplicatas;
create policy "admin le o arquivo de duplicatas" on public.arquivo_duplicatas
  for select to authenticated using ((select public.teeds_sou_admin()));

-- Dono de cada conta Deriv = quem conectou primeiro.
create temporary table donos on commit drop as
  select distinct on (conta_id) conta_id, user_id
  from public.contas_deriv
  order by conta_id, conectada_em asc;

-- 1) comissões diárias dos logins intrusos
insert into public.arquivo_duplicatas (tabela, user_id, conta_id, dados)
select 'comissoes_diarias', k.user_id, k.conta_id, to_jsonb(k)
from public.comissoes_diarias k
join donos d on d.conta_id = k.conta_id
where k.user_id <> d.user_id;

delete from public.comissoes_diarias k
using donos d
where d.conta_id = k.conta_id and k.user_id <> d.user_id;

-- 2) operações de robô dos logins intrusos
insert into public.arquivo_duplicatas (tabela, user_id, conta_id, dados)
select 'operacoes_robos', o.user_id, o.conta_id, to_jsonb(o)
from public.operacoes_robos o
join donos d on d.conta_id = o.conta_id
where o.user_id <> d.user_id;

delete from public.operacoes_robos o
using donos d
where d.conta_id = o.conta_id and o.user_id <> d.user_id;

-- 3) o vínculo duplicado da conta
insert into public.arquivo_duplicatas (tabela, user_id, conta_id, dados)
select 'contas_deriv', c.user_id, c.conta_id, to_jsonb(c)
from public.contas_deriv c
join donos d on d.conta_id = c.conta_id
where c.user_id <> d.user_id;

delete from public.contas_deriv c
using donos d
where d.conta_id = c.conta_id and c.user_id <> d.user_id;

-- 4) o banco passa a recusar a repetição
alter table public.contas_deriv drop constraint if exists contas_deriv_conta_unica;
alter table public.contas_deriv add constraint contas_deriv_conta_unica unique (conta_id);

alter table public.comissoes_diarias drop constraint if exists comissoes_diarias_conta_dia_unica;
alter table public.comissoes_diarias add constraint comissoes_diarias_conta_dia_unica unique (conta_id, dia);
