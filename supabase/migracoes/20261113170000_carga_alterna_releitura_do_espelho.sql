-- Ferramenta TEMPORÁRIA do teste de carga de 13–14/11/2026 (scripts/carga/carga-banco.ts e noite-radio.sh):
-- liga/desliga as 3 tabelas do espelho na publicação do Realtime, para medir antes x depois.
-- Só a chave de serviço chama. Apagar depois do teste:
--   drop function public.teeds_carga_releitura_do_espelho(boolean);
create or replace function public.teeds_carga_releitura_do_espelho(p_ligar boolean)
returns text language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from pg_publication_tables where pubname = 'supabase_realtime'
    and schemaname = 'public' and tablename in ('sessoes_robos_ao_vivo', 'pulsos_robos_ao_vivo', 'eventos_robos_ao_vivo');
  if p_ligar and n < 3 then
    execute 'alter publication supabase_realtime add table ' || (select string_agg('public.' || t, ', ') from unnest(array['sessoes_robos_ao_vivo','pulsos_robos_ao_vivo','eventos_robos_ao_vivo']) t
      where not exists (select 1 from pg_publication_tables p where p.pubname = 'supabase_realtime' and p.schemaname = 'public' and p.tablename = t));
  elsif not p_ligar and n > 0 then
    execute 'alter publication supabase_realtime drop table ' || (select string_agg('public.' || tablename, ', ') from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename in ('sessoes_robos_ao_vivo', 'pulsos_robos_ao_vivo', 'eventos_robos_ao_vivo'));
  end if;
  select count(*) into n from pg_publication_tables where pubname = 'supabase_realtime'
    and schemaname = 'public' and tablename in ('sessoes_robos_ao_vivo', 'pulsos_robos_ao_vivo', 'eventos_robos_ao_vivo');
  return n || ' de 3 tabelas do espelho na releitura';
end $$;
revoke all on function public.teeds_carga_releitura_do_espelho(boolean) from public, anon, authenticated;
grant execute on function public.teeds_carga_releitura_do_espelho(boolean) to service_role;
