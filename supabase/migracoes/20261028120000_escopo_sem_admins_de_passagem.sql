-- O escopo de um parceiro não leva admins de passagem (28/10/2026, Tiago:
-- "quando eu troco o filtro pra /n ou /v, as infos não estão sendo atualizadas").
--
-- Os clientes de um escopo eram: a conta veio pelo parceiro OU a pessoa operou
-- ou conversou na vitrine dele. A segunda parte puxava o Tiago (conta direta)
-- para o /n e para o /v, porque ele testou as duas vitrines: as comissões, as
-- contas Deriv e a ficha dele apareciam no filtro de cada parceiro (e para o
-- admin de cada parceiro). Agora quem é administrador só entra no escopo pela
-- própria conta (clientes.parceiro); clientes seguem como antes.

create or replace function public.teeds_clientes_do_escopo()
returns uuid[] language sql stable security definer set search_path to 'public' as $$
  with e as (select split_part(v, ':', 1) as marca, split_part(v, ':', 2) as codigo from unnest(public.teeds_escopos()) v),
  admins as (select distinct a.user_id from public.administradores a)
  select coalesce(array_agg(distinct u), '{}') from (
    select c.user_id as u from public.clientes c join e on e.marca = c.marca and coalesce(c.parceiro, '') = e.codigo
    union select s.user_id from public.sessoes_robos s join e on e.marca = s.marca and s.parceiro = e.codigo
      where s.user_id not in (select user_id from admins)
    union select m.user_id from public.operacoes_manuais m join e on e.marca = m.marca and m.parceiro = e.codigo
      where m.user_id not in (select user_id from admins)
    union select x.user_id from public.suporte_conversas x join e on e.marca = x.marca and x.parceiro = e.codigo
      where x.user_id not in (select user_id from admins)
  ) t;
$$;
