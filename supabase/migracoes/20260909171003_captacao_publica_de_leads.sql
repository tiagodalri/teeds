-- Funil publico das landing pages de Teeds e OMNI.
-- A pagina nunca recebe a chave do banco: somente o motor grava. Administradores
-- enxergam exclusivamente os leads da marca que administram.
create table if not exists public.leads_capturados (
  id uuid primary key default gen_random_uuid(),
  marca text not null check (marca in ('teeds', 'omni')),
  nome text not null,
  email text not null,
  telefone text not null,
  email_normalizado text not null,
  telefone_normalizado text not null,
  campanha text, origem text, meio text, conteudo text, termo text, pagina text,
  tempo_na_pagina integer not null default 0 check (tempo_na_pagina between 0 and 86400),
  profundidade integer not null default 0 check (profundidade between 0 and 100),
  visitas integer not null default 1 check (visitas between 1 and 1000),
  temperatura text not null default 'morno' check (temperatura in ('frio','morno','quente')),
  pontuacao integer not null default 50 check (pontuacao between 0 and 100),
  consentiu_contato boolean not null default false,
  consentimento_versao text not null default '2026-09-09',
  convertido_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (marca, email_normalizado)
);
create index if not exists leads_capturados_marca_data_idx on public.leads_capturados (marca, convertido_em desc);
create index if not exists leads_capturados_marca_temperatura_idx on public.leads_capturados (marca, temperatura, pontuacao desc);
create index if not exists leads_capturados_campanha_idx on public.leads_capturados (marca, campanha, convertido_em desc);
alter table public.leads_capturados enable row level security;
drop policy if exists "admin desta marca ve leads" on public.leads_capturados;
create policy "admin desta marca ve leads" on public.leads_capturados for select to authenticated using (public.teeds_sou_admin_da(marca));
drop policy if exists "admin desta marca atualiza leads" on public.leads_capturados;
create policy "admin desta marca atualiza leads" on public.leads_capturados for update to authenticated using (public.teeds_sou_admin_da(marca)) with check (public.teeds_sou_admin_da(marca));
comment on table public.leads_capturados is 'Interessados captados pelas landing pages publicas, separados por marca. Escrita somente pelo servidor.';
