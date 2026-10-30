-- Tarefa completa na Organização (30/10/2026).
--
-- Pedido do Tiago: a janela de tarefa estava vaga. Agora a tarefa tem
--   * vários responsáveis (responsaveis uuid[]; "responsavel" segue como o
--     primeiro da lista, para o que já lê a coluna antiga);
--   * data de início, além do prazo (a abertura é o criado_em, que já existia);
--   * anexos (bucket privado "organizacao" + tabela org_anexos);
--   * histórico do que mudou (org_historico, gravado por gatilho: quem abriu,
--     quem moveu, quem trocou prazo, responsáveis e importância).
-- Subtarefas usam o checklist (jsonb), agora com responsável e prazo por item.

-- ------------------------------------------------------------- colunas novas
alter table public.org_tarefas add column if not exists responsaveis uuid[] not null default '{}';
alter table public.org_tarefas add column if not exists inicio date;
update public.org_tarefas set responsaveis = array[responsavel]
 where responsavel is not null and cardinality(responsaveis) = 0;
create index if not exists org_tarefas_responsaveis_idx on public.org_tarefas using gin (responsaveis);

-- "responsavel" acompanha a lista (e quem ainda grava só a coluna antiga também funciona)
create or replace function public.org_sincronizar_responsaveis() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    if cardinality(new.responsaveis) = 0 and new.responsavel is not null then
      new.responsaveis := array[new.responsavel];
    end if;
  elsif new.responsaveis is distinct from old.responsaveis then
    null;
  elsif new.responsavel is distinct from old.responsavel then
    new.responsaveis := case when new.responsavel is null then '{}'::uuid[]
                             else array[new.responsavel] || array_remove(old.responsaveis, new.responsavel) end;
  end if;
  -- sem repetidos, na ordem em que foram escolhidos
  new.responsaveis := coalesce((select array_agg(u order by i) from (
      select u, min(i) i from unnest(new.responsaveis) with ordinality as x(u, i) where u is not null group by u) s), '{}'::uuid[]);
  new.responsavel := new.responsaveis[1];
  return new;
end $$;
drop trigger if exists org_tarefas_responsaveis on public.org_tarefas;
create trigger org_tarefas_responsaveis before insert or update on public.org_tarefas
  for each row execute function public.org_sincronizar_responsaveis();

-- ------------------------------------------------------------- anexos
create table if not exists public.org_anexos (
  id         uuid primary key default gen_random_uuid(),
  tarefa_id  uuid not null references public.org_tarefas(id) on delete cascade,
  marca      text not null,
  nome       text not null check (length(btrim(nome)) between 1 and 200),
  caminho    text not null unique,
  tipo       text,
  tamanho    bigint not null default 0,
  autor      uuid references auth.users(id) on delete set null default auth.uid(),
  criado_em  timestamptz not null default now()
);
create index if not exists org_anexos_tarefa_idx on public.org_anexos (tarefa_id, criado_em);
alter table public.org_anexos enable row level security;
drop policy if exists org_anexos_equipe on public.org_anexos;
create policy org_anexos_equipe on public.org_anexos for all to authenticated
  using (public.teeds_sou_equipe_da(marca))
  with check (public.teeds_sou_equipe_da(marca) and split_part(caminho, '/', 1) = marca);

