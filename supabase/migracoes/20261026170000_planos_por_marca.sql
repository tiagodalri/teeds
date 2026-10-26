-- 26/10/2026 (Tiago): "poder de editar os planos, configurar, acrescentar, ver os detalhes".
--
-- Antes: os planos eram linhas de `planos` COMPARTILHADAS entre as marcas
-- ('essencial' e 'pro' valiam para Teeds, OMNI e GlobalFly ao mesmo tempo), o
-- que o plano dava estava escrito no código das funções (plano_id in
-- ('pro','treino'), plano_id = 'treino'...) e todo acesso novo ganhava 30
-- dias fixos. E qualquer admin de uma das marcas podia alterar a linha
-- compartilhada, mudando o plano das outras.
--
-- Agora: `planos` segue como o registro dos ids (as chaves estrangeiras de
-- clientes e clientes_pendentes apontam para ele), e cada marca tem a SUA
-- configuração em `planos_da_marca`: nome, descrição, duração, se está
-- disponível, se é o plano de quem se cadastra sozinho e os recursos. As
-- funções que liberam simulador, sala de treino e live leem esses recursos.
-- Escrita só pelas funções teeds_plano_salvar / teeds_plano_apagar.

create table if not exists public.planos_da_marca (
  marca text not null check (marca in ('teeds', 'omni', 'globalfly')),
  plano_id text not null references public.planos(id),
  nome text not null check (length(btrim(nome)) between 2 and 60),
  descricao text check (descricao is null or length(descricao) <= 300),
  duracao_dias integer check (duracao_dias is null or duracao_dias between 1 and 3650),
  ativo boolean not null default true,
  padrao boolean not null default false,
  recursos jsonb not null default '{}'::jsonb,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (marca, plano_id)
);
create unique index if not exists planos_da_marca_um_padrao on public.planos_da_marca (marca) where padrao;

-- A configuração de hoje, linha por marca (o nome "Vitalício" estava gravado com acento quebrado)
insert into public.planos_da_marca (marca, plano_id, nome, descricao, duracao_dias, ativo, padrao, recursos, ordem, criado_em)
select m, p.id,
       case p.id when 'vitalicio' then 'Vitalício' else p.nome end,
       case p.id
         when 'essencial' then 'Robôs, operar, aulas e gerenciamento, sem o simulador de treinamento.'
         when 'pro' then 'Tudo do plano sem simulador, mais o simulador de treinamento.'
         when 'treino' then 'Quem assiste os ensaios da sala de treino. Não entra na live aberta.'
         else null end,
       p.duracao_dias, p.ativo, p.id = 'essencial',
       jsonb_build_object(
         -- na GlobalFly o simulador sempre foi de todos (a regra ficava na função)
         'simulador', coalesce((p.recursos->>'simulador')::boolean, false) or p.id in ('pro', 'treino') or m = 'globalfly',
         'sala_de_treino', p.id = 'treino',
         'ao_vivo', p.id <> 'treino'),
       case p.id when 'essencial' then 1 when 'pro' then 2 when 'treino' then 3 else 9 end,
       p.criado_em
  from public.planos p, unnest(p.marcas) m
on conflict (marca, plano_id) do nothing;

alter table public.planos_da_marca enable row level security;
drop policy if exists "cada um ve os planos da sua marca" on public.planos_da_marca;
create policy "cada um ve os planos da sua marca" on public.planos_da_marca for select to authenticated
  using (public.teeds_sou_admin_da(marca) or marca = public.teeds_marca_da_conta(auth.jwt()->>'email'));

-- O registro `planos` deixa de ser editável direto (era assim que uma marca mexia na outra)
drop policy if exists "admin gerencia planos da sua marca" on public.planos;

/* ------------------------------------------------------------ o que o plano libera */
create or replace function public.teeds_plano_tem(p_marca text, p_plano text, p_recurso text, p_se_faltar boolean default false)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (pm.recursos->>p_recurso)::boolean from planos_da_marca pm where pm.marca = p_marca and pm.plano_id = p_plano), p_se_faltar);
$$;

create or replace function public.teeds_simulador_permitido(p_user uuid, p_marca text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from administradores where user_id = p_user and marca = p_marca)
      or exists(select 1 from clientes c where c.user_id = p_user and c.marca = p_marca
       and public.teeds_plano_tem(c.marca, c.plano_id, 'simulador')
       and c.status_acesso = 'ativo' and (c.acesso_expira_em is null or c.acesso_expira_em > now()));
$$;

