begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
alter table public.sessoes_robos add constraint sessoes_robos_id_marca_key unique (id, marca);
alter table public.sessoes_robos add constraint sessoes_robos_id_marca_user_key unique (id, marca, user_id);
create table if not exists public.sessoes_robos_ao_vivo (
sessao_id uuid primary key, marca text not null check (marca in ('teeds','omni')), user_id uuid not null, seq integer not null default 0 check(seq>=0), fase text not null default 'aguardando', estado jsonb not null default '{}'::jsonb, config jsonb not null default '{}'::jsonb, emitido_em bigint not null default 0, atualizada_em timestamptz not null default now(), constraint sessoes_robos_ao_vivo_sessao_fkey foreign key(sessao_id,marca,user_id) references public.sessoes_robos(id,marca,user_id) on delete cascade);
comment on table public.sessoes_robos_ao_vivo is 'A foto atual da cabine de cada sessão de robô, escrita pelo servidor. Só o admin da marca lê.';
create index if not exists sessoes_robos_ao_vivo_marca_idx on public.sessoes_robos_ao_vivo(marca,atualizada_em desc);
create table if not exists public.pulsos_robos_ao_vivo (sessao_id uuid primary key,marca text not null check(marca in ('teeds','omni')),seq integer not null default 0 check(seq>=0),pulso jsonb not null default '{}'::jsonb,emitido_em bigint not null default 0,atualizada_em timestamptz not null default now(),constraint pulsos_robos_ao_vivo_sessao_fkey foreign key(sessao_id,marca) references public.sessoes_robos(id,marca) on delete cascade);
comment on table public.pulsos_robos_ao_vivo is 'O que muda entre eventos (fase, dígitos, análise) e o batimento de presença. Pequeno; escrito pelo servidor.';
create index if not exists pulsos_robos_ao_vivo_marca_idx on public.pulsos_robos_ao_vivo(marca,atualizada_em desc);
create table if not exists public.eventos_robos_ao_vivo (id bigserial primary key,sessao_id uuid not null,marca text not null check(marca in ('teeds','omni')),seq integer not null check(seq>0),tipo text not null check(tipo in ('abertura','compra','liquidacao','fase','entrada','estrategia','falha','conexao','parada','foto')),delta jsonb not null default '{}'::jsonb,config jsonb,emitido_em bigint not null,criado_em timestamptz not null default now(),constraint eventos_robos_ao_vivo_sessao_seq_key unique(sessao_id,seq),constraint eventos_robos_ao_vivo_sessao_fkey foreign key(sessao_id,marca) references public.sessoes_robos(id,marca) on delete cascade);
comment on table public.eventos_robos_ao_vivo is 'Eventos operacionais de cada sessão, numerados, permanentes, só com o que mudou. Servem ao vivo e ao replay.';
create index if not exists eventos_robos_ao_vivo_marca_idx on public.eventos_robos_ao_vivo(marca,criado_em desc);
create index if not exists eventos_robos_ao_vivo_criado_idx on public.eventos_robos_ao_vivo(criado_em);
create table if not exists public.auditoria_monitoramento_admin (id bigserial primary key,marca text not null check(marca in ('teeds','omni')),admin_id uuid not null,cliente_id uuid,sessao_id uuid,tipo text not null check(tipo in ('painel','ao-vivo','replay','busca')),acao text not null check(acao in ('abriu','fechou','buscou','exportou','negado')),criado_em timestamptz not null default now());
comment on table public.auditoria_monitoramento_admin is 'Cada abertura e fechamento de painel, cabine e replay pelo monitoramento; buscas; tentativas negadas. Sem segredos.';
create index if not exists auditoria_monitoramento_admin_marca_idx on public.auditoria_monitoramento_admin(marca,criado_em desc);
create index if not exists auditoria_monitoramento_admin_admin_idx on public.auditoria_monitoramento_admin(admin_id,criado_em desc);
create index if not exists auditoria_monitoramento_admin_cliente_idx on public.auditoria_monitoramento_admin(cliente_id,criado_em desc) where cliente_id is not null;
create index if not exists auditoria_monitoramento_admin_sessao_idx on public.auditoria_monitoramento_admin(sessao_id,criado_em desc) where sessao_id is not null;
alter table public.sessoes_robos_ao_vivo enable row level security;
alter table public.pulsos_robos_ao_vivo enable row level security;
alter table public.eventos_robos_ao_vivo enable row level security;
alter table public.auditoria_monitoramento_admin enable row level security;
create policy "admin da marca ve o espelho" on public.sessoes_robos_ao_vivo for select to authenticated using(public.teeds_sou_admin_da(marca));
create policy "admin da marca ve o pulso" on public.pulsos_robos_ao_vivo for select to authenticated using(public.teeds_sou_admin_da(marca));
create policy "admin da marca ve os eventos" on public.eventos_robos_ao_vivo for select to authenticated using(public.teeds_sou_admin_da(marca));
create policy "admin da marca ve a auditoria" on public.auditoria_monitoramento_admin for select to authenticated using(public.teeds_sou_admin_da(marca));
revoke insert,update,delete,truncate on public.sessoes_robos_ao_vivo,public.pulsos_robos_ao_vivo,public.eventos_robos_ao_vivo,public.auditoria_monitoramento_admin from anon,authenticated;
alter table public.sessoes_robos_ao_vivo replica identity full;
alter table public.pulsos_robos_ao_vivo replica identity full;
alter table public.eventos_robos_ao_vivo replica identity full;
do $$ begin
if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='sessoes_robos_ao_vivo') then alter publication supabase_realtime add table public.sessoes_robos_ao_vivo; end if;
if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='pulsos_robos_ao_vivo') then alter publication supabase_realtime add table public.pulsos_robos_ao_vivo; end if;
if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='eventos_robos_ao_vivo') then alter publication supabase_realtime add table public.eventos_robos_ao_vivo; end if;
end $$;
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
end if;
if p_cliente_id is not null and not exists(select 1 from public.clientes where user_id=p_cliente_id and marca=p_marca) then raise exception 'cliente nao pertence a esta marca' using errcode='42501'; end if;
insert into public.auditoria_monitoramento_admin(marca,admin_id,cliente_id,sessao_id,tipo,acao) values(p_marca,auth.uid(),p_cliente_id,p_sessao_id,p_tipo,p_acao) returning id into v_id;
return v_id;
end $$;
revoke all on function public.teeds_auditar_monitoramento(text,text,text,uuid,uuid) from public,anon;
grant execute on function public.teeds_auditar_monitoramento(text,text,text,uuid,uuid) to authenticated;
create or replace function public.teeds_auditar_negado(p_marca text) returns void language plpgsql security definer set search_path=public as $$ begin
if auth.uid() is null or p_marca not in ('teeds','omni') then return; end if;
if exists(select 1 from public.auditoria_monitoramento_admin where admin_id=auth.uid() and acao='negado' and criado_em>now()-interval '1 minute') then return; end if;
insert into public.auditoria_monitoramento_admin(marca,admin_id,tipo,acao) values(p_marca,auth.uid(),'painel','negado');
end $$;
revoke all on function public.teeds_auditar_negado(text) from public,anon;
grant execute on function public.teeds_auditar_negado(text) to authenticated;
create or replace function public.teeds_limpar_espelho(p_dias_eventos integer default 30,p_dias_fotos integer default 30,p_dias_auditoria integer default 365) returns json language plpgsql security definer set search_path=public as $$
declare v_eventos integer; v_fotos integer; v_pulsos integer; v_auditoria integer; v_papel text;
begin
v_papel:=coalesce(nullif(current_setting('request.jwt.claim.role',true),''),current_user::text);
if v_papel not in ('service_role','postgres') then raise exception 'somente o servidor' using errcode='42501'; end if;
delete from public.eventos_robos_ao_vivo where criado_em<now()-make_interval(days=>p_dias_eventos); get diagnostics v_eventos=row_count;
delete from public.sessoes_robos_ao_vivo v using public.sessoes_robos s where s.id=v.sessao_id and s.situacao<>'rodando' and v.atualizada_em<now()-make_interval(days=>p_dias_fotos); get diagnostics v_fotos=row_count;
delete from public.pulsos_robos_ao_vivo v using public.sessoes_robos s where s.id=v.sessao_id and s.situacao<>'rodando' and v.atualizada_em<now()-make_interval(days=>p_dias_fotos); get diagnostics v_pulsos=row_count;
delete from public.auditoria_monitoramento_admin where criado_em<now()-make_interval(days=>p_dias_auditoria); get diagnostics v_auditoria=row_count;
return json_build_object('eventos',v_eventos,'fotos',v_fotos,'pulsos',v_pulsos,'auditoria',v_auditoria);
end $$;
revoke all on function public.teeds_limpar_espelho(integer,integer,integer) from public,anon,authenticated;
grant execute on function public.teeds_limpar_espelho(integer,integer,integer) to service_role;
commit;
