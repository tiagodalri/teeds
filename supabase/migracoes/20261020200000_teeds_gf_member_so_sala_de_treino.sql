-- 20/10/2026: o GF Member (plano 'treino') só tem a sala de treino. As
-- transmissões ao vivo (tabela lives, chat e ingresso) ficam para os outros
-- planos e para os admins.
create or replace function public.teeds_pode_assistir(p_marca text)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select public.teeds_sou_admin_da(p_marca) or exists (
    select 1 from public.clientes c
    where c.user_id = (select auth.uid()) and c.marca = p_marca
      and coalesce(c.status_acesso, 'ativo') = 'ativo'
      and c.plano_id <> 'treino'
  );
$function$;