create or replace function public.teeds_minha_sala_de_treino(p_marca text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.teeds_sou_admin_da(p_marca) or exists (
    select 1 from public.clientes c
    where c.user_id = (select auth.uid()) and c.marca = p_marca
      and public.teeds_plano_tem(c.marca, c.plano_id, 'sala_de_treino')
      and coalesce(c.status_acesso, 'ativo') = 'ativo'
      and (c.acesso_expira_em is null or c.acesso_expira_em > now())
  );
$$;

create or replace function public.teeds_pode_assistir(p_marca text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.teeds_sou_admin_da(p_marca) or exists (
    select 1 from public.clientes c
    where c.user_id = (select auth.uid()) and c.marca = p_marca
      and coalesce(c.status_acesso, 'ativo') = 'ativo'
      and public.teeds_plano_tem(c.marca, c.plano_id, 'ao_vivo', true)
  );
$$;

/* ------------------------------------------------------------ duração e plano de quem chega */
create or replace function public.teeds_plano_padrao(p_marca text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select plano_id from planos_da_marca where marca = p_marca and padrao limit 1), 'essencial');
$$;

create or replace function public.teeds_validade_do_plano(p_marca text, p_plano text)
returns timestamptz language sql stable security definer set search_path = public as $$
  -- sem linha da marca, os 30 dias de sempre; duração vazia, sem vencimento
  select case
    when not exists (select 1 from planos_da_marca where marca = p_marca and plano_id = p_plano) then now() + interval '30 days'
    else (select case when duracao_dias is null then null else now() + make_interval(days => duracao_dias) end
            from planos_da_marca where marca = p_marca and plano_id = p_plano) end;
$$;

create or replace function public.teeds_novo_cliente()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_real text := public.teeds_email_real(new.email);
  v_marca text := public.teeds_marca_da_conta(new.email);
  v_pedida text := nullif(new.raw_user_meta_data->>'marca', '');
  v_status text := 'ativo';
  v_plano text;
begin
  if v_pedida is not null and v_pedida <> v_marca then
    raise exception 'Atualize a página e faça o cadastro de novo.';
  end if;
  if exists (
    select 1 from public.clientes_pendentes p
    where p.marca = v_marca
      and lower(p.email) = lower(v_real)
      and p.status in ('pendente', 'processando')
  ) then
    v_status := 'pendente';
  end if;
  v_plano := public.teeds_plano_padrao(v_marca);

  insert into public.clientes
    (user_id, marca, nome, email, telefone, cpf, criado_em, visto_em,
     plano_id, status_acesso, acesso_inicio, acesso_expira_em)
  values
    (new.id, v_marca,
     new.raw_user_meta_data->>'nome', v_real,
     new.raw_user_meta_data->>'telefone', new.raw_user_meta_data->>'cpf',
     coalesce(new.created_at, now()), now(),
     v_plano, v_status, now(),
     case when v_status = 'ativo' then public.teeds_validade_do_plano(v_marca, v_plano) end)
  on conflict (user_id, marca) do nothing;
  return new;
end;
$$;

create or replace function public.teeds_finalizar_lead(p_id uuid, p_trava uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
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
    (p_user, r.marca, r.nome, r.email, r.telefone, r.plano_id, 'ativo', now(), public.teeds_validade_do_plano(r.marca, r.plano_id))
  on conflict (user_id, marca) do update
    set plano_id = excluded.plano_id,
        status_acesso = case when public.clientes.status_acesso = 'pendente'
                             then 'ativo' else public.clientes.status_acesso end,
        acesso_inicio = case when public.clientes.status_acesso = 'pendente'
                             then now() else public.clientes.acesso_inicio end,
        acesso_expira_em = case when public.clientes.status_acesso = 'pendente'
                                then excluded.acesso_expira_em else public.clientes.acesso_expira_em end;

  update public.clientes_pendentes
    set status = 'aprovado', user_id = p_user, decidido_em = now(), trava_ate = null
    where id = p_id;
end;
$$;

/* ------------------------------------------------------------ a ficha só aceita plano da marca */
create or replace function public.teeds_proteger_plano()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.planos_da_marca where plano_id = new.plano_id and marca = new.marca) then
    raise exception 'Escolha um dos planos de clientes desta plataforma';
  end if;
  if tg_op = 'INSERT' and new.marca = 'globalfly' and new.categoria is null then
    new.categoria := 'gold';
  end if;
  if auth.role()='authenticated' and not public.teeds_sou_admin_da(new.marca) then
    if tg_op='INSERT' then
      if new.plano_id <> public.teeds_plano_padrao(new.marca) then raise exception 'Somente o administrador pode liberar o simulador'; end if;
      new.categoria := case when new.marca = 'globalfly' then 'gold' else null end;
    elsif new.plano_id is distinct from old.plano_id or new.status_acesso is distinct from old.status_acesso
          or new.acesso_expira_em is distinct from old.acesso_expira_em
          or new.categoria is distinct from old.categoria then
      raise exception 'Somente o administrador pode alterar o acesso';
    end if;
  end if;
  return new;
end $$;

create or replace function public.teeds_decidir_lead(p_id uuid, p_marca text, p_admin uuid, p_acao text, p_trava uuid, p_plano text default 'essencial')
returns jsonb language plpgsql security definer set search_path = public as $$
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
    -- qualquer plano disponível que a marca ofereça
    if not exists(select 1 from public.planos_da_marca where plano_id=p_plano and ativo and marca=p_marca) then raise exception 'Plano inválido'; end if;
    update public.clientes_pendentes set plano_id=case when status='pendente' then p_plano else plano_id end,status='processando',trava=p_trava,trava_ate=now()+interval '2 minutes',decidido_por=p_admin where id=p_id returning * into r;
  else raise exception 'Ação inválida'; end if;
  return to_jsonb(r);
end $$;

create or replace function public.teeds_aulas_controle(p_marca text)
returns table (aula_id text, user_id uuid, nome text, email text, plano text, aberturas integer, segundos integer, duracao_seg integer, posicao_max real, concluida boolean, primeira_vez timestamptz, ultima_vez timestamptz)
language sql stable security definer set search_path = public as $$
  select g.aula_id, g.user_id,
         coalesce(nullif(u.raw_user_meta_data->>'nome',''), nullif(u.raw_user_meta_data->>'name',''), split_part(u.email,'@',1)) as nome,
         regexp_replace(u.email, '\+marca-[a-z]+@', '@') as email,
         coalesce(pm.nome, c.plano_id, case when a.user_id is not null then 'Administrador' end) as plano,
         g.aberturas, g.segundos, g.duracao_seg, g.posicao_max, g.concluida, g.primeira_vez, g.ultima_vez
    from public.aulas_progresso g
    join auth.users u on u.id = g.user_id
    left join public.clientes c on c.user_id = g.user_id and c.marca = g.marca
    left join public.planos_da_marca pm on pm.marca = c.marca and pm.plano_id = c.plano_id
    left join public.administradores a on a.user_id = g.user_id and a.marca = g.marca
   where g.marca = p_marca and public.teeds_sou_admin_da(p_marca)
   order by g.ultima_vez desc;
$$;

/* ------------------------------------------------------------ o painel de planos */
create or replace function public.teeds_planos_painel(p_marca text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.teeds_sou_admin_da(p_marca) then raise exception 'Somente administradores'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', pm.plano_id, 'nome', pm.nome, 'descricao', pm.descricao, 'duracao_dias', pm.duracao_dias,
      'ativo', pm.ativo, 'padrao', pm.padrao, 'recursos', pm.recursos, 'ordem', pm.ordem,
      'criado_em', pm.criado_em, 'atualizado_em', pm.atualizado_em,
      'clientes', (select count(*) from clientes c where c.marca = pm.marca and c.plano_id = pm.plano_id),
      'ativos', (select count(*) from clientes c where c.marca = pm.marca and c.plano_id = pm.plano_id
                   and coalesce(c.status_acesso, 'ativo') = 'ativo' and (c.acesso_expira_em is null or c.acesso_expira_em > now())),
      'expirados', (select count(*) from clientes c where c.marca = pm.marca and c.plano_id = pm.plano_id
                   and coalesce(c.status_acesso, 'ativo') = 'ativo' and c.acesso_expira_em <= now()),
      'novos_30d', (select count(*) from clientes c where c.marca = pm.marca and c.plano_id = pm.plano_id and c.criado_em > now() - interval '30 days'),
      'pendentes', (select count(*) from clientes_pendentes p where p.marca = pm.marca and p.plano_id = pm.plano_id and p.status in ('pendente', 'processando'))
    ) order by pm.ordem, pm.nome)
    from planos_da_marca pm where pm.marca = p_marca), '[]'::jsonb);
