-- O espelho sai da releitura do Realtime (13/11/2026). APLICADA em 13/11 12h58 (Brasília) pela
-- ferramenta do teste, teeds_carga_releitura_do_espelho(false), depois do servidor com o rádio no ar.
--
-- Com o rádio no ar (20261113150000_radio_do_monitoramento.sql e
-- servidor/src/radio.ts), as telas do admin recebem foto, pulso e eventos
-- transmitidos pelo servidor. Estas três tabelas não precisam mais estar na
-- publicação: o Realtime deixa de decodificar cada gravação delas no diário
-- do banco (WAL) e de conferir a regra de cada admin linha a linha — metade
-- do trabalho do banco num dia calmo, 71% na live de 09/11.
--
-- A gravação continua igual: é de onde a tela se completa ao abrir, ao
-- reconectar e na reconciliação de 20 s. Para voltar atrás:
--   alter publication supabase_realtime add table public.sessoes_robos_ao_vivo,
--     public.pulsos_robos_ao_vivo, public.eventos_robos_ao_vivo;

alter publication supabase_realtime drop table public.sessoes_robos_ao_vivo, public.pulsos_robos_ao_vivo, public.eventos_robos_ao_vivo;
