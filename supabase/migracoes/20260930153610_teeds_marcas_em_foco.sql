-- Quais marcas entram na conta quando o painel pergunta.
--
-- O painel da Teeds era a Teeds — e só. Para ver a OMNI era preciso trocar a
-- plataforma no topo, e não existia lugar nenhum que somasse as duas. O
-- seletor ainda dizia "Teeds · master", o que fazia parecer que a Teeds já era
-- o total da casa; não era. (Confusão apontada pelo Tiago em 30/09/2026.)
--
-- Daqui em diante `p_marca` aceita 'todas' (ou nulo): a resposta vem pelas
-- marcas que o admin realmente administra. Quem é admin de uma whitelabel
-- continua vendo só a dele, mesmo pedindo 'todas'.
create or replace function public.teeds_marcas_em_foco(p_marca text)
returns text[] language sql stable security definer set search_path to 'public' as $$
  select case
    when p_marca is null or p_marca = 'todas' then (
      select coalesce(array_agg(distinct t.m), array[]::text[])
      from (
        select a.marca as m from public.administradores a where a.user_id = (select auth.uid())
        union
        select c.marca from public.clientes c where public.teeds_sou_master()
      ) t
      where t.m is not null
    )
    when public.teeds_sou_admin_da(p_marca) then array[p_marca]
    else array[]::text[]
  end;
$$;

revoke execute on function public.teeds_marcas_em_foco(text) from anon;
grant execute on function public.teeds_marcas_em_foco(text) to authenticated;
