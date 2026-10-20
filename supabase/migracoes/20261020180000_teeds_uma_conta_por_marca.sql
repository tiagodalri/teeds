-- 20/10/2026: uma conta por marca (ver src/core/teeds/emailDaConta.ts).
--
-- O login da Supabase é um só por e-mail, e as três marcas dividem este
-- projeto: quem tinha conta na Teeds entrava na OMNI e na GlobalFly com a
-- mesma senha. Agora cada marca tem a sua conta, com a marca numa etiqueta
-- do e-mail do login (ana+marca-globalfly@gmail.com). A pessoa digita e
-- recebe e-mails sempre no endereço de verdade; a ficha (clientes.email)
-- guarda o endereço de verdade.

create or replace function public.teeds_email_da_conta(p_email text, p_marca text)
returns text language sql immutable set search_path to 'public' as $$
  select case
    when coalesce(p_marca, 'teeds') = 'teeds'
      or position('@' in coalesce(p_email, '')) < 2
      or lower(p_email) ~ '\+marca-[a-z0-9]+@[^@]+$'
    then lower(trim(p_email))
    else regexp_replace(lower(trim(p_email)), '@([^@]+)$', '+marca-' || p_marca || '@\1')
  end
$$;

create or replace function public.teeds_email_real(p_email text)
returns text language sql immutable set search_path to 'public' as $$
  select regexp_replace(p_email, '\+marca-[a-z0-9]+(@[^@]+)$', '\1', 'i')
$$;

-- A marca pela etiqueta do e-mail do login; sem etiqueta é a Teeds.
create or replace function public.teeds_marca_da_conta(p_email text)
returns text language sql immutable set search_path to 'public' as $$
  select coalesce(lower(substring(p_email from '\+marca-([a-zA-Z0-9]+)@[^@]+$')), 'teeds')
$$;

-- Conta nova: a ficha nasce na marca da etiqueta e com o e-mail de verdade.
create or replace function public.teeds_novo_cliente()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_real text := public.teeds_email_real(new.email);
  v_marca text := case
    when public.teeds_marca_da_conta(new.email) <> 'teeds' then public.teeds_marca_da_conta(new.email)
    else coalesce(nullif(new.raw_user_meta_data->>'marca', ''), 'teeds') end;
  v_status text := 'ativo';
begin
  -- Há um cadastro esperando aprovação nesta marca para este e-mail? Então a
  -- conta serve só para entrar e ler "aguarde a liberação".
  if exists (
    select 1 from public.clientes_pendentes p
    where p.marca = v_marca
      and lower(p.email) = lower(v_real)
      and p.status in ('pendente', 'processando')
  ) then
    v_status := 'pendente';
  end if;

  insert into public.clientes
    (user_id, marca, nome, email, telefone, cpf, criado_em, visto_em,
     plano_id, status_acesso, acesso_inicio, acesso_expira_em)
  values
    (new.id, v_marca,
     new.raw_user_meta_data->>'nome', v_real,
     new.raw_user_meta_data->>'telefone', new.raw_user_meta_data->>'cpf',
     coalesce(new.created_at, now()), now(),
     'essencial', v_status, now(),
     case when v_status = 'ativo' then now() + interval '30 days' end)
  on conflict (user_id, marca) do nothing;
  return new;
end;
$function$;

