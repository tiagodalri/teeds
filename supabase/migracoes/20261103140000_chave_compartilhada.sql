-- Conta de anúncios do Victor (03/11/2026, Tiago: "fazer a integração da conta de anúncios do Victor Cordeiro").
-- As contas do Naor (/n) e do Victor (/v) estão no mesmo gerenciador de negócios: a mesma chave de
-- usuário do sistema serve às duas. Esta função copia a chave de um parceiro para o outro dentro do
-- servidor (ela nunca aparece na tela). Só copia entre parceiros do mesmo gerenciador.
create or replace function public.teeds_meta_ads_chave_copiar(p_marca text, p_de text, p_para text)
returns void language plpgsql security definer set search_path = public as $$
declare v_chave text;
        v_mesmo_negocio constant jsonb := '{"globalfly": ["n", "v"]}';
begin
  if not public.teeds_admin_geral_da(p_marca) then raise exception 'Só o administrador geral conecta a conta de anúncios'; end if;
  if p_de = p_para or not (coalesce(v_mesmo_negocio -> p_marca, '[]'::jsonb) ? p_de and coalesce(v_mesmo_negocio -> p_marca, '[]'::jsonb) ? p_para) then
    raise exception 'Essas contas não estão no mesmo gerenciador de negócios';
  end if;
  select valor into v_chave from public.config_servicos where chave = 'META_ADS_' || upper(p_marca) || '_' || upper(p_de);
  if v_chave is null then raise exception 'A outra conta ainda não tem chave. Cole a chave aqui mesmo.'; end if;
  delete from public.meta_ads_cache where chave like p_marca || ':' || p_para || ':%';
  insert into public.config_servicos (chave, valor, atualizado_em) values ('META_ADS_' || upper(p_marca) || '_' || upper(p_para), v_chave, now())
  on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
end $$;
revoke all on function public.teeds_meta_ads_chave_copiar(text, text, text) from public, anon;
grant execute on function public.teeds_meta_ads_chave_copiar(text, text, text) to authenticated;
