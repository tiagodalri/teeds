-- Aceite dos termos (27/10/2026, Tiago: "no primeiro acesso a pessoa sempre
-- precisa concordar com os termos de uso. Obrigatório.").
--
-- Uma linha por pessoa, marca e versão dos termos: é a prova do aceite. Mudou a
-- versão (src/core/teeds/termos.ts), todo mundo aceita de novo no próximo acesso.
-- O próprio usuário só grava e lê o dele; não há update nem delete pelo site.

create table if not exists public.termos_aceites (
  user_id     uuid not null references auth.users(id) on delete cascade,
  marca       text not null,
  versao      text not null,
  aceito_em   timestamptz not null default now(),
  documentos  text[] not null default '{}',
  user_agent  text,
  primary key (user_id, marca, versao)
);
alter table public.termos_aceites enable row level security;

drop policy if exists "aceite: o próprio grava" on public.termos_aceites;
create policy "aceite: o próprio grava" on public.termos_aceites for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "aceite: o próprio lê, o admin geral da marca também" on public.termos_aceites;
create policy "aceite: o próprio lê, o admin geral da marca também" on public.termos_aceites for select to authenticated
  using (user_id = (select auth.uid()) or marca = any((select public.teeds_marcas_admin_total())::text[]));

revoke update, delete on public.termos_aceites from anon, authenticated;
grant select, insert on public.termos_aceites to authenticated;
