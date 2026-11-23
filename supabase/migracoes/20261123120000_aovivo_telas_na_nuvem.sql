-- Painel da sala de treino (23/11/2026): as telas da live ficam na nuvem, por marca.
-- Antes ficavam só no navegador de quem montou; outro administrador via as telas padrão.
-- Lê e grava só quem é da equipe da marca (teeds_sou_equipe_da). As fotos e vídeos das
-- telas vão para o bucket público `aovivo` (os alunos já veem tudo na transmissão).

create table if not exists public.aovivo_telas (
  marca text primary key,
  config jsonb not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  atualizado_nome text
);

alter table public.aovivo_telas enable row level security;

drop policy if exists "aovivo_telas: equipe lê" on public.aovivo_telas;
create policy "aovivo_telas: equipe lê" on public.aovivo_telas for select using (public.teeds_sou_equipe_da(marca));
drop policy if exists "aovivo_telas: equipe cria" on public.aovivo_telas;
create policy "aovivo_telas: equipe cria" on public.aovivo_telas for insert with check (public.teeds_sou_equipe_da(marca));
drop policy if exists "aovivo_telas: equipe muda" on public.aovivo_telas;
create policy "aovivo_telas: equipe muda" on public.aovivo_telas for update using (public.teeds_sou_equipe_da(marca)) with check (public.teeds_sou_equipe_da(marca));

grant select, insert, update on public.aovivo_telas to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aovivo', 'aovivo', true, 314572800, array['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "aovivo: qualquer um vê" on storage.objects;
create policy "aovivo: qualquer um vê" on storage.objects for select using (bucket_id = 'aovivo');
drop policy if exists "aovivo: equipe da marca envia" on storage.objects;
create policy "aovivo: equipe da marca envia" on storage.objects for insert with check (bucket_id = 'aovivo' and public.teeds_sou_equipe_da((storage.foldername(name))[1]));
drop policy if exists "aovivo: equipe da marca substitui" on storage.objects;
create policy "aovivo: equipe da marca substitui" on storage.objects for update using (bucket_id = 'aovivo' and public.teeds_sou_equipe_da((storage.foldername(name))[1])) with check (bucket_id = 'aovivo' and public.teeds_sou_equipe_da((storage.foldername(name))[1]));
drop policy if exists "aovivo: equipe da marca apaga" on storage.objects;
create policy "aovivo: equipe da marca apaga" on storage.objects for delete using (bucket_id = 'aovivo' and public.teeds_sou_equipe_da((storage.foldername(name))[1]));
