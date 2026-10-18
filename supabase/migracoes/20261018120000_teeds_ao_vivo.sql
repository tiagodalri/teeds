-- Transmissão ao vivo dentro da plataforma (18/10/2026, começa pela GlobalFly).
--
-- O vídeo e o chat em tempo real passam pelo LiveKit (WebRTC, atraso de
-- frações de segundo). O banco guarda o que precisa durar:
--   lives            a agenda e o estado de cada transmissão (é o que acende
--                    o "Ao vivo" no menu de todo mundo);
--   live_mensagens   o histórico do chat (quem entra no meio vê o que já foi
--                    dito) e a moderação (fixar, apagar);
--   live_silenciados quem o moderador calou nesta live.
-- O token de entrada na sala é emitido pela função `live-token`, que confere
-- aqui se a pessoa é cliente ou admin da marca.

create table if not exists public.lives (
  id uuid primary key default gen_random_uuid(),
  marca text not null check (marca in ('teeds','omni','globalfly')),
  titulo text not null check (char_length(titulo) between 1 and 120),
  descricao text check (descricao is null or char_length(descricao) <= 600),
  status text not null default 'agendada' check (status in ('agendada','ao_vivo','encerrada')),
  -- nome da sala no LiveKit; uma por live, para o histórico não misturar
  sala text not null unique default ('live-' || replace(gen_random_uuid()::text, '-', '')),
  inicio_previsto timestamptz,
  iniciada_em timestamptz,
  encerrada_em timestamptz,
  -- modo lento do chat: segundos entre duas mensagens da mesma pessoa (0 = livre)
  intervalo_chat integer not null default 0 check (intervalo_chat between 0 and 300),
  criado_por uuid references auth.users(id) on delete set null default auth.uid(),
  criada_em timestamptz not null default now()
);
create index if not exists lives_marca_status on public.lives (marca, status, inicio_previsto);
-- Uma live no ar por marca, no máximo.
create unique index if not exists lives_uma_no_ar on public.lives (marca) where status = 'ao_vivo';

create table if not exists public.live_mensagens (
  id uuid primary key default gen_random_uuid(),
  live_id uuid not null references public.lives(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 60),
  texto text not null check (char_length(btrim(texto)) between 1 and 500),
  do_moderador boolean not null default false,
  fixada boolean not null default false,
  apagada boolean not null default false,
  criada_em timestamptz not null default now()
);
create index if not exists live_mensagens_live on public.live_mensagens (live_id, criada_em desc);

create table if not exists public.live_silenciados (
  live_id uuid not null references public.lives(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  por uuid default auth.uid(),
  em timestamptz not null default now(),
  primary key (live_id, user_id)
);

alter table public.lives enable row level security;
alter table public.live_mensagens enable row level security;
alter table public.live_silenciados enable row level security;

-- Quem pode ver a live: admin da marca ou cliente ativo dela.
create or replace function public.teeds_pode_assistir(p_marca text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.teeds_sou_admin_da(p_marca) or exists (
    select 1 from public.clientes c
    where c.user_id = (select auth.uid()) and c.marca = p_marca
      and coalesce(c.status_acesso, 'ativo') = 'ativo'
  );
$$;
grant execute on function public.teeds_pode_assistir(text) to authenticated;

-- lives: lê quem pode assistir; cria, muda e apaga o admin da marca.
drop policy if exists "assiste le lives" on public.lives;
create policy "assiste le lives" on public.lives for select to authenticated
  using (public.teeds_pode_assistir(marca));
drop policy if exists "admin gerencia lives" on public.lives;
create policy "admin gerencia lives" on public.lives for all to authenticated
  using (public.teeds_sou_admin_da(marca)) with check (public.teeds_sou_admin_da(marca));

-- mensagens: lê quem pode assistir a live; escreve o próprio nome, só com a
-- live no ar e sem estar silenciado; fixar/apagar é do admin.
drop policy if exists "assiste le mensagens" on public.live_mensagens;
create policy "assiste le mensagens" on public.live_mensagens for select to authenticated
  using (exists (select 1 from public.lives l where l.id = live_id and public.teeds_pode_assistir(l.marca)));
drop policy if exists "escreve no chat" on public.live_mensagens;
create policy "escreve no chat" on public.live_mensagens for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and fixada = false and apagada = false
    and exists (
      select 1 from public.lives l
      where l.id = live_id and l.status = 'ao_vivo' and public.teeds_pode_assistir(l.marca)
        and (do_moderador = false or public.teeds_sou_admin_da(l.marca))
    )
    and not exists (select 1 from public.live_silenciados s where s.live_id = live_mensagens.live_id and s.user_id = (select auth.uid()))
  );
drop policy if exists "admin modera mensagens" on public.live_mensagens;
create policy "admin modera mensagens" on public.live_mensagens for update to authenticated
  using (exists (select 1 from public.lives l where l.id = live_id and public.teeds_sou_admin_da(l.marca)))
  with check (exists (select 1 from public.lives l where l.id = live_id and public.teeds_sou_admin_da(l.marca)));

drop policy if exists "assiste ve silenciados" on public.live_silenciados;
create policy "assiste ve silenciados" on public.live_silenciados for select to authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from public.lives l where l.id = live_id and public.teeds_sou_admin_da(l.marca)));
drop policy if exists "admin silencia" on public.live_silenciados;
create policy "admin silencia" on public.live_silenciados for all to authenticated
  using (exists (select 1 from public.lives l where l.id = live_id and public.teeds_sou_admin_da(l.marca)))
  with check (exists (select 1 from public.lives l where l.id = live_id and public.teeds_sou_admin_da(l.marca)));

-- Modo lento: a mesma pessoa não manda outra mensagem antes do intervalo da
-- live. O moderador não tem limite.
create or replace function public.teeds_live_modo_lento()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_intervalo integer; v_ultima timestamptz; v_marca text;
begin
  select intervalo_chat, marca into v_intervalo, v_marca from public.lives where id = new.live_id;
  if coalesce(v_intervalo, 0) = 0 or public.teeds_sou_admin_da(v_marca) then return new; end if;
  select max(criada_em) into v_ultima from public.live_mensagens
   where live_id = new.live_id and user_id = new.user_id;
  if v_ultima is not null and v_ultima > now() - make_interval(secs => v_intervalo) then
    raise exception 'modo lento: espere % segundos entre mensagens', v_intervalo using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists live_mensagens_modo_lento on public.live_mensagens;
create trigger live_mensagens_modo_lento before insert on public.live_mensagens
  for each row execute function public.teeds_live_modo_lento();

grant select, insert, update, delete on public.lives to authenticated;
grant select, insert, update on public.live_mensagens to authenticated;
grant select, insert, delete on public.live_silenciados to authenticated;

-- A função do gatilho não é chamada por ninguém de fora; a de "pode assistir"
-- só por quem está logado.
revoke execute on function public.teeds_live_modo_lento() from public, anon, authenticated;
revoke execute on function public.teeds_pode_assistir(text) from public, anon;
