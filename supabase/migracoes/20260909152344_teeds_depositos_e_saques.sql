-- Depósitos e saques de cada cliente, copiados do extrato da Deriv.
--
-- A pergunta que isto responde: "quanto entrou e quanto saiu das contas dos
-- clientes hoje?". A Deriv não avisa quando alguém deposita; o extrato da
-- conta é que registra. O servidor lê esse extrato de tempos em tempos, com
-- a autorização que o próprio cliente deu ao conectar a Deriv, e guarda aqui
-- só as linhas de depósito e saque. Contratos não entram: já vivem em
-- operacoes_robos e comissoes_diarias.
--
-- Só o servidor escreve (chave secreta; nenhuma política de escrita, de
-- propósito). O cliente enxerga as próprias linhas; o administrador, as da
-- marca que administra. O dia é contado em UTC, como nos outros relatórios.

create table if not exists public.movimentacoes_deriv (
  conta_id text not null,
  transacao_id bigint not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  marca text not null default 'teeds',
  tipo text not null check (tipo in ('deposit', 'withdrawal')),
  valor numeric not null check (valor >= 0),
  moeda text not null default 'USD',
  saldo_depois numeric,
  descricao text,
  ocorrida_em timestamptz not null,
  demo boolean not null default false,
  coletada_em timestamptz not null default now(),
  primary key (conta_id, transacao_id)
);
comment on table public.movimentacoes_deriv is
  'Depósitos e saques copiados do extrato da Deriv. Escrita somente pelo servidor.';
comment on column public.movimentacoes_deriv.valor is
  'Sempre positivo: o sentido está em tipo (deposit entra, withdrawal sai).';
create index if not exists movimentacoes_deriv_marca_data_idx on public.movimentacoes_deriv (marca, ocorrida_em desc);
create index if not exists movimentacoes_deriv_cliente_idx on public.movimentacoes_deriv (user_id, ocorrida_em desc);
alter table public.movimentacoes_deriv enable row level security;
drop policy if exists "proprio ou admin desta marca le movimentacoes" on public.movimentacoes_deriv;
create policy "proprio ou admin desta marca le movimentacoes" on public.movimentacoes_deriv
  for select to authenticated
  using (user_id = (select auth.uid()) or public.teeds_sou_admin_da(marca));

-- A saúde da coleta, conta a conta: quando tentou, quando deu certo, o que falhou.
create table if not exists public.extrato_coletas (
  conta_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  marca text not null default 'teeds',
  ultima_tentativa_em timestamptz not null default now(),
  ultimo_sucesso_em timestamptz,
  ultimo_erro text
);
comment on table public.extrato_coletas is
  'Última coleta do extrato por conta. Só o servidor escreve; o admin lê para saber se a coleta está viva.';
alter table public.extrato_coletas enable row level security;
drop policy if exists "admin desta marca ve as coletas" on public.extrato_coletas;
create policy "admin desta marca ve as coletas" on public.extrato_coletas
  for select to authenticated using (public.teeds_sou_admin_da(marca));

-- Totais por dia: quanto entrou, quanto saiu, quantas pessoas. Só conta real.
create or replace function public.teeds_movimentacoes_diarias(
  p_dias integer default 30, p_marca text default 'teeds'
)
returns table (
  dia date, depositos numeric, qtd_depositos bigint,
  saques numeric, qtd_saques bigint, clientes bigint
)
language sql stable set search_path = public
as $$
  with janela as (
    select (current_date - greatest(0, least(coalesce(p_dias, 30), 3650) - 1))::date as corte
  )
  select (m.ocorrida_em at time zone 'UTC')::date,
         coalesce(sum(m.valor) filter (where m.tipo = 'deposit'), 0),
         count(*) filter (where m.tipo = 'deposit'),
         coalesce(sum(m.valor) filter (where m.tipo = 'withdrawal'), 0),
         count(*) filter (where m.tipo = 'withdrawal'),
         count(distinct m.user_id)
  from public.movimentacoes_deriv m, janela j
  where public.teeds_sou_admin_da(p_marca) and m.marca = p_marca and not m.demo
    and (m.ocorrida_em at time zone 'UTC')::date >= j.corte
  group by 1
  order by 1 desc;
$$;

-- As movimentações uma a uma, com o nome do cliente, da mais recente para a mais antiga.
create or replace function public.teeds_movimentacoes_recentes(
  p_dias integer default 30, p_marca text default 'teeds', p_limite integer default 500
)
returns table (
  user_id uuid, nome text, email text, conta_id text, transacao_id bigint,
  tipo text, valor numeric, moeda text, saldo_depois numeric, descricao text,
  ocorrida_em timestamptz
)
language sql stable set search_path = public
as $$
  select m.user_id, c.nome, c.email, m.conta_id, m.transacao_id,
         m.tipo, m.valor, m.moeda, m.saldo_depois, m.descricao, m.ocorrida_em
  from public.movimentacoes_deriv m
  left join public.clientes c on c.user_id = m.user_id and c.marca = m.marca
  where public.teeds_sou_admin_da(p_marca) and m.marca = p_marca and not m.demo
    and m.ocorrida_em >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 3650)))
  order by m.ocorrida_em desc
  limit greatest(1, least(coalesce(p_limite, 500), 2000));
$$;

-- A coleta está viva? Uma linha por conta, com o nome de quem é e o que já foi guardado.
create or replace function public.teeds_extrato_coletas(p_marca text default 'teeds')
returns table (
  conta_id text, user_id uuid, nome text, email text,
  ultima_tentativa_em timestamptz, ultimo_sucesso_em timestamptz,
  ultima_movimentacao_em timestamptz, ultimo_erro text, movimentacoes bigint
)
language sql stable set search_path = public
as $$
  select k.conta_id, k.user_id, c.nome, c.email,
         k.ultima_tentativa_em, k.ultimo_sucesso_em,
         (select max(m.ocorrida_em) from public.movimentacoes_deriv m where m.conta_id = k.conta_id),
         k.ultimo_erro,
         (select count(*) from public.movimentacoes_deriv m where m.conta_id = k.conta_id)
  from public.extrato_coletas k
  left join public.clientes c on c.user_id = k.user_id and c.marca = k.marca
  where public.teeds_sou_admin_da(p_marca) and k.marca = p_marca
  order by k.ultima_tentativa_em desc;
$$;

revoke all on function public.teeds_movimentacoes_diarias(integer, text) from public, anon;
revoke all on function public.teeds_movimentacoes_recentes(integer, text, integer) from public, anon;
revoke all on function public.teeds_extrato_coletas(text) from public, anon;
grant execute on function public.teeds_movimentacoes_diarias(integer, text) to authenticated;
grant execute on function public.teeds_movimentacoes_recentes(integer, text, integer) to authenticated;
grant execute on function public.teeds_extrato_coletas(text) to authenticated;
