-- TEEDS · estrutura administrativa inicial
-- Execute uma única vez no SQL Editor do Supabase.

create table if not exists public.administradores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);

create table if not exists public.planos (
  id text primary key,
  nome text not null,
  duracao_dias integer,
  ativo boolean not null default true,
  recursos jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

insert into public.planos (id, nome, duracao_dias, recursos) values
  ('essencial', 'Essencial', 30, '{"operar":true,"aulas":true,"gerenciamento":true}'::jsonb),
  ('pro', 'Pro', 30, '{"operar":true,"aulas":true,"gerenciamento":true,"robos":true}'::jsonb),
  ('vitalicio', 'Vitalício', null, '{"operar":true,"aulas":true,"gerenciamento":true,"robos":true}'::jsonb)
on conflict (id) do nothing;

alter table public.clientes add column if not exists plano_id text references public.planos(id);
alter table public.clientes add column if not exists status_acesso text not null default 'ativo';
alter table public.clientes add column if not exists acesso_inicio timestamptz not null default now();
alter table public.clientes add column if not exists acesso_expira_em timestamptz;
alter table public.clientes add column if not exists observacoes text;

update public.clientes set plano_id = 'essencial' where plano_id is null;
alter table public.clientes alter column plano_id set default 'essencial';
alter table public.clientes alter column plano_id set not null;

do $$ begin
  alter table public.clientes add constraint clientes_status_acesso_check
    check (status_acesso in ('ativo', 'suspenso', 'expirado', 'cancelado'));
exception when duplicate_object then null;
end $$;

create table if not exists public.produtos (
  id text primary key,
  nome text not null,
  categoria text not null,
  preco_centavos integer,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

insert into public.produtos (id, nome, categoria, preco_centavos) values
  ('mentoria-alavancagem', 'Mentoria de Alavancagem', 'mentoria', 99700),
  ('gerenciamento-estrategico', 'Gerenciamento Estratégico', 'mentoria', 49700),
  ('robos-exclusivos', 'Acesso a Robôs Exclusivos', 'robo', 19700),
  ('teeds-atlas', 'Teeds Atlas', 'robo', 69700),
  ('simulador-treino', 'Simulador de Treinamento', 'ferramenta', 39700),
  ('indicadores-manuais', 'Indicadores para Operações Manuais', 'ferramenta', 49700)
on conflict (id) do update set
  nome = excluded.nome, categoria = excluded.categoria,
  preco_centavos = excluded.preco_centavos;

create table if not exists public.cliente_produtos (
  user_id uuid not null references auth.users(id) on delete cascade,
  produto_id text not null references public.produtos(id) on delete cascade,
  concedido_em timestamptz not null default now(),
  expira_em timestamptz,
  origem text not null default 'admin',
  ativo boolean not null default true,
  primary key (user_id, produto_id)
);

create table if not exists public.auditoria_admin (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users(id) on delete set null,
  cliente_id uuid references auth.users(id) on delete set null,
  acao text not null,
  detalhes jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

-- Uma linha por contrato encerrado. Não armazena ticks, evitando volume inútil.
create table if not exists public.operacoes_robos (
  contract_id bigint not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  conta_id text not null,
  robo_id text not null,
  robo_nome text not null,
  ativo text not null,
  tipo_contrato text not null,
  moeda text not null default 'USD',
  demo boolean not null default true,
  entrada numeric not null default 0,
  pagamento numeric not null default 0,
  resultado numeric not null default 0,
  markup numeric not null default 0,
  ganhou boolean not null default false,
  executada_em timestamptz not null,
  criado_em timestamptz not null default now(),
  primary key (user_id, contract_id)
);
create index if not exists operacoes_robos_data_idx on public.operacoes_robos (executada_em desc);
create index if not exists operacoes_robos_robo_idx on public.operacoes_robos (robo_id, executada_em desc);
create index if not exists operacoes_robos_cliente_idx on public.operacoes_robos (user_id, executada_em desc);

create or replace function public.teeds_sou_admin()
returns boolean language sql stable security definer
set search_path = public
as $$ select exists (
  select 1 from public.administradores where user_id = auth.uid()
) $$;

revoke all on function public.teeds_sou_admin() from public;
grant execute on function public.teeds_sou_admin() to authenticated;

alter table public.administradores enable row level security;
alter table public.planos enable row level security;
alter table public.produtos enable row level security;
alter table public.cliente_produtos enable row level security;
alter table public.auditoria_admin enable row level security;
alter table public.operacoes_robos enable row level security;

drop policy if exists "admin ve administradores" on public.administradores;
create policy "admin ve administradores" on public.administradores
  for select to authenticated using (user_id = auth.uid() or public.teeds_sou_admin());

drop policy if exists "autenticados veem planos" on public.planos;
create policy "autenticados veem planos" on public.planos
  for select to authenticated using (ativo or public.teeds_sou_admin());

drop policy if exists "admin gerencia planos" on public.planos;
create policy "admin gerencia planos" on public.planos
  for all to authenticated using (public.teeds_sou_admin()) with check (public.teeds_sou_admin());

drop policy if exists "autenticados veem produtos" on public.produtos;
create policy "autenticados veem produtos" on public.produtos
  for select to authenticated using (ativo or public.teeds_sou_admin());

drop policy if exists "admin gerencia produtos" on public.produtos;
create policy "admin gerencia produtos" on public.produtos
  for all to authenticated using (public.teeds_sou_admin()) with check (public.teeds_sou_admin());

drop policy if exists "cliente ve os proprios produtos" on public.cliente_produtos;
create policy "cliente ve os proprios produtos" on public.cliente_produtos
  for select to authenticated using (user_id = auth.uid() or public.teeds_sou_admin());

drop policy if exists "admin gerencia produtos dos clientes" on public.cliente_produtos;
create policy "admin gerencia produtos dos clientes" on public.cliente_produtos
  for all to authenticated using (public.teeds_sou_admin()) with check (public.teeds_sou_admin());

drop policy if exists "admin gerencia clientes" on public.clientes;
create policy "admin gerencia clientes" on public.clientes
  for all to authenticated using (public.teeds_sou_admin()) with check (public.teeds_sou_admin());

drop policy if exists "admin ve auditoria" on public.auditoria_admin;
create policy "admin ve auditoria" on public.auditoria_admin
  for select to authenticated using (public.teeds_sou_admin());

drop policy if exists "admin grava auditoria" on public.auditoria_admin;
create policy "admin grava auditoria" on public.auditoria_admin
  for insert to authenticated with check (public.teeds_sou_admin() and admin_id = auth.uid());

drop policy if exists "cliente grava suas operacoes de robo" on public.operacoes_robos;
create policy "cliente grava suas operacoes de robo" on public.operacoes_robos
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "cliente atualiza suas operacoes de robo" on public.operacoes_robos;
create policy "cliente atualiza suas operacoes de robo" on public.operacoes_robos
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "cliente ve suas operacoes de robo" on public.operacoes_robos;
create policy "cliente ve suas operacoes de robo" on public.operacoes_robos
  for select to authenticated using (user_id = auth.uid() or public.teeds_sou_admin());

-- Espelha automaticamente novos cadastros na tabela de clientes.
create or replace function public.teeds_novo_cliente()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.clientes
    (user_id, nome, email, telefone, cpf, criado_em, visto_em, plano_id, status_acesso, acesso_inicio, acesso_expira_em)
  values
    (new.id, new.raw_user_meta_data->>'nome', new.email,
     new.raw_user_meta_data->>'telefone', new.raw_user_meta_data->>'cpf',
     coalesce(new.created_at, now()), now(), 'essencial', 'ativo', now(), now() + interval '30 days')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists teeds_ao_criar_usuario on auth.users;
create trigger teeds_ao_criar_usuario
  after insert on auth.users for each row execute function public.teeds_novo_cliente();

-- IMPORTANTE: depois deste script, execute separadamente a linha abaixo,
-- trocando pelo e-mail usado no seu login Teeds:
-- insert into public.administradores (user_id)
-- select id from auth.users where lower(email) = lower('SEU_EMAIL_AQUI')
-- on conflict (user_id) do nothing;
