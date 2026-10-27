-- Aceite dos termos a cada login (27/10/2026, Tiago: "toda vez que a pessoa
-- fizer login ela precisa assinalar a caixinha dos termos; tudo precisa ser
-- gravado no banco caso precise de comprovação de aceite; no perfil de cada
-- cliente mostrar quando aceitou pela primeira vez").
--
-- termos_aceites (20261027240000) continua sendo o "aceitou esta versão" do
-- primeiro acesso. Aqui fica o histórico completo: cada aceite vira uma linha,
-- com o tipo (primeiro_acesso ou login), a versão, a data e hora, o aparelho e o
-- IP de onde veio a requisição (lido do cabeçalho pelo próprio banco, não pelo
-- site). Ninguém altera nem apaga pelo site: é a prova.

create table if not exists public.termos_aceites_eventos (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  marca       text not null,
  versao      text not null,
  tipo        text not null check (tipo in ('primeiro_acesso', 'login')),
  aceito_em   timestamptz not null default now(),
  user_agent  text,
  ip          text
);
create index if not exists termos_aceites_eventos_usuario_idx on public.termos_aceites_eventos (user_id, marca, aceito_em desc);
alter table public.termos_aceites_eventos enable row level security;

-- o IP e a hora vêm do servidor, nunca do site
create or replace function public.teeds_aceite_carimbo() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare h json;
begin
  begin h := nullif(current_setting('request.headers', true), '')::json; exception when others then h := null; end;
  new.ip := coalesce(h ->> 'cf-connecting-ip', split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1), h ->> 'x-real-ip');
  new.ip := nullif(btrim(new.ip), '');
  new.aceito_em := now();
  return new;
end $$;
drop trigger if exists termos_aceites_eventos_carimbo on public.termos_aceites_eventos;
create trigger termos_aceites_eventos_carimbo before insert on public.termos_aceites_eventos
  for each row execute function public.teeds_aceite_carimbo();

drop policy if exists "aceite: o próprio registra" on public.termos_aceites_eventos;
create policy "aceite: o próprio registra" on public.termos_aceites_eventos for insert to authenticated
  with check (user_id = (select auth.uid()));

-- lê: o próprio; o admin geral da marca; o admin do parceiro, só os clientes do escopo dele
drop policy if exists "aceite: quem pode ler" on public.termos_aceites_eventos;
create policy "aceite: quem pode ler" on public.termos_aceites_eventos for select to authenticated
  using (user_id = (select auth.uid())
    or marca = any((select public.teeds_marcas_admin_total())::text[])
    or user_id = any((select public.teeds_clientes_do_escopo())::uuid[]));

revoke update, delete on public.termos_aceites_eventos from anon, authenticated;
grant select, insert on public.termos_aceites_eventos to authenticated;
grant usage on sequence public.termos_aceites_eventos_id_seq to authenticated;

-- o primeiro aceite também ganha o carimbo do servidor (IP e hora) e passa a ser visto pelo admin do parceiro
alter table public.termos_aceites add column if not exists ip text;
drop trigger if exists termos_aceites_carimbo on public.termos_aceites;
create trigger termos_aceites_carimbo before insert on public.termos_aceites
  for each row execute function public.teeds_aceite_carimbo();
drop policy if exists "aceite: o próprio lê, o admin geral da marca também" on public.termos_aceites;
drop policy if exists "aceite: quem pode ler" on public.termos_aceites;
create policy "aceite: quem pode ler" on public.termos_aceites for select to authenticated
  using (user_id = (select auth.uid())
    or marca = any((select public.teeds_marcas_admin_total())::text[])
    or user_id = any((select public.teeds_clientes_do_escopo())::uuid[]));
