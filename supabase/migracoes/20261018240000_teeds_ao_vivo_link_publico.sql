-- Fase de testes do ao vivo (18/10/2026): link público.
-- Com link_publico ligado, quem abre o link da live sem conta entra como
-- convidado (assiste e conversa, nada fica gravado). A função live-token lê
-- esta tabela com a chave de serviço. Para produção: desligar no estúdio
-- (ou update aovivo_config set link_publico = false where marca = '...').
create table if not exists public.aovivo_config (
  marca text primary key check (marca in ('teeds','omni','globalfly')),
  link_publico boolean not null default false,
  atualizado_em timestamptz not null default now()
);
alter table public.aovivo_config enable row level security;
create policy "todos leem config do ao vivo" on public.aovivo_config for select to anon, authenticated using (true);
create policy "admin muda config do ao vivo" on public.aovivo_config for all to authenticated
  using (public.teeds_sou_admin_da(marca)) with check (public.teeds_sou_admin_da(marca));
grant select on public.aovivo_config to anon, authenticated;
grant insert, update on public.aovivo_config to authenticated;
insert into public.aovivo_config (marca, link_publico) values ('globalfly', true)
  on conflict (marca) do update set link_publico = true, atualizado_em = now();
