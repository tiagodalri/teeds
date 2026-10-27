-- No painel, só o escopo (27/10/2026, Tiago: "sem cruzamento de informações").
--
-- As tabelas do cliente têm "a própria linha OU o escopo do admin". Quem é
-- admin e também opera (Tiago, os Victor) via, no painel, as PRÓPRIAS
-- operações de fora do filtro: Tiago filtrando /v enxergava as dele no /n, e
-- Victor Dias, admin do /v, as dele no direto.
--
-- O site manda x-teeds-painel: 1 nas leituras feitas das telas do admin
-- (src/core/teeds/parceiroEmFoco.ts). Com ele, a linha própria deixa de
-- valer e só o escopo responde. Fora do painel (as telas do cliente) nada muda.
-- O cabeçalho só pesa para quem é admin: um cliente não esconde nada de si.

create or replace function public.teeds_no_painel()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((nullif(current_setting('request.headers', true), '')::json ->> 'x-teeds-painel') = '1', false)
     and exists (select 1 from public.administradores a where a.user_id = auth.uid());
$$;
revoke all on function public.teeds_no_painel() from public, anon;
grant execute on function public.teeds_no_painel() to authenticated;

do $$
declare
  r record;
  velho constant text := '(user_id = ( SELECT auth.uid() AS uid))';
  novo  constant text := '((user_id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT teeds_no_painel() AS teeds_no_painel)))';
begin
  for r in
    select tablename, policyname, qual from pg_policies
    where schemaname = 'public' and cmd = 'SELECT'
      and tablename in ('clientes', 'operacoes_robos', 'operacoes_manuais', 'sessoes_robos', 'suporte_conversas')
      and position(velho in qual) > 0 and qual not like '%teeds_no_painel%'
  loop
    execute format('alter policy %I on public.%I using (%s)', r.policyname, r.tablename, replace(r.qual, velho, novo));
  end loop;
end $$;
