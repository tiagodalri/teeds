begin;
-- Cópia restrita para reversão do reenquadramento, sem apagar histórico.
create table public.backup_planos_20260918 as select * from public.planos;
create table public.backup_clientes_planos_20260918 as select user_id,marca,plano_id,status_acesso,acesso_expira_em from public.clientes;
alter table public.backup_planos_20260918 enable row level security;
alter table public.backup_clientes_planos_20260918 enable row level security;
revoke all on public.backup_planos_20260918,public.backup_clientes_planos_20260918 from public,anon,authenticated;
grant all on public.backup_planos_20260918,public.backup_clientes_planos_20260918 to service_role;
insert into public.planos(id,nome,duracao_dias,ativo,recursos,marcas) values
 ('essencial','Sem simulador',30,true,'{"operar":true,"robos":true,"aulas":true,"gerenciamento":true,"simulador":false}','{teeds,omni}'),
 ('pro','Com simulador',30,true,'{"operar":true,"robos":true,"aulas":true,"gerenciamento":true,"simulador":true}','{teeds,omni}')
on conflict(id) do update set nome=excluded.nome,duracao_dias=excluded.duracao_dias,ativo=true,recursos=excluded.recursos,marcas=excluded.marcas;
-- Preserva validade/status de cada cliente; só libera quem já tinha o produto.
update public.clientes c set plano_id=case when exists(
 select 1 from public.cliente_produtos p where p.user_id=c.user_id and p.marca=c.marca
 and p.produto_id='simulador-treino' and p.ativo and (p.expira_em is null or p.expira_em>now())
) then 'pro' else 'essencial' end;
-- Planos antigos são arquivados, não apagados do histórico.
update public.planos set ativo=false where id not in ('essencial','pro');
create function public.teeds_simulador_permitido(p_user uuid,p_marca text)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from administradores where user_id=p_user and marca=p_marca)
 or exists(select 1 from clientes where user_id=p_user and marca=p_marca and plano_id='pro'
 and status_acesso='ativo' and (acesso_expira_em is null or acesso_expira_em>now()));
$$;
revoke all on function public.teeds_simulador_permitido(uuid,text) from public,anon,authenticated;
grant execute on function public.teeds_simulador_permitido(uuid,text) to service_role;
create function public.teeds_meu_simulador(p_marca text)
returns boolean language sql stable security definer set search_path=public as $$
 select public.teeds_simulador_permitido(auth.uid(),p_marca);
$$;
revoke all on function public.teeds_meu_simulador(text) from public,anon;
grant execute on function public.teeds_meu_simulador(text) to authenticated;
create function public.teeds_proteger_plano() returns trigger language plpgsql
security definer set search_path=public as $$
begin
 if new.plano_id not in ('essencial','pro') then raise exception 'Escolha um dos dois planos de clientes'; end if;
 if auth.role()='authenticated' and not public.teeds_sou_admin_da(new.marca) then
   if tg_op='INSERT' then
     if new.plano_id<>'essencial' then raise exception 'Somente o administrador pode liberar o simulador'; end if;
   elsif new.plano_id is distinct from old.plano_id or new.status_acesso is distinct from old.status_acesso
      or new.acesso_expira_em is distinct from old.acesso_expira_em then
     raise exception 'Somente o administrador pode alterar o acesso';
   end if;
 end if;
 return new;
end $$;
create trigger proteger_plano before insert or update on public.clientes for each row execute function public.teeds_proteger_plano();
revoke all on function public.teeds_proteger_plano() from public,anon,authenticated;
commit;
