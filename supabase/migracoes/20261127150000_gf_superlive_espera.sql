-- Super Live de domingo, 29/11/2026 (27/11, Tiago): quem se inscreve pela /superlive (e /n/superlive,
-- /v/superlive) e AINDA NÃO É CLIENTE entra na plataforma com tudo bloqueado, e o acesso é efetivado na
-- live (botão "Liberar os novos inscritos", em Administração › Clientes). Quem já é cliente não muda:
-- nem os ativos de hoje, nem um cliente ativo que se inscreva na página.
--
-- As colunas e a tabela superlive_controle vieram na parte 1 (gf_superlive_colunas).
--  - clientes_pendentes.superlive        = a inscrição veio da página da Super Live;
--  - clientes_pendentes.superlive_segura = cadastro novo que espera a live.
-- Desfazer tudo de uma vez: update superlive_controle set liberado_em = now() where marca = 'globalfly'
-- (ninguém mais é segurado; quem já está esperando sai pelo botão de liberar).

-- 1) a ficha nasce marcada
create or replace function public.teeds_lead_pendente()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare d jsonb; v_email text; v_marca text; v_recadastro boolean; v_sl boolean; v_segura boolean;
begin
  if tg_table_name = 'auditoria_admin' then
    if new.acao <> 'lead_capturado' then return new; end if;
    d := new.detalhes || jsonb_build_object('marca',new.marca);
  else
    -- Uma edição administrativa do lead não equivale a um novo formulário.
    if tg_op='UPDATE' then
      if new.inscricao_recebida_em is not distinct from old.inscricao_recebida_em then return new; end if;
    end if;
    d := to_jsonb(new);
  end if;
  v_email := lower(trim(d->>'email')); v_marca := d->>'marca';
  -- Serializa inclusive o caminho alternativo da captura, sem travar outras pessoas.
  perform pg_advisory_xact_lock(hashtextextended(v_marca || ':' || v_email,0));
  v_recadastro := exists(select 1 from public.clientes c where c.marca=v_marca and lower(trim(c.email))=v_email)
    or exists(select 1 from public.clientes_pendentes p where p.marca=v_marca and p.email=v_email);
  -- Super Live: só segura quem é NOVO de verdade (sem ficha de cliente e sem cadastro já aprovado antes)
  v_sl := v_marca = 'globalfly' and coalesce(d->>'pagina','') ~* '/superlive';
  v_segura := v_sl
    and exists(select 1 from public.superlive_controle s where s.marca = v_marca and s.liberado_em is null)
    and not exists(select 1 from public.clientes c where c.marca=v_marca and lower(trim(c.email))=v_email)
    and not exists(select 1 from public.clientes_pendentes p where p.marca=v_marca and p.email=v_email and p.status='aprovado');
  insert into public.clientes_pendentes(marca,email,nome,telefone,recadastro,ultima_inscricao_em,superlive,superlive_segura)
  values(v_marca,v_email,d->>'nome',d->>'telefone',v_recadastro,now(),v_sl,v_segura)
  on conflict(marca,email) where status in ('pendente','processando')
  do update set nome=excluded.nome,telefone=excluded.telefone,
    recadastro=clientes_pendentes.recadastro or excluded.recadastro,
    ultima_inscricao_em=excluded.ultima_inscricao_em,
    superlive=clientes_pendentes.superlive or excluded.superlive,
    superlive_segura=clientes_pendentes.superlive_segura or excluded.superlive_segura
  -- A ficha em aprovação fica estável até finalizar ou retomar sua trava.
  where clientes_pendentes.status='pendente';
  return new;
end $function$;

-- 2) esta pessoa está esperando a Super Live?
create or replace function public.gf_superlive_segura(p_user uuid, p_email text)
 returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select exists(select 1 from public.superlive_controle s where s.marca = 'globalfly' and s.liberado_em is null)
     and exists(select 1 from public.clientes_pendentes x
                 where x.marca = 'globalfly' and x.superlive_segura and x.status in ('pendente','processando')
                   and (x.user_id = p_user or lower(x.email) = lower(trim(coalesce(p_email,'')))));
$function$;
revoke all on function public.gf_superlive_segura(uuid, text) from public, anon, authenticated;

