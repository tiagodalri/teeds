-- Laboratório de IA (26/10/2026): as receitas de robô que os admins montam.
-- Tiago: "todos admins da GF devem poder criar". Cada marca vê e mexe só nas
-- suas (teeds_sou_admin_da); o cliente não lê nada daqui.
--
-- `receita` é o robô inteiro (src/core/laboratorio/receita.ts, v1).
-- `situacao` é o trilho: rascunho -> simulada (passou por uma simulação)
-- -> ensaio -> publicada (estas duas chegam com o intérprete no motor).
-- `simulacao` guarda o resumo da última simulação feita, para a biblioteca.

create table if not exists public.lab_receitas (
  id uuid primary key default gen_random_uuid(),
  marca text not null check (marca in ('teeds', 'omni', 'globalfly')),
  nome text not null check (length(btrim(nome)) between 1 and 60),
  receita jsonb not null,
  situacao text not null default 'rascunho' check (situacao in ('rascunho', 'simulada', 'ensaio', 'publicada')),
  simulacao jsonb,
  versao integer not null default 1,
  criado_por uuid references auth.users(id) on delete set null,
  criado_por_nome text,
  alterado_por uuid references auth.users(id) on delete set null,
  alterado_por_nome text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists lab_receitas_marca_idx on public.lab_receitas (marca, atualizado_em desc);

create or replace function public.lab_receitas_carimbar()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.criado_por := coalesce(new.criado_por, auth.uid());
    new.criado_em := now();
  else
    new.criado_por := old.criado_por; new.criado_por_nome := old.criado_por_nome; new.criado_em := old.criado_em;
    new.marca := old.marca;
    if new.receita is distinct from old.receita then new.versao := old.versao + 1; else new.versao := old.versao; end if;
  end if;
  new.alterado_por := auth.uid();
  new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists carimbar on public.lab_receitas;
create trigger carimbar before insert or update on public.lab_receitas for each row execute function public.lab_receitas_carimbar();

alter table public.lab_receitas enable row level security;
drop policy if exists "admins da marca leem" on public.lab_receitas;
create policy "admins da marca leem" on public.lab_receitas for select to authenticated using (public.teeds_sou_admin_da(marca));
drop policy if exists "admins da marca criam" on public.lab_receitas;
create policy "admins da marca criam" on public.lab_receitas for insert to authenticated with check (public.teeds_sou_admin_da(marca));
drop policy if exists "admins da marca alteram" on public.lab_receitas;
create policy "admins da marca alteram" on public.lab_receitas for update to authenticated using (public.teeds_sou_admin_da(marca)) with check (public.teeds_sou_admin_da(marca));
drop policy if exists "admins da marca apagam" on public.lab_receitas;
create policy "admins da marca apagam" on public.lab_receitas for delete to authenticated using (public.teeds_sou_admin_da(marca));
