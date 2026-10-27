-- 27/10/2026 (Tiago): no login, além dos termos, a pessoa declara ter 18 anos ou mais. Fica no mesmo registro do aceite.
alter table public.termos_aceites_eventos add column if not exists declarou_maioridade boolean not null default false;
