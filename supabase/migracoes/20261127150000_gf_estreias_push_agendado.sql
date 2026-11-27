-- 27/11/2026 (JÁ APLICADA no banco): série "I.A. na Prática" da GlobalFly.
-- Avisos no celular às 18h ("falta 1 hora") e às 19h ("no ar") em 27, 28 e 29/11 (cron em UTC: 21h/22h),
-- público "Todos", pela função notificacoes com o segredo do gatilho. Cada job se desagenda depois de rodar.
-- Para cancelar um: select cron.unschedule('gf-estreia-28-18h');
create extension if not exists pg_cron;
create or replace function public.teeds_estreia_push(p_titulo text, p_corpo text)
returns void language plpgsql security definer set search_path = public as $$
declare segredo text;
begin
  select valor into segredo from public.config_servicos where chave = 'PUSH_GATILHO';
  perform net.http_post(
    url := 'https://wonxykovfvfnuhzpqsle.supabase.co/functions/v1/notificacoes',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-gatilho', segredo),
    body := jsonb_build_object('acao', 'disparo', 'marca', 'globalfly', 'publico', 'todos', 'destino', 'aulas', 'titulo', p_titulo, 'corpo', p_corpo),
    timeout_milliseconds := 60000);
end $$;
revoke all on function public.teeds_estreia_push(text, text) from public, anon, authenticated;
-- os 6 cron.schedule (gf-estreia-27-18h ... gf-estreia-29-19h) foram criados na aplicação; ver cron.job.
