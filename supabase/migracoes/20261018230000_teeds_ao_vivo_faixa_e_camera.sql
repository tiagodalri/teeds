-- Painel de controle da live (18/10/2026): letreiro sobre o vídeo (faixa,
-- como na TV) e tamanho do rosto do apresentador. Ficam na live para quem
-- entra no meio já ver certo.
alter table public.lives add column if not exists faixa text check (faixa is null or char_length(faixa) <= 120);
alter table public.lives add column if not exists camera_tamanho text not null default 'm' check (camera_tamanho in ('p','m','g'));