-- Aprovação: a conta procurada é a DESTA marca.
create or replace function public.teeds_auth_do_pendente(p_id uuid, p_trava uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare r public.clientes_pendentes; u auth.users;
begin
  select * into r from public.clientes_pendentes where id=p_id and trava=p_trava and status='processando' and trava_ate>now();
  if not found then raise exception 'Aprovação expirada'; end if;
  select * into u from auth.users where lower(email)=public.teeds_email_da_conta(r.email, r.marca) limit 1;
  if not found then return null; end if;
  return jsonb_build_object('id',u.id);
end $function$;

create or replace function public.teeds_finalizar_lead(p_id uuid, p_trava uuid, p_user uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare r public.clientes_pendentes;
begin
  select * into r from public.clientes_pendentes where id = p_id for update;
  if r.status <> 'processando' or r.trava <> p_trava or r.trava_ate <= now() then
    raise exception 'Aprovação expirada';
  end if;
  if not exists (select 1 from auth.users where id = p_user and lower(email) = public.teeds_email_da_conta(r.email, r.marca)) then
    raise exception 'Conta incompatível';
  end if;

  insert into public.clientes
    (user_id, marca, nome, email, telefone, plano_id, status_acesso, acesso_inicio, acesso_expira_em)
  values
    (p_user, r.marca, r.nome, r.email, r.telefone, r.plano_id, 'ativo', now(), now() + interval '30 days')
  on conflict (user_id, marca) do update
    -- O plano vem sempre: foi uma escolha explicita do admin nesta aprovacao,
    -- e descartar uma escolha sem avisar e pior do que recusar a acao.
    set plano_id = excluded.plano_id,
        -- Status e validade so para quem estava esperando. Aprovar nao
        -- ressuscita conta suspensa, expirada ou cancelada.
        status_acesso = case when public.clientes.status_acesso = 'pendente'
                             then 'ativo' else public.clientes.status_acesso end,
        acesso_inicio = case when public.clientes.status_acesso = 'pendente'
                             then now() else public.clientes.acesso_inicio end,
        acesso_expira_em = case when public.clientes.status_acesso = 'pendente'
                                then now() + interval '30 days' else public.clientes.acesso_expira_em end;

  update public.clientes_pendentes
    set status = 'aprovado', user_id = p_user, decidido_em = now(), trava_ate = null
    where id = p_id;
end;
$function$;

-- A ficha aceita qualquer plano que a marca ofereça (tabela planos). Antes
-- só 'essencial' e 'pro': o GF Member era recusado no fim da aprovação.
create or replace function public.teeds_proteger_plano()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if not exists (select 1 from public.planos where id = new.plano_id and new.marca = any(marcas)) then
    raise exception 'Escolha um dos planos de clientes desta plataforma';
  end if;
  if auth.role()='authenticated' and not public.teeds_sou_admin_da(new.marca) then
    if tg_op='INSERT' then
      if new.plano_id<>'essencial' then raise exception 'Somente o administrador pode liberar o simulador'; end if;
    elsif new.plano_id is distinct from old.plano_id or new.status_acesso is distinct from old.status_acesso
          or new.acesso_expira_em is distinct from old.acesso_expira_em then
      raise exception 'Somente o administrador pode alterar o acesso';
    end if;
  end if;
  return new;
end $function$;

-- A sessão ao vivo acompanha a sessão quando ela muda de conta.
alter table public.sessoes_robos_ao_vivo drop constraint if exists sessoes_robos_ao_vivo_sessao_id_marca_user_id_fkey;
do $$ declare c text; begin
  select conname into c from pg_constraint
   where conrelid = 'public.sessoes_robos_ao_vivo'::regclass and contype = 'f' and confrelid = 'public.sessoes_robos'::regclass;
  if c is not null then execute format('alter table public.sessoes_robos_ao_vivo drop constraint %I', c); end if;
end $$;
alter table public.sessoes_robos_ao_vivo
  add constraint sessoes_robos_ao_vivo_sessao_id_marca_user_id_fkey
  foreign key (sessao_id, marca, user_id) references public.sessoes_robos(id, marca, user_id)
  on update cascade on delete cascade;

-- ------------------------------------------------ separar as contas antigas
-- Usadas uma vez pelo servidor (servidor/src/separar-contas.ts), só com a
-- chave de serviço.

-- A conta nova da marca nasce com a mesma senha de hoje (a cifra é copiada
-- aqui dentro, nunca sai do banco); a partir daí cada uma segue sozinha.
create or replace function public.teeds_copiar_senha(p_de uuid, p_para uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if public.teeds_marca_da_conta((select email from auth.users where id = p_para)) = 'teeds' then
    raise exception 'Só a conta nova de outra marca recebe a senha';
  end if;
  update auth.users set encrypted_password = (select encrypted_password from auth.users where id = p_de)
   where id = p_para;
end;
$function$;

-- Passa para a conta nova tudo o que é desta marca: ficha, admin, Deriv,
-- sessões, operações, aulas, chat, lives... Toda tabela com user_id e marca
-- entra sozinha (as cópias de segurança backup_* ficam como estão).
create or replace function public.teeds_mover_dados_da_marca(p_de uuid, p_para uuid, p_marca text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare t record; n bigint; feito jsonb := '{}'::jsonb;
begin
  if p_marca = 'teeds' then raise exception 'A Teeds fica na conta de sempre'; end if;
  if public.teeds_marca_da_conta((select email from auth.users where id = p_para)) <> p_marca then
    raise exception 'A conta de destino não é da %', p_marca;
  end if;
  -- a ficha que o gatilho criou na conta nova dá lugar à de verdade
  delete from public.clientes where user_id = p_para and marca = p_marca;
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables b on b.table_schema = c.table_schema and b.table_name = c.table_name and b.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'user_id' and c.table_name not like 'backup\_%'
      and c.table_name <> 'sessoes_robos_ao_vivo' -- vai junto com sessoes_robos (on update cascade)
      and exists (select 1 from information_schema.columns m where m.table_schema = 'public' and m.table_name = c.table_name and m.column_name = 'marca')
  loop
    execute format('update public.%I set user_id = $1 where user_id = $2 and marca = $3', t.table_name) using p_para, p_de, p_marca;
    get diagnostics n = row_count;
    if n > 0 then feito := feito || jsonb_build_object(t.table_name, n); end if;
  end loop;
  update public.live_mensagens set user_id = p_para where user_id = p_de and live_id in (select id from public.lives where marca = p_marca);
  update public.live_silenciados set user_id = p_para where user_id = p_de and live_id in (select id from public.lives where marca = p_marca);
  update public.auditoria_admin set admin_id = p_para where admin_id = p_de and marca = p_marca;
  update public.auditoria_admin set cliente_id = p_para where cliente_id = p_de and marca = p_marca;
  update public.auditoria_monitoramento_admin set admin_id = p_para where admin_id = p_de and marca = p_marca;
  update public.auditoria_monitoramento_admin set cliente_id = p_para where cliente_id = p_de and marca = p_marca;
  return feito;
end;
$function$;

revoke all on function public.teeds_copiar_senha(uuid, uuid) from public, anon, authenticated;
revoke all on function public.teeds_mover_dados_da_marca(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.teeds_copiar_senha(uuid, uuid) to service_role;
grant execute on function public.teeds_mover_dados_da_marca(uuid, uuid, text) to service_role;
