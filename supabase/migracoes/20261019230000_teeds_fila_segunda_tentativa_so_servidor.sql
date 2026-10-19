-- 19/10/2026: a fila do reenvio de campanha devolvia e-mail e user_id de
-- quem recebeu a campanha para QUALQUER um com a chave pública (anon), sem
-- conferir quem chamava. Só o servidor (chave de serviço) usa esta função.
revoke execute on function public.teeds_fila_segunda_tentativa(text, text, text, date[], integer) from public, anon, authenticated;
grant execute on function public.teeds_fila_segunda_tentativa(text, text, text, date[], integer) to service_role;
