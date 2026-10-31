-- 31/10/2026: escopo do Victor Dias para a Central ao vivo (áudios de 30/10).
--
-- 1. Transmissão de teste: um link privado. Só quem tem o link entra (com a
--    conta), numa sala do LiveKit só dela, e ninguém é avisado: nada de selo
--    vermelho nem "Live iniciada" para os membros.
-- 2. Em quais plataformas a live abre: Victor Cordeiro (/v), Naor Bezerra (/n)
--    e/ou direto. Só os membros das plataformas escolhidas veem o aviso de
--    ao vivo e entram na sala.
-- 3. Histórico das transmissões: quantas pessoas, pico, tempo médio e
--    mensagens de cada live (antes, os números sumiam ao fechar a aba).

-- ------------------------------------------------------------ 1. teste
create table if not exists public.aovivo_testes (
  codigo text primary key,
  marca text not null,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '12 hours'
);
alter table public.aovivo_testes enable row level security;
drop policy if exists "equipe ve testes" on public.aovivo_testes;
create policy "equipe ve testes" on public.aovivo_testes for select to authenticated using (public.teeds_sou_equipe_da(marca));

-- Cria o link de teste (vale 12 h). Só a equipe da marca.
create or replace function public.teeds_criar_teste_ao_vivo(p_marca text)
returns text language plpgsql security definer set search_path = public as $$
declare v_codigo text;
begin
  if not public.teeds_sou_equipe_da(p_marca) then raise exception 'Só a equipe cria a transmissão de teste'; end if;
  v_codigo := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  insert into public.aovivo_testes (codigo, marca) values (v_codigo, p_marca);
  delete from public.aovivo_testes where expira_em < now() - interval '7 days';
  return v_codigo;
end $$;
revoke all on function public.teeds_criar_teste_ao_vivo(text) from public, anon;
grant execute on function public.teeds_criar_teste_ao_vivo(text) to authenticated;

-- ------------------------------------------------------ 2. plataformas
alter table public.treino_no_ar add column if not exists vitrines text[];

drop function if exists public.teeds_treino_pulso(text, boolean, text);
create or replace function public.teeds_treino_pulso(p_marca text, p_no_ar boolean, p_apresentador text default null, p_vitrines text[] default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.teeds_sou_equipe_da(p_marca) then raise exception 'Só o administrador transmite na sala de treino'; end if;
  if p_no_ar then
    insert into public.treino_no_ar (marca, apresentador, iniciada_em, visto_em, vitrines)
    values (p_marca, left(nullif(trim(p_apresentador), ''), 60), now(), now(), p_vitrines)
    on conflict (marca) do update
      set visto_em = now(),
          vitrines = excluded.vitrines,
          apresentador = coalesce(excluded.apresentador, public.treino_no_ar.apresentador),
          iniciada_em = case when public.treino_no_ar.visto_em < now() - interval '75 seconds'
                             then now() else public.treino_no_ar.iniciada_em end;
  else
    delete from public.treino_no_ar where marca = p_marca;
  end if;
end $$;
revoke all on function public.teeds_treino_pulso(text, boolean, text, text[]) from public, anon;
grant execute on function public.teeds_treino_pulso(text, boolean, text, text[]) to authenticated;

-- A plataforma de quem pergunta: a do endereço que ela abriu; sem endereço, a da conta; sem nada, "direto".
create or replace function public.teeds_minha_vitrine_ao_vivo(p_marca text, p_vitrine text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(trim(p_vitrine), ''),
    (select nullif(c.parceiro, '') from public.clientes c where c.user_id = (select auth.uid()) and c.marca = p_marca limit 1),
    'direto');
$$;

drop function if exists public.teeds_treino_agora(text);
create or replace function public.teeds_treino_agora(p_marca text, p_vitrine text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('iniciadaEm', t.iniciada_em, 'apresentador', t.apresentador, 'vitrines', t.vitrines)
    from public.treino_no_ar t
   where t.marca = p_marca and t.visto_em > now() - interval '75 seconds'
     and public.teeds_minha_sala_de_treino(p_marca)
     and (t.vitrines is null or public.teeds_sou_equipe_da(p_marca)
          or public.teeds_minha_vitrine_ao_vivo(p_marca, p_vitrine) = any (t.vitrines));
$$;
revoke all on function public.teeds_treino_agora(text, text) from public, anon;
grant execute on function public.teeds_treino_agora(text, text) to authenticated;

-- Os nomes das plataformas para a equipe escolher (o Victor só lê a linha dele em `parceiros`).
create or replace function public.teeds_plataformas_ao_vivo(p_marca text)
returns table (codigo text, nome text) language sql stable security definer set search_path = public as $$
  select p.codigo, p.nome from public.parceiros p
   where p.marca = p_marca and p.ativo and public.teeds_sou_equipe_da(p_marca)
   order by p.nome;
$$;
revoke all on function public.teeds_plataformas_ao_vivo(text) from public, anon;
grant execute on function public.teeds_plataformas_ao_vivo(text) to authenticated;

-- ------------------------------------------------------- 3. histórico
create table if not exists public.transmissoes (
  id uuid primary key default gen_random_uuid(),
  marca text not null,
  apresentador text,
  teste boolean not null default false,
  vitrines text[],
  iniciada_em timestamptz not null default now(),
  encerrada_em timestamptz,
  pico integer not null default 0,
  pessoas integer not null default 0,
  tempo_medio_s integer not null default 0,
  mensagens integer not null default 0,
  -- [{ "id": identidade, "nome": primeiro nome, "segundos": tempo na sala, "entradas": vezes que entrou }]
  presencas jsonb not null default '[]'::jsonb,
  criada_por uuid default auth.uid(),
  atualizada_em timestamptz not null default now()
);
create index if not exists transmissoes_marca_idx on public.transmissoes (marca, iniciada_em desc);
alter table public.transmissoes enable row level security;
drop policy if exists "equipe le transmissoes" on public.transmissoes;
create policy "equipe le transmissoes" on public.transmissoes for select to authenticated using (public.teeds_sou_equipe_da(marca));
drop policy if exists "equipe grava transmissoes" on public.transmissoes;
create policy "equipe grava transmissoes" on public.transmissoes for insert to authenticated with check (public.teeds_sou_equipe_da(marca));
drop policy if exists "equipe atualiza transmissoes" on public.transmissoes;
create policy "equipe atualiza transmissoes" on public.transmissoes for update to authenticated using (public.teeds_sou_equipe_da(marca)) with check (public.teeds_sou_equipe_da(marca));
drop policy if exists "equipe apaga transmissoes" on public.transmissoes;
create policy "equipe apaga transmissoes" on public.transmissoes for delete to authenticated using (public.teeds_sou_equipe_da(marca));
grant select, insert, update, delete on public.transmissoes to authenticated;
