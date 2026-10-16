-- Cabine de quem roda numa marca sem ficha nela (16/10/2026).
--
-- O omni@gmail.com (ficha só na OMNI) rodou robôs dentro da Teeds em 11 e
-- 16/10. A sessão é da Teeds, mas a auditoria exigia ficha do cliente na
-- Teeds, recusava com 42501, e o painel inteiro virava "Sem permissão" para
-- o admin da Teeds.
--
-- Quando a sessão é informada, ela já prova o vínculo: é desta marca e o
-- cliente é o dono dela. A exigência de ficha fica só para o registro que
-- cita um cliente SEM sessão. Admin da marca, sessão de outra marca e
-- sessão/cliente que não combinam continuam recusados como antes.
create or replace function public.teeds_auditar_monitoramento(p_marca text,p_tipo text,p_acao text,p_sessao_id uuid default null,p_cliente_id uuid default null) returns bigint language plpgsql security definer set search_path=public as $$
declare v_dono uuid; v_id bigint;
begin
if auth.uid() is null then raise exception 'sem sessao' using errcode='28000'; end if;
if p_marca not in ('teeds','omni') then raise exception 'marca invalida' using errcode='22023'; end if;
if p_tipo not in ('painel','ao-vivo','replay','busca') or p_acao not in ('abriu','fechou','buscou','exportou','negado') then raise exception 'tipo ou acao invalidos' using errcode='22023'; end if;
if not public.teeds_sou_admin_da(p_marca) then raise exception 'somente administradores desta marca' using errcode='42501'; end if;
if p_sessao_id is not null then
select user_id into v_dono from public.sessoes_robos where id=p_sessao_id and marca=p_marca;
if v_dono is null then raise exception 'sessao nao pertence a esta marca' using errcode='42501'; end if;
if p_cliente_id is not null and p_cliente_id<>v_dono then raise exception 'sessao e cliente nao combinam' using errcode='42501'; end if;
elsif p_cliente_id is not null and not exists(select 1 from public.clientes where user_id=p_cliente_id and marca=p_marca) then
raise exception 'cliente nao pertence a esta marca' using errcode='42501';
end if;
insert into public.auditoria_monitoramento_admin(marca,admin_id,cliente_id,sessao_id,tipo,acao) values(p_marca,auth.uid(),p_cliente_id,p_sessao_id,p_tipo,p_acao) returning id into v_id;
return v_id;
end $$;
revoke all on function public.teeds_auditar_monitoramento(text,text,text,uuid,uuid) from public,anon;
grant execute on function public.teeds_auditar_monitoramento(text,text,text,uuid,uuid) to authenticated;
