-- Fecha o que o verificador do Supabase apontou como "SECURITY DEFINER
-- executavel por qualquer um" — cada caso do jeito certo, sem quebrar nada.

-- 1) sou_admin(): a versao ANTIGA, sem marca. Responde "sim" para quem for
--    admin de QUALQUER marca — a mesma cegueira que deixou a OMNI ver dado da
--    Teeds. Ja foi substituida por teeds_sou_admin_da(marca) em todas as
--    politicas, e nada mais a chama (conferido em policies, funcoes, gatilhos
--    e gatilhos de evento). Removida.
drop function if exists public.sou_admin();

-- 2) rls_auto_enable(): NAO e lixo. E um gatilho de evento (ensure_rls) que
--    liga RLS sozinho em toda tabela nova do schema public — uma protecao, e
--    foi o que fez a fila de e-mails nascer trancada. Fica. O gatilho de
--    evento roda com o dono, nao precisa que ninguem a chame por RPC: entao
--    so tiramos o EXECUTE publico, que era o motivo do alerta.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

-- 3) teeds_novo_cliente(): e gatilho de auth.users, dispara na criacao do
--    usuario com o privilegio do dono. Nunca deveria ser chamavel como RPC
--    por cliente logado. Tiramos o EXECUTE publico; o gatilho segue igual.
revoke all on function public.teeds_novo_cliente() from public, anon, authenticated;

-- teeds_sou_admin_da(marca) fica executavel de proposito: as politicas RLS a
-- chamam no contexto do usuario logado, entao o papel 'authenticated' precisa
-- poder executa-la. Ela so revela se VOCE e admin daquela marca — dado seu.