-- arquivos em organizacao/<marca>/<tarefa>/<id>-<nome>, até 25 MB
insert into storage.buckets (id, name, public, file_size_limit)
values ('organizacao', 'organizacao', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = 26214400;

drop policy if exists "organizacao: anexo (ler)" on storage.objects;
create policy "organizacao: anexo (ler)" on storage.objects for select to authenticated
  using (bucket_id = 'organizacao' and public.teeds_sou_equipe_da(split_part(name, '/', 1)));
drop policy if exists "organizacao: anexo (gravar)" on storage.objects;
create policy "organizacao: anexo (gravar)" on storage.objects for insert to authenticated
  with check (bucket_id = 'organizacao' and public.teeds_sou_equipe_da(split_part(name, '/', 1)));
drop policy if exists "organizacao: anexo (apagar)" on storage.objects;
create policy "organizacao: anexo (apagar)" on storage.objects for delete to authenticated
  using (bucket_id = 'organizacao' and public.teeds_sou_equipe_da(split_part(name, '/', 1)));

-- ------------------------------------------------------------- histórico
create table if not exists public.org_historico (
  id         uuid primary key default gen_random_uuid(),
  tarefa_id  uuid not null references public.org_tarefas(id) on delete cascade,
  marca      text not null,
  autor      uuid references auth.users(id) on delete set null,
  acao       text not null check (acao in ('criou','status','prazo','inicio','responsaveis','prioridade','area','titulo')),
  de         text,
  para       text,
  criado_em  timestamptz not null default now()
);
create index if not exists org_historico_tarefa_idx on public.org_historico (tarefa_id, criado_em);
alter table public.org_historico enable row level security;
drop policy if exists org_historico_leitura on public.org_historico;
create policy org_historico_leitura on public.org_historico for select to authenticated
  using (public.teeds_sou_equipe_da(marca));

create or replace function public.org_registrar() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare
  v_autor uuid := coalesce((select auth.uid()), new.criado_por);
begin
  if tg_op = 'INSERT' then
    insert into public.org_historico (tarefa_id, marca, autor, acao, para) values (new.id, new.marca, v_autor, 'criou', new.status);
    return null;
  end if;
  if new.status is distinct from old.status then
    insert into public.org_historico (tarefa_id, marca, autor, acao, de, para) values (new.id, new.marca, v_autor, 'status', old.status, new.status);
  end if;
  if new.prazo is distinct from old.prazo then
    insert into public.org_historico (tarefa_id, marca, autor, acao, de, para) values (new.id, new.marca, v_autor, 'prazo', old.prazo::text, new.prazo::text);
  end if;
  if new.inicio is distinct from old.inicio then
    insert into public.org_historico (tarefa_id, marca, autor, acao, de, para) values (new.id, new.marca, v_autor, 'inicio', old.inicio::text, new.inicio::text);
  end if;
  if new.responsaveis is distinct from old.responsaveis then
    insert into public.org_historico (tarefa_id, marca, autor, acao, de, para)
    values (new.id, new.marca, v_autor, 'responsaveis', array_to_string(old.responsaveis, ','), array_to_string(new.responsaveis, ','));
  end if;
  if new.prioridade is distinct from old.prioridade then
    insert into public.org_historico (tarefa_id, marca, autor, acao, de, para) values (new.id, new.marca, v_autor, 'prioridade', old.prioridade, new.prioridade);
  end if;
  if new.area is distinct from old.area then
    insert into public.org_historico (tarefa_id, marca, autor, acao, de, para) values (new.id, new.marca, v_autor, 'area', old.area, new.area);
  end if;
  if new.titulo is distinct from old.titulo then
    insert into public.org_historico (tarefa_id, marca, autor, acao, de, para) values (new.id, new.marca, v_autor, 'titulo', old.titulo, new.titulo);
  end if;
  return null;
end $$;
revoke all on function public.org_registrar() from public, anon, authenticated;
drop trigger if exists org_tarefas_historico on public.org_tarefas;
create trigger org_tarefas_historico after insert or update on public.org_tarefas
  for each row execute function public.org_registrar();

-- o que já existia ganha a linha "abriu", com a data e o autor de verdade
insert into public.org_historico (tarefa_id, marca, autor, acao, para, criado_em)
select t.id, t.marca, t.criado_por, 'criou', 'a_fazer', t.criado_em
  from public.org_tarefas t
 where not exists (select 1 from public.org_historico h where h.tarefa_id = t.id and h.acao = 'criou');

-- ------------------------------------------------------------- ao vivo
do $$ begin
  begin alter publication supabase_realtime add table public.org_anexos; exception when duplicate_object then null; end;
end $$;
