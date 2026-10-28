-- As sessões e conversas do escopo de um parceiro (28/10/2026): a lista de
-- escopos era recalculada para CADA linha (any(public.teeds_escopos()) dentro
-- do where), ~1 a 2,6 s por chamada, e entra nas regras de acesso do
-- Monitoramento e no markup das sessões. Agora é calculada uma vez, e sem
-- escopo (admin geral sem filtro) volta vazio na hora. Mesmo resultado.
create or replace function public.teeds_sessoes_do_escopo()
returns uuid[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(s.id), '{}')
  from public.sessoes_robos s, (select public.teeds_escopos() as l) e
  where cardinality(e.l) > 0
    and s.marca = any (array(select split_part(v, ':', 1) from unnest(e.l) v))
    and (s.marca || ':' || coalesce(s.parceiro, public.teeds_parceiro_da_conta(s.marca, s.user_id), '')) = any (e.l);
$$;
create or replace function public.teeds_conversas_do_escopo()
returns uuid[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(x.id), '{}')
  from public.suporte_conversas x, (select public.teeds_escopos() as l) e
  where cardinality(e.l) > 0
    and x.marca = any (array(select split_part(v, ':', 1) from unnest(e.l) v))
    and (x.marca || ':' || coalesce(x.parceiro, public.teeds_parceiro_da_conta(x.marca, x.user_id), '')) = any (e.l);
$$;
