-- Notificações no celular (27/10/2026, Tiago: "tem como aparecer notificação
-- no celular? mesmo sendo PWA? se tiver quero pra ontem").
--
-- Web Push: Android (navegador e app instalado), iPhone 16.4+ com o app na
-- tela de início, e computador. Cada aparelho que a pessoa autoriza vira uma
-- linha em push_assinaturas. Quando uma sessão de I.A. termina (meta, limite
-- de perda, recusa da Deriv, manutenção), o gatilho chama a função
-- `notificacoes`, que monta a mensagem e envia para os aparelhos da pessoa
-- naquela plataforma. Quem para a própria I.A. não recebe aviso.
--
-- Segredos: a chave VAPID é criada pela própria função e guardada em
-- config_servicos (só a chave de serviço lê); o segredo do gatilho é criado
-- aqui, pelo banco. Nenhum dos dois sai do servidor.

create extension if not exists pg_net with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.push_assinaturas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  marca text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  aparelho text,
  criada_em timestamptz not null default now(),
  ultima_vez timestamptz not null default now(),
  falhas integer not null default 0
);
create index if not exists push_assinaturas_usuario_idx on public.push_assinaturas (user_id, marca);

alter table public.push_assinaturas enable row level security;
drop policy if exists "push: a pessoa vê os próprios aparelhos" on public.push_assinaturas;
create policy "push: a pessoa vê os próprios aparelhos" on public.push_assinaturas
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "push: a pessoa inscreve o próprio aparelho" on public.push_assinaturas;
create policy "push: a pessoa inscreve o próprio aparelho" on public.push_assinaturas
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "push: a pessoa atualiza o próprio aparelho" on public.push_assinaturas;
create policy "push: a pessoa atualiza o próprio aparelho" on public.push_assinaturas
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "push: a pessoa tira o próprio aparelho" on public.push_assinaturas;
create policy "push: a pessoa tira o próprio aparelho" on public.push_assinaturas
  for delete to authenticated using (user_id = (select auth.uid()));

-- o mesmo aparelho (endpoint) pode ter trocado de conta: quem inscreve de novo fica com ele
create or replace function public.teeds_inscrever_aparelho(p_marca text, p_endpoint text, p_p256dh text, p_auth text, p_aparelho text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  insert into push_assinaturas (user_id, marca, endpoint, p256dh, auth, aparelho)
  values (auth.uid(), p_marca, p_endpoint, p_p256dh, p_auth, left(p_aparelho, 120))
  on conflict (endpoint) do update set user_id = excluded.user_id, marca = excluded.marca, p256dh = excluded.p256dh,
    auth = excluded.auth, aparelho = excluded.aparelho, ultima_vez = now(), falhas = 0;
end $$;
revoke all on function public.teeds_inscrever_aparelho(text, text, text, text, text) from public, anon;
grant execute on function public.teeds_inscrever_aparelho(text, text, text, text, text) to authenticated;

-- o segredo que só o banco e a função conhecem
insert into public.config_servicos (chave, valor)
select 'PUSH_GATILHO', encode(extensions.gen_random_bytes(32), 'hex')
where not exists (select 1 from public.config_servicos where chave = 'PUSH_GATILHO');

-- sessão de I.A. terminou: avisa a função (sem nunca travar a gravação da sessão)
create or replace function public.teeds_avisar_fim_da_sessao()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  segredo text;
begin
  if old.situacao is distinct from 'rodando' or new.situacao not in ('encerrada', 'erro') then return new; end if;
  if coalesce(new.motivo_da_parada, '') ilike 'você pediu para parar%' then return new; end if;
  if not exists (select 1 from push_assinaturas p where p.user_id = new.user_id and p.marca = new.marca) then return new; end if;
  begin
    select valor into segredo from config_servicos where chave = 'PUSH_GATILHO';
    perform net.http_post(
      url := 'https://wonxykovfvfnuhzpqsle.supabase.co/functions/v1/notificacoes',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-gatilho', segredo),
      body := jsonb_build_object('acao', 'sessao', 'id', new.id)
    );
  exception when others then
    raise warning 'notificacoes: aviso não enviado (%)', sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists teeds_avisar_fim_da_sessao on public.sessoes_robos;
create trigger teeds_avisar_fim_da_sessao after update of situacao on public.sessoes_robos
  for each row execute function public.teeds_avisar_fim_da_sessao();
