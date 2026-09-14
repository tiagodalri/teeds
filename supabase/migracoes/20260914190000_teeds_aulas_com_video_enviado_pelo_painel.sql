-- As aulas ganham vídeo de verdade, enviado pelo painel — por marca.
--
-- Até aqui o catálogo de aulas vivia inteiro no código (src/core/teeds/aulas.ts):
-- título, descrição e um campo `video` vazio, que fazia a aula aparecer como
-- "Vídeo demonstrativo". Trocar um vídeo era editar código e publicar o site.
--
-- Agora o catálogo (ordem, módulos, títulos, capas) continua no código, e o
-- que muda com frequência — o vídeo, a duração e, se quiser, o texto — mora
-- nesta tabela, uma linha por marca e por aula. O painel de administração
-- grava aqui; a tela de Aulas lê e sobrepõe ao catálogo.
--
-- Uma aula da OMNI e a mesma aula da Teeds são linhas diferentes: cada marca
-- tem o seu vídeo (a Teeds não vai mostrar um vídeo com a cara da OMNI).
--
-- Aplicada em 14/09/2026 pelo MCP do Supabase (migração
-- `teeds_aulas_com_video_enviado_pelo_painel`); esta é a cópia da receita.

create table if not exists public.aulas_videos (
  marca          text not null check (marca in ('teeds', 'omni')),
  aula_id        text not null,
  video          text not null default '',
  duracao        text not null default '',
  titulo         text,
  descricao      text,
  publicado      boolean not null default true,
  arquivo        text,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid,
  primary key (marca, aula_id)
);
comment on table public.aulas_videos is
  'O vídeo (e opcionalmente o texto) de cada aula, por marca. O catálogo de aulas mora no código; aqui fica o que o painel troca.';
alter table public.aulas_videos enable row level security;
drop policy if exists "logados veem aulas publicadas" on public.aulas_videos;
create policy "logados veem aulas publicadas" on public.aulas_videos
  for select to authenticated using (publicado or public.teeds_sou_admin_da(marca));
drop policy if exists "admin da marca gerencia aulas" on public.aulas_videos;
create policy "admin da marca gerencia aulas" on public.aulas_videos
  for all to authenticated using (public.teeds_sou_admin_da(marca)) with check (public.teeds_sou_admin_da(marca));

-- O bucket dos arquivos: leitura pública (o player abre o .mp4 direto);
-- escrita só do admin da marca, dentro da pasta da própria marca.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aulas', 'aulas', true, 1073741824, array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "aulas: qualquer um assiste" on storage.objects;
create policy "aulas: qualquer um assiste" on storage.objects for select to public using (bucket_id = 'aulas');
drop policy if exists "aulas: admin da marca envia" on storage.objects;
create policy "aulas: admin da marca envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'aulas' and public.teeds_sou_admin_da((storage.foldername(name))[1]));
drop policy if exists "aulas: admin da marca substitui" on storage.objects;
create policy "aulas: admin da marca substitui" on storage.objects for update to authenticated
  using (bucket_id = 'aulas' and public.teeds_sou_admin_da((storage.foldername(name))[1]))
  with check (bucket_id = 'aulas' and public.teeds_sou_admin_da((storage.foldername(name))[1]));
drop policy if exists "aulas: admin da marca apaga" on storage.objects;
create policy "aulas: admin da marca apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'aulas' and public.teeds_sou_admin_da((storage.foldername(name))[1]));