-- 3) a ficha de cliente de quem espera nasce no plano "Aguardando live" (a plataforma mostra a tranca).
--    Só no INSERT: quem já tem ficha de cliente nunca passa por aqui.
create or replace function public.gf_superlive_segura_no_cadastro()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if new.marca = 'globalfly' and coalesce(new.status_acesso,'pendente') = 'pendente'
     and public.gf_superlive_segura(new.user_id, new.email) then
    new.plano_id := 'globalfly-aguardando-live';
    new.status_acesso := 'pendente';
  end if;
  return new;
end $function$;
drop trigger if exists superlive_segura on public.clientes;
-- o nome vem depois de "proteger_plano" na ordem dos gatilhos: o plano padrão é aplicado antes
create trigger superlive_segura before insert on public.clientes
  for each row execute function public.gf_superlive_segura_no_cadastro();

-- 4) a liberação automática da GlobalFly pula quem espera a Super Live
create or replace function public.teeds_gf_liberar_novos()
 returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_n integer := 0;
  v_ate constant timestamptz := '2027-11-09 23:59:59-03';
  v_quem uuid := '8afd3fd3-fb8b-4ea3-bbc6-548a59359367';
begin
  if current_setting('teeds.liberando_gf', true) = '1' then return 0; end if;
  if not exists (select 1 from public.clientes where marca = 'globalfly' and status_acesso = 'pendente'
                  and plano_id in ('treino', 'globalfly-aguardando-live')) then return 0; end if;
  perform set_config('teeds.liberando_gf', '1', true);

  with alvo as materialized (
    select c.user_id, cp.id as lead
      from public.clientes c
      left join lateral (
        select x.id from public.clientes_pendentes x
         where x.marca = 'globalfly'
           and (x.status = 'pendente' or (x.status = 'processando' and (x.trava_ate is null or x.trava_ate < now())))
           and (x.user_id = c.user_id or lower(x.email) = lower(c.email))
         order by (x.user_id = c.user_id) desc nulls last limit 1) cp on true
     where c.marca = 'globalfly' and c.status_acesso = 'pendente' and c.plano_id in ('treino', 'globalfly-aguardando-live')
       and not public.gf_superlive_segura(c.user_id, c.email)
       and (cp.id is not null or not exists (
             select 1 from public.clientes_pendentes y
              where y.marca = 'globalfly' and y.status = 'recusado'
                and (y.user_id = c.user_id or lower(y.email) = lower(c.email))))
  ), cli as (
    update public.clientes c
       set plano_id = 'treino', status_acesso = 'ativo', acesso_inicio = now(), acesso_expira_em = v_ate
      from alvo a
     where c.user_id = a.user_id and c.marca = 'globalfly' and c.status_acesso = 'pendente'
    returning c.user_id
  ), led as (
    update public.clientes_pendentes x
       set status = 'aprovado', plano_id = 'treino', user_id = a.user_id,
           decidido_em = now(), decidido_por = v_quem, trava = null, trava_ate = null
      from alvo a
     where x.id = a.lead
       and (x.status = 'pendente' or (x.status = 'processando' and (x.trava_ate is null or x.trava_ate < now())))
    returning x.id, a.user_id
  ), usu as (
    update auth.users u
       set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
             || jsonb_build_object('aprovacao_lead', l.id)
             || case when coalesce((u.raw_app_meta_data->>'senha_propria')::boolean, false) = false
                          and u.raw_user_meta_data->>'trocar_senha' = 'true'
                     then jsonb_build_object('senha_aprovacao_versao', 'provisoria-v2') else '{}'::jsonb end
      from led l
     where u.id = l.user_id
    returning 1
  )
  select (select count(*) from cli) + 0 * (select count(*) from usu) into v_n;

  if v_n > 0 then
    update public.lancamento_live set liberados = coalesce(liberados, 0) + v_n, atualizado_em = now() where marca = 'globalfly';
  end if;
  perform set_config('teeds.liberando_gf', '0', true);
  return v_n;
end $function$;

