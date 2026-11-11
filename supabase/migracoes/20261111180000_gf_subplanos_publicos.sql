-- 11/11/2026 (Tiago): o cadastro da GlobalFly abre com a escolha do plano (Gold, Black, Prestige).
-- Quem ainda não tem conta precisa ver os subplanos como estão no editor (Admin › Planos) e o
-- checkout certo do parceiro. A tabela `subplanos` só é legível por quem está logado; esta função
-- devolve só o que já é público (nome, chamada, preços, o que inclui e os links de pagamento).
create or replace function public.gf_subplanos_publicos()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
      'id', s.id, 'nome', s.nome, 'ordem', s.ordem, 'chamada', s.chamada,
      'preco', s.preco, 'preco_referencia', s.preco_referencia, 'cobranca', s.cobranca,
      'compartilhamento', s.compartilhamento, 'ias', s.ias, 'simulador_horas', s.simulador_horas,
      'sala_extra', s.sala_extra, 'assessor', s.assessor, 'lab', s.lab,
      'checkout_url', s.checkout_url, 'checkout_por_parceiro', coalesce(s.checkout_por_parceiro, '{}'::jsonb)
    ) order by s.ordem), '[]'::json)
    from subplanos s
   where s.marca = 'globalfly' and s.ativo
$$;
revoke all on function public.gf_subplanos_publicos() from public;
grant execute on function public.gf_subplanos_publicos() to anon, authenticated;
