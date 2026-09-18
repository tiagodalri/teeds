-- Fichas sem login: só a aprovação explícita pode criar um acesso.
begin;
create table public.clientes_pendentes (
  id uuid primary key default gen_random_uuid(),
  marca text not null check (marca in ('teeds','omni')),
  email text not null, nome text not null, telefone text not null,
  status text not null default 'pendente' check (status in ('pendente','processando','aprovado','recusado')),
  criado_em timestamptz not null default now(),
  decidido_em timestamptz, decidido_por uuid references auth.users(id),
  user_id uuid references auth.users(id),
  plano_id text not null default 'essencial' check(plano_id in ('essencial','pro')),
  trava uuid, trava_ate timestamptz,
  email_enviado_em timestamptz,
  unique(marca,email)
);
alter table public.clientes_pendentes enable row level security;
create policy "admin le pendentes da marca" on public.clientes_pendentes
  for select to authenticated using (public.teeds_sou_admin_da(marca));
revoke all on public.clientes_pendentes from anon, authenticated;
grant select on public.clientes_pendentes to authenticated;
grant all on public.clientes_pendentes to service_role;

create function public.teeds_lead_pendente() returns trigger language plpgsql
security definer set search_path = public as $$
declare d jsonb;
begin
  if tg_table_name = 'auditoria_admin' then
    if new.acao <> 'lead_capturado' then return new; end if;
    d := new.detalhes || jsonb_build_object('marca',new.marca);
  else d := to_jsonb(new); end if;
  -- Quem já é cliente não volta para a fila e não tem o acesso alterado.
  if exists(select 1 from public.clientes c where c.marca=d->>'marca' and lower(c.email)=lower(d->>'email')) then return new; end if;
  insert into public.clientes_pendentes(marca,email,nome,telefone)
  values(d->>'marca',lower(trim(d->>'email')),d->>'nome',d->>'telefone')
  on conflict(marca,email) do update set nome=excluded.nome,telefone=excluded.telefone
    where clientes_pendentes.status='pendente';
  return new;
end $$;
create trigger lead_pendente after insert or update on public.leads_capturados
  for each row execute function public.teeds_lead_pendente();
create trigger lead_alternativo_pendente after insert on public.auditoria_admin
  for each row execute function public.teeds_lead_pendente();

-- Trava durável: dois administradores/servidores não aprovam a mesma ficha.
create function public.teeds_decidir_lead(p_id uuid,p_marca text,p_admin uuid,p_acao text,p_trava uuid,p_plano text default 'essencial')
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.clientes_pendentes;
begin
  if not exists(select 1 from public.administradores where user_id=p_admin and marca=p_marca) then raise exception 'Administrador não autorizado'; end if;
  select * into r from public.clientes_pendentes where id=p_id and marca=p_marca for update;
  if not found then raise exception 'Cadastro não encontrado'; end if;
  if r.status in ('aprovado','recusado') then return to_jsonb(r); end if;
  if r.status='processando' and r.trava_ate>now() then raise exception 'Aprovação em andamento. Aguarde.'; end if;
  if p_acao='recusar' then
    -- Uma aprovação iniciada pode ter criado o login: só pode ser retomada.
    if r.status='processando' then raise exception 'Retome a aprovação já iniciada'; end if;
    update public.clientes_pendentes set status='recusado',decidido_por=p_admin,decidido_em=now() where id=p_id returning * into r;
  elsif p_acao='aprovar' then
    if p_plano not in ('essencial','pro') then raise exception 'Plano inválido'; end if;
    update public.clientes_pendentes set plano_id=case when status='pendente' then p_plano else plano_id end,status='processando',trava=p_trava,trava_ate=now()+interval '2 minutes',decidido_por=p_admin where id=p_id returning * into r;
  else raise exception 'Ação inválida'; end if;
  return to_jsonb(r);
end $$;

-- Só o servidor consulta Auth, e apenas pelo e-mail da ficha em aprovação.
create function public.teeds_auth_do_pendente(p_id uuid,p_trava uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.clientes_pendentes; u auth.users;
begin
  select * into r from public.clientes_pendentes where id=p_id and trava=p_trava and status='processando' and trava_ate>now();
  if not found then raise exception 'Aprovação expirada'; end if;
  select * into u from auth.users where lower(email)=r.email limit 1;
  if not found then return null; end if;
  return jsonb_build_object('id',u.id);
end $$;

create function public.teeds_finalizar_lead(p_id uuid,p_trava uuid,p_user uuid)
returns void language plpgsql security definer set search_path=public as $$
declare r public.clientes_pendentes;
begin
  select * into r from public.clientes_pendentes where id=p_id for update;
  if r.status<>'processando' or r.trava<>p_trava or r.trava_ate<=now() then raise exception 'Aprovação expirada'; end if;
  if not exists(select 1 from auth.users where id=p_user and lower(email)=r.email) then raise exception 'Conta incompatível'; end if;
  insert into public.clientes(user_id,marca,nome,email,telefone,plano_id,status_acesso,acesso_inicio,acesso_expira_em)
  values(p_user,r.marca,r.nome,r.email,r.telefone,r.plano_id,'ativo',now(),now()+interval '30 days')
  on conflict(user_id,marca) do nothing;
  -- O trigger de Auth cria a ficha padrão; ajusta só a conta desta aprovação.
  if exists(select 1 from auth.users where id=p_user and raw_app_meta_data->>'aprovacao_lead'=p_id::text) then
    update public.clientes set plano_id=r.plano_id where user_id=p_user and marca=r.marca;
  end if;
  update public.clientes_pendentes set status='aprovado',user_id=p_user,decidido_em=now(),trava_ate=null where id=p_id;
end $$;

revoke all on function public.teeds_lead_pendente() from public,anon,authenticated;
revoke all on function public.teeds_decidir_lead(uuid,text,uuid,text,uuid,text) from public,anon,authenticated;
revoke all on function public.teeds_auth_do_pendente(uuid,uuid) from public,anon,authenticated;
revoke all on function public.teeds_finalizar_lead(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.teeds_decidir_lead(uuid,text,uuid,text,uuid,text) to service_role;
grant execute on function public.teeds_auth_do_pendente(uuid,uuid) to service_role;
grant execute on function public.teeds_finalizar_lead(uuid,uuid,uuid) to service_role;
commit;