-- 5) o botão de liberar (Administração › Clientes): libera quem espera e encerra a espera da Super Live.
--    O que era só de 09/11 (levar "Sem simulador" para GF Member e trocar o plano padrão) não roda de novo.
create or replace function public.teeds_lancamento_liberar_agora(p_marca text, p_quem uuid)
 returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_n integer := 0;
  v_ate constant timestamptz := '2027-11-09 23:59:59-03';
  v_primeira boolean;
begin
  if p_marca <> 'globalfly' then raise exception 'A liberação do lançamento é só da GlobalFly'; end if;
  select liberado_em is null into v_primeira from public.lancamento_live where marca = p_marca;
  -- a espera acaba ANTES de liberar: os gatilhos que rodam junto já não seguram ninguém
  update public.superlive_controle set liberado_em = now(), liberado_por = p_quem where marca = p_marca and liberado_em is null;

  with alvo as materialized (
    select c.user_id, cp.id as lead
      from public.clientes c
      left join lateral (
        select x.id from public.clientes_pendentes x
         where x.marca = p_marca
           and (x.status = 'pendente' or (x.status = 'processando' and (x.trava_ate is null or x.trava_ate < now())))
           and (x.user_id = c.user_id or lower(x.email) = lower(c.email))
         order by (x.user_id = c.user_id) desc nulls last limit 1) cp on true
     where c.marca = p_marca and c.status_acesso = 'pendente' and c.plano_id = 'globalfly-aguardando-live'
       and (cp.id is not null or not exists (
             select 1 from public.clientes_pendentes y
              where y.marca = p_marca and y.status = 'recusado'
                and (y.user_id = c.user_id or lower(y.email) = lower(c.email))))
  ), cli as (
    update public.clientes c
       set plano_id = 'treino', status_acesso = 'ativo', acesso_inicio = now(), acesso_expira_em = v_ate
      from alvo a
     where c.user_id = a.user_id and c.marca = p_marca and c.status_acesso = 'pendente'
    returning c.user_id
  ), led as (
    update public.clientes_pendentes x
       set status = 'aprovado', plano_id = 'treino', user_id = a.user_id,
           decidido_em = now(), decidido_por = p_quem, trava = null, trava_ate = null
      from alvo a
     where x.id = a.lead
       and (x.status = 'pendente' or (x.status = 'processando' and (x.trava_ate is null or x.trava_ate < now())))
    returning x.id, a.user_id
  ), usu as (
    update auth.users u
       set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
             || jsonb_build_object('aprovacao_lead', l.id)
             || case when coalesce((u.raw_app_meta_data->>'senha_propria')::boolean, false) = false
                          and u.raw_user_meta_data->>'trocar_senha' = 'true'
                     then jsonb_build_object('senha_aprovacao_versao', 'provisoria-v2') else '{}'::jsonb end
      from led l
     where u.id = l.user_id
    returning 1
  )
  select (select count(*) from cli) + 0 * (select count(*) from usu) into v_n;

  if coalesce(v_primeira, true) then
    update public.clientes c
       set plano_id = 'treino',
           acesso_expira_em = case when c.acesso_expira_em is null and c.plano_id = 'treino' then null
                                   else greatest(coalesce(c.acesso_expira_em, v_ate), v_ate) end
     where c.marca = p_marca and c.status_acesso = 'ativo'
       and (c.plano_id = 'essencial' or (c.plano_id = 'treino' and c.acesso_expira_em < v_ate))
       and not exists (select 1 from public.administradores a where a.user_id = c.user_id and a.marca in (p_marca, 'teeds'));

    if exists (select 1 from public.planos_da_marca t where t.marca = p_marca and t.plano_id = 'treino') then
      update public.planos_da_marca set padrao = false, atualizado_em = now()
       where marca = p_marca and padrao and plano_id <> 'treino';
      update public.planos_da_marca
         set padrao = (plano_id = 'treino'),
             ativo = case when plano_id = 'globalfly-aguardando-live' then false else ativo end,
             atualizado_em = now()
       where marca = p_marca and (plano_id in ('treino', 'globalfly-aguardando-live'));
    end if;
  end if;

  update public.lancamento_live
     set liberado_em = coalesce(liberado_em, now()), liberados = coalesce(liberados, 0) + v_n, atualizado_em = now()
   where marca = p_marca;
  return v_n;
end $function$;
