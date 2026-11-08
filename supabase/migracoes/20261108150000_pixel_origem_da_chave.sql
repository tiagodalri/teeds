-- 08/11/2026 (Tiago: "quero que mostre aqui no front que ta td ok com a api de conversao; se fica esse campo pra
-- preencher a chave eu acho que tem algo pendente"). A situação do pixel passa a dizer DE ONDE vem a chave do envio
-- pelo servidor: 'propria' (META_CAPI_<MARCA>_<P>, a do Gerenciador de Eventos) ou 'conta' (META_ADS_<MARCA>_<P>,
-- a mesma de Administração › Anúncios, que a função meta-conversoes usa quando não há a própria). Resto igual.
create or replace function public.teeds_meta_situacao(p_marca text, p_parceiro text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare v jsonb;
        v_capi text;
        v_ads text;
begin
  if not public.teeds_admin_pleno_da(p_marca) then raise exception 'Só o administrador geral vê o pixel'; end if;
  p_parceiro := coalesce(public.teeds_parceiro_forcado(p_marca), p_parceiro);
  v_capi := 'META_CAPI_' || upper(p_marca) || '_' || upper(p_parceiro);
  v_ads := 'META_ADS_' || upper(p_marca) || '_' || upper(p_parceiro);
  select jsonb_build_object(
    'temChave', exists (select 1 from public.config_servicos where chave in (v_capi, v_ads)),
    'origemChave', case when exists (select 1 from public.config_servicos where chave = v_capi) then 'propria'
                        when exists (select 1 from public.config_servicos where chave = v_ads) then 'conta' end,
    'chaveEm', (select min(atualizado_em) from public.config_servicos where chave in (v_capi, v_ads)),
    'enviados', (select count(*) from public.meta_conversoes m where m.marca = p_marca and m.parceiro = p_parceiro and m.situacao = 'enviado' and m.criado_em > now() - interval '7 days'),
    'semChave', (select count(*) from public.meta_conversoes m where m.marca = p_marca and m.parceiro = p_parceiro and m.situacao = 'sem-chave' and m.criado_em > now() - interval '7 days'),
    'ultimoEnvio', (select max(criado_em) from public.meta_conversoes m where m.marca = p_marca and m.parceiro = p_parceiro and m.situacao = 'enviado'),
    'ultimoErro', (select jsonb_build_object('em', criado_em, 'detalhe', detalhe) from public.meta_conversoes m
                   where m.marca = p_marca and m.parceiro = p_parceiro and m.situacao = 'erro' order by criado_em desc limit 1)
  ) into v;
  return v;
end $function$;
revoke all on function public.teeds_meta_situacao(text, text) from public, anon;
grant execute on function public.teeds_meta_situacao(text, text) to authenticated;
