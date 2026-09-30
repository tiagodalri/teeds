-- Eventos mínimos do Resend. Sem corpo, senhas, IPs ou links de acesso.
begin;
set local lock_timeout = '5s';
create table public.email_eventos_resend (
  evento_id text primary key check (length(evento_id) between 1 and 200),
  email_id uuid not null,
  marca text not null check (marca in ('teeds','omni')),
  tipo text not null check (tipo in ('sent','delivered','opened','clicked','bounced','complained','failed','delivery_delayed','suppressed','scheduled')),
  ocorrido_em timestamptz not null,
  recebido_em timestamptz not null default now()
);
create index email_eventos_marca_email on public.email_eventos_resend(marca,email_id,ocorrido_em);
alter table public.email_eventos_resend enable row level security;
revoke all on public.email_eventos_resend from public, anon, authenticated;
grant select, insert on public.email_eventos_resend to service_role;
create policy somente_servidor on public.email_eventos_resend for all to service_role using (true) with check (true);
create view public.email_eventos_resumo with (security_invoker=true) as
select marca,email_id,
  min(ocorrido_em) filter (where tipo='delivered') as entregue_em,
  min(ocorrido_em) filter (where tipo='opened') as aberto_em,
  max(ocorrido_em) filter (where tipo='opened') as ultima_abertura_em,
  count(*) filter (where tipo='opened') as aberturas,
  min(ocorrido_em) filter (where tipo='clicked') as clicado_em,
  max(ocorrido_em) filter (where tipo='clicked') as ultimo_clique_em,
  count(*) filter (where tipo='clicked') as cliques,
  max(ocorrido_em) as ultimo_evento_em,
  (array_agg(tipo order by ocorrido_em desc,evento_id desc))[1] as ultimo_evento
from public.email_eventos_resend group by marca,email_id;
revoke all on public.email_eventos_resumo from public, anon, authenticated;
grant select on public.email_eventos_resumo to service_role;
commit;
