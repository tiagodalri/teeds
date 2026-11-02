-- 02/11/2026 (Tiago): "no painel de ADM, construirmos um painel pra disparar notificações?
-- personalizar cada uma, assistir um preview, selecionar pra quem será enviado".
--
-- Quem recebe sai de um lugar só (teeds_push_destinos): os aparelhos ativados dentro da
-- plataforma (push_assinaturas, pela conta) e os ativados na página de obrigado do
-- lançamento (lancamento_push, pelo e-mail). O envio é da função `notificacoes` (as
-- chaves do Web Push moram lá); o histórico fica em push_disparos.

create table if not exists public.push_disparos (
  id uuid primary key default gen_random_uuid(),
  marca text not null,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  titulo text not null,
  corpo text not null,
  destino text,
  publico text not null,
  parceiro text,
  aparelhos integer,
  enviados integer,
  falhas integer,
  teste boolean not null default false
);
alter table public.push_disparos enable row level security;
drop policy if exists "admin geral ve os disparos" on public.push_disparos;
create policy "admin geral ve os disparos" on public.push_disparos for select to authenticated using (public.teeds_admin_geral_da(marca));

-- Os aparelhos de um público. p_publico: todos | aguardando | membros | ativos | eu.
-- p_parceiro: null (todos), 'n', 'v' ou 'direto'.
create or replace function public.teeds_push_destinos(p_marca text, p_publico text, p_parceiro text default null, p_eu uuid default null)
returns table (tabela text, chave text, endpoint text, p256dh text, auth text, parceiro text, pessoa text)
language sql stable security definer set search_path = public as $$
  with pessoas as (
    select c.user_id, lower(c.email) as email, nullif(c.parceiro, '') as parceiro
      from public.clientes c
     where c.marca = p_marca and p_publico <> 'eu'
       and case p_publico
             when 'todos' then true
             when 'aguardando' then c.status_acesso = 'pendente' and c.plano_id = 'globalfly-aguardando-live'
             when 'membros' then c.status_acesso = 'ativo' and c.plano_id = 'treino'
             when 'ativos' then c.status_acesso = 'ativo'
             else false end
       and (p_parceiro is null or (p_parceiro = 'direto' and coalesce(c.parceiro, '') = '') or c.parceiro = p_parceiro)
  ), todos as (
    select 'push_assinaturas' as tabela, a.id::text as chave, a.endpoint, a.p256dh, a.auth, p.parceiro, p.user_id::text as pessoa
      from public.push_assinaturas a join pessoas p on p.user_id = a.user_id
     where a.marca = p_marca
    union all
    select 'lancamento_push', l.endpoint, l.endpoint, l.p256dh, l.auth, coalesce(l.parceiro, p.parceiro), p.user_id::text
      from public.lancamento_push l join pessoas p on p.email = lower(l.email)
     where l.marca = p_marca
    union all
    -- teste: os aparelhos de quem está no painel
    select 'push_assinaturas', a.id::text, a.endpoint, a.p256dh, a.auth, null, a.user_id::text
      from public.push_assinaturas a
     where p_publico = 'eu' and a.marca = p_marca and a.user_id = p_eu
  )
  select distinct on (endpoint) tabela, chave, endpoint, p256dh, auth, parceiro, pessoa from todos order by endpoint, tabela desc;
$$;
revoke all on function public.teeds_push_destinos(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.teeds_push_destinos(text, text, text, uuid) to service_role;

-- Para o painel: quantas pessoas e quantos aparelhos cada público alcança agora.
create or replace function public.teeds_push_publicos(p_marca text, p_parceiro text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb := '{}'::jsonb; p text;
begin
  if not public.teeds_admin_geral_da(p_marca) then raise exception 'Só o administrador geral dispara notificações'; end if;
  foreach p in array array['todos', 'aguardando', 'membros', 'ativos', 'eu'] loop
    r := r || jsonb_build_object(p, (
      select jsonb_build_object('pessoas', count(distinct d.pessoa), 'aparelhos', count(*))
        from public.teeds_push_destinos(p_marca, p, p_parceiro, (select auth.uid())) d));
  end loop;
  return r;
end $$;
revoke all on function public.teeds_push_publicos(text, text) from public, anon;
grant execute on function public.teeds_push_publicos(text, text) to authenticated;
