-- 23/10/2026 (Tiago): links relacionados em cada aula, além dos padrões da
-- marca (abrir conta, depositar, comunidade). [{nome, url}]
alter table public.aulas_videos add column if not exists links jsonb not null default '[]'::jsonb;
