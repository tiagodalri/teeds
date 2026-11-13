-- 13/11/2026 (Tiago: "na lista o cliente gerou 19 dólares de markup e na ficha está zerado"):
-- o markup de UM cliente contado operação por operação, igual à coluna "Markup gerado" da lista
-- (teeds_markup_dos_clientes): I.A. + manuais em conta real, cada contrato uma vez só. A ficha
-- mostra este número ao lado do confirmado pela Deriv (comissoes_diarias), que chega depois.
create or replace function public.teeds_markup_do_cliente(p_marca text, p_user_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v_ini timestamptz := (((now() at time zone 'America/Sao_Paulo')::date)::timestamp at time zone 'America/Sao_Paulo');
begin
  if not exists (select 1 from public.administradores a where a.user_id = auth.uid()) then return null; end if;
  if not public.teeds_ve_cliente(p_marca, p_user_id) then return null; end if;
  return (
    with ops as (
      select distinct on (x.contract_id) x.* from (
        select 'ia'::text as origem, o.contract_id, o.executada_em as quando, coalesce(o.markup, 0) as mk
          from public.operacoes_robos o
         where o.user_id = p_user_id and o.marca = p_marca and not o.demo
        union all
        select 'manual', m.contract_id, m.comprada_em, coalesce(m.markup, 0)
          from public.operacoes_manuais m
         where m.user_id = p_user_id and m.marca = p_marca and not m.demo and coalesce(m.pagamento, 0) > 0
      ) x
      order by x.contract_id, x.origem
    )
    select jsonb_build_object(
      'total', coalesce(sum(mk), 0),
      'hoje', coalesce(sum(mk) filter (where quando >= v_ini), 0),
      'operacoes', count(*),
      'ia', coalesce(sum(mk) filter (where origem = 'ia'), 0),
      'manual', coalesce(sum(mk) filter (where origem = 'manual'), 0),
      'primeira', min(quando), 'ultima', max(quando))
    from ops
  );
end $function$;
revoke all on function public.teeds_markup_do_cliente(text, uuid) from public, anon;
grant execute on function public.teeds_markup_do_cliente(text, uuid) to authenticated;
