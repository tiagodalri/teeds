-- 23/10/2026 (Tiago): o plano GF Member (id 'treino', só na GlobalFly) também
-- opera na conta demo. Antes só o plano "Com simulador" ('pro') e os
-- administradores liberavam a demo, e quem era GF Member via só a conta real.
-- Vale no site (teeds_meu_simulador chama esta) e no servidor dos robôs.
create or replace function public.teeds_simulador_permitido(p_user uuid, p_marca text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists(select 1 from administradores where user_id=p_user and marca=p_marca)
      or exists(select 1 from clientes where user_id=p_user and marca=p_marca and plano_id in ('pro','treino')
       and status_acesso='ativo' and (acesso_expira_em is null or acesso_expira_em>now()));
$function$;
