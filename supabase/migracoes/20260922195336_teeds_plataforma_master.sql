-- A Teeds é a plataforma master: quem é administrador dela enxerga todas as
-- marcas whitelabel (OMNI e as próximas). Cada whitelabel continua vendo só a
-- si mesma. Pedido do Tiago em 22/09/2026.
--
-- Uma função só decide isso, e ela já é usada por todas as políticas de RLS e
-- por todas as funções de relatório — por isso a regra entra em um lugar e
-- vale em todos.
create or replace function public.teeds_sou_master()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.administradores a
    where a.user_id = (select auth.uid()) and a.marca = 'teeds'
  );
$$;

create or replace function public.teeds_sou_admin_da(p_marca text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.administradores a
    where a.user_id = (select auth.uid()) and (a.marca = p_marca or a.marca = 'teeds')
  );
$$;

revoke execute on function public.teeds_sou_master() from anon;
revoke execute on function public.teeds_sou_admin_da(text) from anon;
grant execute on function public.teeds_sou_master() to authenticated;
grant execute on function public.teeds_sou_admin_da(text) to authenticated;
