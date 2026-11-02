-- 02/11/2026 (Tiago): no /n o questionário pergunta do ecossistema do Naor, com os produtos dele.
-- Mesma função de 20261026120000, com os códigos "n_" na lista dos válidos.
create or replace function public.gf_responder_questionario(p_email text, p_ex_cliente boolean, p_produtos text[] DEFAULT '{}'::text[], p_outro text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  validos constant text[] := array['b3','fast','calculadora_fast','stark','plano_socio','mentoria','grande_revolucao',
    'n_compartilhamento','n_sala_b3','n_clube_3','n_mentoria_gps','n_rtp','n_goatwin','outro'];
  produtos text[];
  n int;
begin
  if p_email is null or p_ex_cliente is null then return false; end if;
  select coalesce(array_agg(distinct p), '{}') into produtos
    from unnest(coalesce(p_produtos, '{}')) p where p = any(validos);
  if not p_ex_cliente then produtos := '{}'; end if;
  if 'outro' = any(produtos) and nullif(btrim(coalesce(p_outro, '')), '') is not null then
    produtos := array_remove(produtos, 'outro') || ('outro: ' || left(btrim(p_outro), 60));
  end if;
  update leads_capturados
     set ex_cliente = p_ex_cliente, produtos_anteriores = produtos, questionario_em = now(), atualizado_em = now()
   where marca = 'globalfly'
     and email_normalizado = lower(btrim(p_email))
     and coalesce(inscricao_recebida_em, convertido_em) > now() - interval '24 hours';
  get diagnostics n = row_count;
  return n > 0;
end $function$;
