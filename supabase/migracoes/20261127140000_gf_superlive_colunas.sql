-- Super Live 29/11/2026 (parte 1): marcas na ficha de inscrição e o controle da espera.
alter table public.clientes_pendentes add column if not exists superlive boolean not null default false;
alter table public.clientes_pendentes add column if not exists superlive_segura boolean not null default false;
create table if not exists public.superlive_controle (
  marca text primary key, inicio timestamptz not null, liberado_em timestamptz, liberado_por uuid);
alter table public.superlive_controle enable row level security;
insert into public.superlive_controle (marca, inicio) values ('globalfly','2026-11-29 23:00:00+00')
  on conflict (marca) do nothing;
