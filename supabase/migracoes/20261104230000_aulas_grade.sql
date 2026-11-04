-- 04/11/2026 (Tiago): "criar módulos, assuntos, tópicos, aulas, descrições, subir o vídeo, ver a prévia antes
-- de salvar... tudo personalizável". A grade das aulas sai do código e passa a morar aqui, por marca:
--   rascunho  = o que o admin está montando (o aluno não vê)
--   publicada = o que a sala de aula mostra
-- Enquanto não houver grade publicada, a sala segue com o catálogo do código (modulosAulas.ts).
-- Cada publicação guarda uma cópia em aulas_grade_versoes, para voltar atrás.

create table if not exists public.aulas_grade (
  marca text primary key,
  rascunho jsonb,
  rascunho_em timestamptz,
  rascunho_por uuid,
  publicada jsonb,
  publicada_em timestamptz,
  publicada_por uuid
);
alter table public.aulas_grade enable row level security;
drop policy if exists "admin da marca gerencia a grade" on public.aulas_grade;
create policy "admin da marca gerencia a grade" on public.aulas_grade for all to authenticated
  using (public.teeds_sou_admin_da(marca)) with check (public.teeds_sou_admin_da(marca));

create table if not exists public.aulas_grade_versoes (
  id bigserial primary key,
  marca text not null,
  grade jsonb not null,
  nota text,
  criada_em timestamptz not null default now(),
  criada_por uuid
);
create index if not exists aulas_grade_versoes_marca on public.aulas_grade_versoes (marca, criada_em desc);
alter table public.aulas_grade_versoes enable row level security;
drop policy if exists "admin da marca ve as versoes" on public.aulas_grade_versoes;
create policy "admin da marca ve as versoes" on public.aulas_grade_versoes for select to authenticated
  using (public.teeds_sou_admin_da(marca));

-- a grade publicada, para a sala de aula de qualquer pessoa logada
create or replace function public.teeds_aulas_grade(p_marca text)
returns jsonb language sql stable security definer set search_path = public as $$
  select publicada from public.aulas_grade where marca = p_marca
$$;
revoke all on function public.teeds_aulas_grade(text) from public;
grant execute on function public.teeds_aulas_grade(text) to authenticated;

-- publicar: o rascunho vira a grade da sala, e a versão fica guardada
create or replace function public.teeds_aulas_publicar(p_marca text, p_grade jsonb, p_nota text default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_agora timestamptz := now();
begin
  if not public.teeds_sou_admin_da(p_marca) then raise exception 'Só o administrador publica as aulas.'; end if;
  if p_grade is null or jsonb_typeof(p_grade -> 'modulos') <> 'array' then raise exception 'Grade inválida.'; end if;
  insert into public.aulas_grade (marca, rascunho, rascunho_em, rascunho_por, publicada, publicada_em, publicada_por)
  values (p_marca, p_grade, v_agora, auth.uid(), p_grade, v_agora, auth.uid())
  on conflict (marca) do update set rascunho = excluded.rascunho, rascunho_em = v_agora, rascunho_por = auth.uid(),
    publicada = excluded.publicada, publicada_em = v_agora, publicada_por = auth.uid();
  insert into public.aulas_grade_versoes (marca, grade, nota, criada_por) values (p_marca, p_grade, nullif(btrim(coalesce(p_nota, '')), ''), auth.uid());
  return v_agora;
end $$;
revoke all on function public.teeds_aulas_publicar(text, jsonb, text) from public;
grant execute on function public.teeds_aulas_publicar(text, jsonb, text) to authenticated;
