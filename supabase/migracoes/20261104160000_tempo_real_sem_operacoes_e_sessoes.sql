-- 04/11/2026: o banco lotou de 10:50 às 11:14 e o login travou. O maior consumidor do banco era o
-- Realtime (o "SELECT wal->>..." do realtime_rls: 26 mil segundos acumulados, 6x todo o resto junto).
-- Ele decodifica toda mudança das tabelas da publicação supabase_realtime. operacoes_robos e
-- sessoes_robos entraram ali em 04/09 (20260904205013), mas desde o espelho ao vivo de 14/09 a tela
-- acompanha sessoes_robos_ao_vivo / pulsos / eventos, e nenhum dos três sites nem o servidor assina
-- mais essas duas (conferido no código e nos bundles publicados). Eram ~590 mil mudanças à toa.
-- O REPLICA IDENTITY FULL só existia para o Realtime filtrar UPDATE por user_id: volta ao padrão,
-- o que também encolhe o WAL de cada UPDATE (ia a linha antiga inteira).
--
-- Para desfazer:
--   alter publication supabase_realtime add table public.sessoes_robos, public.operacoes_robos;
--   alter table public.sessoes_robos replica identity full; alter table public.operacoes_robos replica identity full;
alter publication supabase_realtime drop table public.operacoes_robos, public.sessoes_robos;
alter table public.sessoes_robos   replica identity default;
alter table public.operacoes_robos replica identity default;
