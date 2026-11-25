-- Confere as linhas antigas contra a regra de marcas da migração anterior
-- (20261124210000_marca_legacypro.sql, que entrou com not valid).
-- validate constraint não bloqueia leituras nem gravações.
do $$
declare t text;
begin
  foreach t in array array[
    'acessos_diarios','acessos_horas','aovivo_config','auditoria_monitoramento_admin','aulas_progresso',
    'aulas_videos','clientes_pendentes','email_eventos_resend','eventos_robos_ao_vivo','grafico_layouts',
    'lab_receitas','leads_capturados','lives','planos_da_marca','pulsos_robos_ao_vivo','robos_parametros',
    'robos_parametros_versoes','sessoes_robos_ao_vivo'
  ] loop
    execute format('alter table public.%I validate constraint %I', t, t || '_marca_check');
  end loop;
end $$;
