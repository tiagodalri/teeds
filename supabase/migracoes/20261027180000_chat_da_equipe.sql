-- Chat da equipe (27/10/2026, Tiago: "um chat interno, como se fosse um
-- WhatsApp... é só para os administradores se conversarem").
--
-- Cada marca tem o seu: na GlobalFly conversam Tiago, Victor Cordeiro, Victor
-- Dias e Naor. Há o grupo da equipe (todos os administradores da marca entram
-- sozinhos) e as conversas diretas, de duas pessoas. Cliente nenhum enxerga:
-- tudo passa por equipe_participo(), que exige ser administrador DAQUELA marca
-- (o admin da Teeds não lê o chat da GlobalFly) e participante da conversa.
-- As mensagens chegam ao vivo pelo Realtime; os prints ficam no bucket
-- privado "equipe", na pasta da conversa.

create table if not exists public.equipe_conversas (
  id            uuid primary key default gen_random_uuid(),
  marca         text not null,
  tipo          text not null check (tipo in ('grupo', 'direta')),
  -- 'grupo:<marca>' ou 'direta:<marca>:<uid menor>:<uid maior>': uma conversa só por par
  chave         text not null unique,
  criado_em     timestamptz not null default now(),
  ultima_em     timestamptz,
  ultima_texto  text,
  ultima_autor  uuid
);
create index if not exists equipe_conversas_marca_idx on public.equipe_conversas (marca, ultima_em desc);

create table if not exists public.equipe_participantes (
  conversa_id uuid not null references public.equipe_conversas(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  marca       text not null,
  -- até onde a pessoa leu (os dois tiques dourados saem daqui)
  lida_em     timestamptz not null default now(),
  primary key (conversa_id, user_id)
);
create index if not exists equipe_participantes_user_idx on public.equipe_participantes (user_id, marca);

create table if not exists public.equipe_mensagens (
  id          uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.equipe_conversas(id) on delete cascade,
  marca       text not null,
  autor       uuid references auth.users(id) on delete set null default auth.uid(),
  texto       text not null default '' check (length(texto) <= 4000),
  anexo       text,
  resposta_a  uuid references public.equipe_mensagens(id) on delete set null,
  apagada     boolean not null default false,
  criado_em   timestamptz not null default now(),
  check (apagada or length(btrim(texto)) > 0 or anexo is not null)
);
create index if not exists equipe_mensagens_conversa_idx on public.equipe_mensagens (conversa_id, criado_em desc);

-- "online agora" / "visto por último": o navegador avisa a cada minuto enquanto está aberto
create table if not exists public.equipe_presenca (
  user_id  uuid not null references auth.users(id) on delete cascade,
  marca    text not null,
  visto_em timestamptz not null default now(),
  primary key (user_id, marca)
);

-- ------------------------------------------------------------- quem pode
create or replace function public.equipe_sou_da(p_marca text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.administradores a where a.user_id = (select auth.uid()) and a.marca = p_marca);
$$;

create or replace function public.equipe_participo(p_conversa uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.equipe_participantes p
      join public.equipe_conversas c on c.id = p.conversa_id
      join public.administradores a on a.user_id = p.user_id and a.marca = c.marca
     where p.conversa_id = p_conversa and p.user_id = (select auth.uid())
  );
$$;

-- o print mora em <marca>/<conversa>/<arquivo>
create or replace function public.equipe_pode_anexo(p_nome text)
returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare v_conversa uuid;
begin
  begin v_conversa := split_part(p_nome, '/', 2)::uuid; exception when others then return false; end;
  return public.equipe_participo(v_conversa)
     and exists (select 1 from public.equipe_conversas c where c.id = v_conversa and c.marca = split_part(p_nome, '/', 1));
end $$;

revoke all on function public.equipe_sou_da(text), public.equipe_participo(uuid), public.equipe_pode_anexo(text) from public, anon;
grant execute on function public.equipe_sou_da(text), public.equipe_participo(uuid), public.equipe_pode_anexo(text) to authenticated;

alter table public.equipe_conversas enable row level security;
alter table public.equipe_participantes enable row level security;
alter table public.equipe_mensagens enable row level security;
alter table public.equipe_presenca enable row level security;

drop policy if exists equipe_conversas_ler on public.equipe_conversas;
create policy equipe_conversas_ler on public.equipe_conversas for select to authenticated using (public.equipe_participo(id));
drop policy if exists equipe_participantes_ler on public.equipe_participantes;
create policy equipe_participantes_ler on public.equipe_participantes for select to authenticated using (public.equipe_participo(conversa_id));
drop policy if exists equipe_mensagens_ler on public.equipe_mensagens;
create policy equipe_mensagens_ler on public.equipe_mensagens for select to authenticated using (public.equipe_participo(conversa_id));
drop policy if exists equipe_mensagens_mandar on public.equipe_mensagens;
create policy equipe_mensagens_mandar on public.equipe_mensagens for insert to authenticated
  with check (public.equipe_participo(conversa_id) and autor = (select auth.uid()) and not apagada);
-- presença, conversas e participantes só mudam pelas funções abaixo

-- ------------------------------------------------------------- ao mandar
create or replace function public.equipe_ao_mandar() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_original public.equipe_mensagens;
begin
  select c.marca into new.marca from public.equipe_conversas c where c.id = new.conversa_id;
  new.autor := auth.uid();
  new.criado_em := now();
  new.texto := btrim(new.texto);
  if new.resposta_a is not null then
    select * into v_original from public.equipe_mensagens m where m.id = new.resposta_a;
    if v_original.conversa_id is distinct from new.conversa_id then new.resposta_a := null; end if;
  end if;
  return new;
end $$;
drop trigger if exists equipe_mensagens_antes on public.equipe_mensagens;
create trigger equipe_mensagens_antes before insert on public.equipe_mensagens
  for each row execute function public.equipe_ao_mandar();

create or replace function public.equipe_depois_de_mandar() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  update public.equipe_conversas
     set ultima_em = new.criado_em,
         ultima_texto = case when new.apagada then null when new.texto <> '' then left(new.texto, 140) else 'Imagem' end,
         ultima_autor = new.autor
   where id = new.conversa_id;
  -- quem manda já leu tudo até ali
  update public.equipe_participantes set lida_em = greatest(lida_em, new.criado_em)
   where conversa_id = new.conversa_id and user_id = new.autor;
  return null;
end $$;
drop trigger if exists equipe_mensagens_depois on public.equipe_mensagens;
create trigger equipe_mensagens_depois after insert on public.equipe_mensagens
  for each row execute function public.equipe_depois_de_mandar();

-- ------------------------------------------------------------- funções da tela
-- Abre o chat: garante o grupo da equipe com todos os administradores da marca e marca presença.
create or replace function public.equipe_abrir(p_marca text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_grupo uuid;
begin
  if not public.equipe_sou_da(p_marca) then raise exception 'Só administradores da marca usam o chat da equipe.' using errcode = '42501'; end if;
  insert into public.equipe_conversas (marca, tipo, chave) values (p_marca, 'grupo', 'grupo:' || p_marca)
    on conflict (chave) do nothing;
  select id into v_grupo from public.equipe_conversas where chave = 'grupo:' || p_marca;
  insert into public.equipe_participantes (conversa_id, user_id, marca, lida_em)
    select v_grupo, a.user_id, p_marca, now() from public.administradores a where a.marca = p_marca
    on conflict do nothing;
  insert into public.equipe_presenca (user_id, marca, visto_em) values (auth.uid(), p_marca, now())
    on conflict (user_id, marca) do update set visto_em = now();
  return v_grupo;
end $$;

-- Os administradores da marca, com nome e quando foram vistos.
create or replace function public.equipe_contatos(p_marca text)
returns table (user_id uuid, nome text, visto_em timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select a.user_id,
         coalesce(nullif(btrim(c.nome), ''), nullif(btrim(u.raw_user_meta_data->>'nome'), ''), split_part(u.email, '@', 1)),
         pr.visto_em
    from public.administradores a
    join auth.users u on u.id = a.user_id
    left join public.clientes c on c.user_id = a.user_id and c.marca = a.marca
    left join public.equipe_presenca pr on pr.user_id = a.user_id and pr.marca = a.marca
   where a.marca = p_marca and public.equipe_sou_da(p_marca)
   order by 2;
$$;

-- A conversa direta com outro administrador (cria na primeira vez).
create or replace function public.equipe_direta(p_marca text, p_outro uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_eu uuid := auth.uid(); v_chave text; v_id uuid;
begin
  if not public.equipe_sou_da(p_marca) then raise exception 'Só administradores da marca usam o chat da equipe.' using errcode = '42501'; end if;
  if p_outro = v_eu or not exists (select 1 from public.administradores a where a.user_id = p_outro and a.marca = p_marca) then
    raise exception 'Essa pessoa não faz parte da equipe.' using errcode = '22023';
  end if;
  v_chave := 'direta:' || p_marca || ':' || least(v_eu, p_outro)::text || ':' || greatest(v_eu, p_outro)::text;
  insert into public.equipe_conversas (marca, tipo, chave) values (p_marca, 'direta', v_chave) on conflict (chave) do nothing;
  select id into v_id from public.equipe_conversas where chave = v_chave;
  insert into public.equipe_participantes (conversa_id, user_id, marca, lida_em)
    values (v_id, v_eu, p_marca, now()), (v_id, p_outro, p_marca, now())
    on conflict do nothing;
  return v_id;
end $$;

-- Li até agora.
create or replace function public.equipe_ler(p_conversa uuid)
returns void language sql security definer set search_path to 'public' as $$
  update public.equipe_participantes set lida_em = now()
   where conversa_id = p_conversa and user_id = (select auth.uid()) and public.equipe_participo(p_conversa);
$$;

-- Estou com a plataforma aberta (a cada minuto).
create or replace function public.equipe_estou_aqui(p_marca text)
returns void language sql security definer set search_path to 'public' as $$
  insert into public.equipe_presenca (user_id, marca, visto_em)
    select (select auth.uid()), p_marca, now() where public.equipe_sou_da(p_marca)
    on conflict (user_id, marca) do update set visto_em = now();
$$;

-- Apagar para todos: só a própria mensagem. Devolve o print, para sair do armazenamento.
create or replace function public.equipe_apagar(p_mensagem uuid)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v public.equipe_mensagens;
begin
  select * into v from public.equipe_mensagens where id = p_mensagem;
  if v.id is null or v.autor is distinct from auth.uid() or not public.equipe_participo(v.conversa_id) then
    raise exception 'Só dá para apagar as suas mensagens.' using errcode = '42501';
  end if;
  update public.equipe_mensagens set apagada = true, texto = '', anexo = null where id = p_mensagem;
  update public.equipe_conversas c set ultima_texto = null
   where c.id = v.conversa_id and c.ultima_em = v.criado_em;
  return v.anexo;
end $$;

revoke all on function public.equipe_abrir(text), public.equipe_contatos(text), public.equipe_direta(text, uuid),
  public.equipe_ler(uuid), public.equipe_estou_aqui(text), public.equipe_apagar(uuid) from public, anon;
grant execute on function public.equipe_abrir(text), public.equipe_contatos(text), public.equipe_direta(text, uuid),
  public.equipe_ler(uuid), public.equipe_estou_aqui(text), public.equipe_apagar(uuid) to authenticated;

-- Quantas mensagens dos outros eu ainda não li, por conversa.
create or replace function public.equipe_nao_lidas(p_marca text)
returns table (conversa_id uuid, n integer)
language sql stable security definer set search_path to 'public' as $$
  select p.conversa_id, count(m.id)::int
    from public.equipe_participantes p
    join public.equipe_mensagens m on m.conversa_id = p.conversa_id and m.criado_em > p.lida_em
         and m.autor is distinct from p.user_id and not m.apagada
   where p.user_id = (select auth.uid()) and p.marca = p_marca and public.equipe_sou_da(p_marca)
   group by p.conversa_id;
$$;
revoke all on function public.equipe_nao_lidas(text) from public, anon;
grant execute on function public.equipe_nao_lidas(text) to authenticated;

-- ------------------------------------------------------------- prints
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('equipe', 'equipe', false, 3145728, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = 3145728, allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png'];

drop policy if exists "equipe: print (ler)" on storage.objects;
create policy "equipe: print (ler)" on storage.objects for select to authenticated
  using (bucket_id = 'equipe' and public.equipe_pode_anexo(name));
drop policy if exists "equipe: print (gravar)" on storage.objects;
create policy "equipe: print (gravar)" on storage.objects for insert to authenticated
  with check (bucket_id = 'equipe' and public.equipe_pode_anexo(name));
drop policy if exists "equipe: print (apagar)" on storage.objects;
create policy "equipe: print (apagar)" on storage.objects for delete to authenticated
  using (bucket_id = 'equipe' and owner = (select auth.uid()));

-- ------------------------------------------------------------- ao vivo
do $$ begin
  begin alter publication supabase_realtime add table public.equipe_mensagens; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.equipe_participantes; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.equipe_conversas; exception when duplicate_object then null; end;
end $$;
