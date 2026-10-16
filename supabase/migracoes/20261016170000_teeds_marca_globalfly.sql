-- Terceira marca: GlobalFly Trade (16/10/2026).
--
-- As tabelas e funções que conferem a marca aceitavam só ('teeds','omni').
-- Aqui elas passam a aceitar também 'globalfly'. Nada é apagado: cada regra
-- é trocada por outra igual com a marca nova, e as funções são reescritas a
-- partir da própria definição no banco, mudando só a lista.

do $$
declare t text;
begin
  foreach t in array array[
    'acessos_diarios','acessos_horas','auditoria_monitoramento_admin','aulas_progresso','aulas_videos',
    'clientes_pendentes','email_eventos_resend','eventos_robos_ao_vivo','leads_capturados',
    'pulsos_robos_ao_vivo','robos_parametros','robos_parametros_versoes','sessoes_robos_ao_vivo'
  ] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_marca_check');
    execute format('alter table public.%I add constraint %I check (marca in (''teeds'',''omni'',''globalfly''))', t, t || '_marca_check');
  end loop;
end $$;

do $$
declare f record; def text;
begin
  for f in
    select p.oid from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('teeds_registrar_acesso','teeds_registrar_aula','teeds_auditar_monitoramento','teeds_auditar_negado')
  loop
    def := pg_get_functiondef(f.oid);
    if position('(''teeds'',''omni'')' in def) = 0 then
      raise exception 'lista de marcas não encontrada em %', f.oid::regprocedure;
    end if;
    execute replace(def, '(''teeds'',''omni'')', '(''teeds'',''omni'',''globalfly'')');
  end loop;
end $$;

-- O dono administra a marca nova (o painel de admin confere a marca exata).
insert into public.administradores (user_id, marca)
values ('7679630d-54dc-439d-a0b5-f2e8d8f5a7aa', 'globalfly')
on conflict do nothing;

-- Os planos que a OMNI oferece, a GlobalFly também.
update public.planos set marcas = array_append(marcas, 'globalfly')
 where 'omni' = any(marcas) and not ('globalfly' = any(marcas));
