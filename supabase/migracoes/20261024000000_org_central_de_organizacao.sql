-- Central de organização da equipe (Administração > Organização), 23/10/2026.
--
-- Um "Trello" da casa: tarefas com responsável, prazo, prioridade, área,
-- descrição, checklist e comentários; marcos no calendário (lançamento,
-- lives, início do tráfego...). Só administradores da marca veem e mexem.
-- Mudanças chegam ao vivo para os outros (publicação do Realtime).

create table if not exists public.org_tarefas (
  id            uuid primary key default gen_random_uuid(),
  marca         text not null,
  titulo        text not null check (length(btrim(titulo)) between 1 and 200),
  descricao     text,
  area          text not null default 'geral'
                check (area in ('marketing','conteudo','trafego','comercial','desenvolvimento','suporte','geral')),
  status        text not null default 'a_fazer' check (status in ('a_fazer','fazendo','revisao','feito')),
  prioridade    text not null default 'media' check (prioridade in ('baixa','media','alta','urgente')),
  responsavel   uuid references auth.users(id) on delete set null,
  prazo         date,
  checklist     jsonb not null default '[]'::jsonb,
  ordem         double precision not null default extract(epoch from now()),
  criado_por    uuid references auth.users(id) on delete set null default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  concluido_em  timestamptz
);
create index if not exists org_tarefas_marca_prazo_idx on public.org_tarefas (marca, prazo);
create index if not exists org_tarefas_responsavel_idx on public.org_tarefas (marca, responsavel);

create table if not exists public.org_marcos (
  id            uuid primary key default gen_random_uuid(),
  marca         text not null,
  titulo        text not null check (length(btrim(titulo)) between 1 and 200),
  descricao     text,
  data          date not null,
  hora          time,
  tipo          text not null default 'outro'
                check (tipo in ('lancamento','live','trafego','captacao','campanha','reuniao','feriado','outro')),
  criado_por    uuid references auth.users(id) on delete set null default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists org_marcos_marca_data_idx on public.org_marcos (marca, data);

create table if not exists public.org_comentarios (
  id         uuid primary key default gen_random_uuid(),
  tarefa_id  uuid not null references public.org_tarefas(id) on delete cascade,
  marca      text not null,
  autor      uuid references auth.users(id) on delete set null default auth.uid(),
  texto      text not null check (length(btrim(texto)) between 1 and 4000),
  criado_em  timestamptz not null default now()
);
create index if not exists org_comentarios_tarefa_idx on public.org_comentarios (tarefa_id, criado_em);

-- carimbo de atualização e de conclusão
create or replace function public.org_carimbar() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  new.atualizado_em := now();
  if tg_table_name = 'org_tarefas' then
    if new.status = 'feito' and (tg_op = 'INSERT' or old.status is distinct from 'feito') then
      new.concluido_em := now();
    elsif new.status <> 'feito' then
      new.concluido_em := null;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists org_tarefas_carimbo on public.org_tarefas;
create trigger org_tarefas_carimbo before insert or update on public.org_tarefas
  for each row execute function public.org_carimbar();
drop trigger if exists org_marcos_carimbo on public.org_marcos;
create trigger org_marcos_carimbo before insert or update on public.org_marcos
  for each row execute function public.org_carimbar();

-- só administradores da marca
alter table public.org_tarefas enable row level security;
alter table public.org_marcos enable row level security;
alter table public.org_comentarios enable row level security;

drop policy if exists org_tarefas_admin on public.org_tarefas;
create policy org_tarefas_admin on public.org_tarefas for all to authenticated
  using (public.teeds_sou_admin_da(marca)) with check (public.teeds_sou_admin_da(marca));
drop policy if exists org_marcos_admin on public.org_marcos;
create policy org_marcos_admin on public.org_marcos for all to authenticated
  using (public.teeds_sou_admin_da(marca)) with check (public.teeds_sou_admin_da(marca));
drop policy if exists org_comentarios_admin on public.org_comentarios;
create policy org_comentarios_admin on public.org_comentarios for all to authenticated
  using (public.teeds_sou_admin_da(marca)) with check (public.teeds_sou_admin_da(marca));

-- a equipe (quem pode receber tarefa): os administradores da marca, com nome
create or replace function public.org_equipe(p_marca text)
returns table (user_id uuid, nome text, email text)
language sql stable security definer set search_path to 'public' as $$
  select a.user_id,
         coalesce(nullif(btrim(c.nome), ''), nullif(btrim(u.raw_user_meta_data->>'nome'), ''), split_part(u.email, '@', 1)) as nome,
         regexp_replace(u.email, '\+marca-[a-z]+@', '@') as email
    from public.administradores a
    join auth.users u on u.id = a.user_id
    left join public.clientes c on c.user_id = a.user_id and c.marca = a.marca
   where a.marca = p_marca and public.teeds_sou_admin_da(p_marca)
   order by 2;
$$;
revoke all on function public.org_equipe(text) from public, anon;
grant execute on function public.org_equipe(text) to authenticated;

-- ao vivo para os outros administradores
do $$ begin
  begin alter publication supabase_realtime add table public.org_tarefas; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.org_marcos; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.org_comentarios; exception when duplicate_object then null; end;
end $$;
