-- REPLICA IDENTITY FULL: sem isso o Realtime não consegue filtrar UPDATEs por user_id.
alter table public.sessoes_robos   replica identity full;
alter table public.operacoes_robos replica identity full;

alter publication supabase_realtime add table public.sessoes_robos;
alter publication supabase_realtime add table public.operacoes_robos;