end $$;

create or replace function public.teeds_plano_salvar(p_marca text, p_id text, p_nome text, p_descricao text, p_duracao_dias integer, p_ativo boolean, p_padrao boolean, p_recursos jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_id text := nullif(btrim(coalesce(p_id, '')), '');
  v_novo boolean := false;
  v_base text; n int := 1;
  v_recursos jsonb;
begin
  if not public.teeds_sou_admin_da(p_marca) then raise exception 'Somente administradores'; end if;
  if length(btrim(coalesce(p_nome, ''))) < 2 then raise exception 'Dê um nome ao plano.'; end if;
  if p_duracao_dias is not null and (p_duracao_dias < 1 or p_duracao_dias > 3650) then raise exception 'A duração vai de 1 a 3650 dias (ou sem vencimento).'; end if;
  if coalesce(p_padrao, false) and not coalesce(p_ativo, true) then raise exception 'O plano de quem se cadastra precisa estar disponível.'; end if;
  -- só os recursos que a plataforma entende, sempre sim/não
  v_recursos := jsonb_build_object(
    'simulador', coalesce((p_recursos->>'simulador')::boolean, false),
    'sala_de_treino', coalesce((p_recursos->>'sala_de_treino')::boolean, false),
    'ao_vivo', coalesce((p_recursos->>'ao_vivo')::boolean, true));

  if v_id is null then
    v_novo := true;
    v_base := trim(both '-' from regexp_replace(lower(translate(btrim(p_nome), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')), '[^a-z0-9]+', '-', 'g'));
    if v_base = '' then v_base := 'plano'; end if;
    v_base := left(p_marca || '-' || v_base, 40);
    v_id := v_base;
    while exists (select 1 from planos where id = v_id) loop n := n + 1; v_id := v_base || '-' || n; end loop;
    insert into planos (id, nome, duracao_dias, ativo, recursos, marcas) values (v_id, btrim(p_nome), p_duracao_dias, coalesce(p_ativo, true), v_recursos, array[p_marca]);
  elsif not exists (select 1 from planos_da_marca where marca = p_marca and plano_id = v_id) then
    raise exception 'Plano não encontrado nesta plataforma.';
  end if;

  if not coalesce(p_padrao, false) and exists (select 1 from planos_da_marca where marca = p_marca and plano_id = v_id and padrao) then
    raise exception 'Este é o plano de quem se cadastra. Marque outro como padrão antes.';
  end if;
  if coalesce(p_padrao, false) then
    update planos_da_marca set padrao = false where marca = p_marca and padrao and plano_id <> v_id;
  end if;

  insert into planos_da_marca (marca, plano_id, nome, descricao, duracao_dias, ativo, padrao, recursos, ordem)
  values (p_marca, v_id, btrim(p_nome), nullif(btrim(coalesce(p_descricao, '')), ''), p_duracao_dias, coalesce(p_ativo, true), coalesce(p_padrao, false), v_recursos,
          case when v_novo then coalesce((select max(ordem) + 1 from planos_da_marca where marca = p_marca), 1) else 0 end)
  on conflict (marca, plano_id) do update set
    nome = excluded.nome, descricao = excluded.descricao, duracao_dias = excluded.duracao_dias,
    ativo = excluded.ativo, padrao = excluded.padrao, recursos = excluded.recursos, atualizado_em = now();

  insert into auditoria_admin (marca, admin_id, acao, detalhes)
  values (p_marca, auth.uid(), case when v_novo then 'plano_criado' else 'plano_alterado' end,
          jsonb_build_object('plano', v_id, 'nome', btrim(p_nome), 'duracao_dias', p_duracao_dias, 'ativo', coalesce(p_ativo, true), 'padrao', coalesce(p_padrao, false), 'recursos', v_recursos));
  return v_id;
end $$;

create or replace function public.teeds_plano_apagar(p_marca text, p_id text)
returns void language plpgsql security definer set search_path = public as $$
declare n int; p int;
begin
  if not public.teeds_sou_admin_da(p_marca) then raise exception 'Somente administradores'; end if;
  if exists (select 1 from planos_da_marca where marca = p_marca and plano_id = p_id and padrao) then
    raise exception 'Este é o plano de quem se cadastra. Marque outro como padrão antes.';
  end if;
  select count(*) into n from clientes where marca = p_marca and plano_id = p_id;
  select count(*) into p from clientes_pendentes where marca = p_marca and plano_id = p_id and status in ('pendente', 'processando');
  if n > 0 or p > 0 then
    raise exception 'Há % cliente(s) neste plano. Mude o plano deles antes, ou só desative este plano.', n + p;
  end if;
  delete from planos_da_marca where marca = p_marca and plano_id = p_id;
  update planos set marcas = array_remove(marcas, p_marca) where id = p_id;
  -- o id some de vez quando nenhuma marca e nenhum cadastro usa mais
  delete from planos where id = p_id
    and not exists (select 1 from planos_da_marca where plano_id = p_id)
    and not exists (select 1 from clientes where plano_id = p_id)
    and not exists (select 1 from clientes_pendentes where plano_id = p_id);
  insert into auditoria_admin (marca, admin_id, acao, detalhes) values (p_marca, auth.uid(), 'plano_apagado', jsonb_build_object('plano', p_id));
end $$;

revoke all on function public.teeds_planos_painel(text), public.teeds_plano_salvar(text, text, text, text, integer, boolean, boolean, jsonb), public.teeds_plano_apagar(text, text) from public, anon;
grant execute on function public.teeds_planos_painel(text), public.teeds_plano_salvar(text, text, text, text, integer, boolean, boolean, jsonb), public.teeds_plano_apagar(text, text) to authenticated;
