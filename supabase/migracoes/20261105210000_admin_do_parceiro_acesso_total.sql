-- 05/11/2026: o admin do parceiro com ACESSO TOTAL (Tiago: "ele precisa ter acesso completo
-- ao painel de administrador assim como eu, o único detalhe é que ele não vai ver as
-- informações do Victor e de nenhum outro parceiro").
--
-- administradores.acesso_total: o admin do parceiro passa a usar todas as abas do geral.
-- Duas peças novas:
--   teeds_admin_pleno_da(marca)  = admin geral OU admin de parceiro com acesso total
--   teeds_parceiro_forcado(marca) = o código do parceiro de quem NÃO é geral (null para o geral)
-- Toda função que recebe p_parceiro passa a forçar o parceiro de quem pede: o Naor pode
-- mandar 'v' que o banco troca por 'n'. As configurações da plataforma (aulas, planos,
-- produtos, subplanos, parâmetros das I.A.) valem para a marca inteira e ficam abertas a ele.
-- Continuam só do geral: trocar o parceiro de um cliente, configurar parceiros, copiar a
-- chave de anúncios entre parceiros, excluir cadastro.

alter table public.administradores add column if not exists acesso_total boolean not null default false;

create or replace function public.teeds_parceiro_forcado(p_marca text)
returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.administradores a where a.user_id = (select auth.uid()) and a.parceiro is null
                  and (p_marca is null or p_marca = 'todas' or a.marca = p_marca or a.marca = 'teeds')) then null
    else (select a.parceiro from public.administradores a where a.user_id = (select auth.uid()) and a.parceiro is not null
           and (p_marca is null or p_marca = 'todas' or a.marca = p_marca) order by a.marca limit 1)
  end;
$$;

create or replace function public.teeds_admin_pleno_da(p_marca text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.teeds_sou_admin_da(p_marca) or exists (
    select 1 from public.administradores a
     where a.user_id = (select auth.uid()) and a.marca = p_marca and a.parceiro is not null and a.acesso_total);
$$;
revoke all on function public.teeds_parceiro_forcado(text) from public, anon;
revoke all on function public.teeds_admin_pleno_da(text) from public, anon;
grant execute on function public.teeds_parceiro_forcado(text) to authenticated, service_role;
grant execute on function public.teeds_admin_pleno_da(text) to authenticated, service_role;

-- o papel que o site lê: agora diz se o admin do parceiro tem acesso total
create or replace function public.teeds_meu_papel(p_marca text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when public.teeds_sou_admin_da(p_marca) then jsonb_build_object('admin', true, 'geral', true, 'parceiro', null, 'total', true)
    when public.teeds_sou_equipe_da(p_marca) then jsonb_build_object('admin', true, 'geral', false,
      'parceiro', (select a.parceiro from public.administradores a where a.user_id = (select auth.uid()) and a.marca = p_marca and a.parceiro is not null limit 1),
      'total', public.teeds_admin_pleno_da(p_marca))
    else jsonb_build_object('admin', false, 'geral', false, 'parceiro', null, 'total', false)
  end;
$$;

-- 1. As funções que já recebem p_parceiro: guarda vira "pleno" e o parceiro é forçado.
do $do$
declare r record; d text; extra text; antes text;
begin
  for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = any (array[
              'teeds_central_ao_vivo', 'teeds_central_pessoas', 'teeds_central_resumo', 'teeds_jornada_completa',
              'teeds_estudio_historico', 'teeds_estudio_publicos', 'teeds_estudio_rascunhos', 'teeds_estudio_salvar',
              'teeds_estudio_publico_salvar', 'teeds_meta_ads_chave_salvar', 'teeds_meta_chave_salvar', 'teeds_meta_funil',
              'teeds_meta_horarios', 'teeds_meta_situacao', 'teeds_push_publicos', 'teeds_rastreio_link_salvar'])
  loop
    d := pg_get_functiondef(r.oid);
    extra := case r.proname
      when 'teeds_central_ao_vivo' then E'\n  v_par := nullif(trim(coalesce(p_parceiro, '''')), '''');'
      when 'teeds_central_pessoas' then E'\n  v_par := nullif(trim(coalesce(p_parceiro, '''')), '''');'
      when 'teeds_central_resumo' then E'\n  v_par := nullif(trim(coalesce(p_parceiro, '''')), '''');'
      when 'teeds_jornada_completa' then E'\n  v_par := nullif(trim(coalesce(p_parceiro, '''')), '''');'
      when 'teeds_rastreio_link_salvar' then E'\n  v_par := public.teeds_parceiro_valido(p_marca, p_parceiro);'
      when 'teeds_meta_ads_chave_salvar' then E'\n  v_nome := ''META_ADS_'' || upper(p_marca) || ''_'' || upper(p_parceiro);'
      when 'teeds_meta_chave_salvar' then E'\n  v_nome := ''META_CAPI_'' || upper(p_marca) || ''_'' || upper(p_parceiro);'
      when 'teeds_meta_situacao' then E'\n  v_capi := ''META_CAPI_'' || upper(p_marca) || ''_'' || upper(p_parceiro);\n  v_ads := ''META_ADS_'' || upper(p_marca) || ''_'' || upper(p_parceiro);'
      else '' end;
    antes := d;
    d := regexp_replace(d,
      'if not public\.teeds_admin_geral_da\(p_marca\) then raise exception (''[^'']*''); end if;',
      'if not public.teeds_admin_pleno_da(p_marca) then raise exception \1; end if;'
        || E'\n  p_parceiro := coalesce(public.teeds_parceiro_forcado(p_marca), p_parceiro);' || extra);
    if d = antes then raise exception 'Não achei a guarda em %', r.proname; end if;
    execute d;
  end loop;
end $do$;

-- 2. As que não recebem p_parceiro: a linha precisa ser do parceiro de quem pede.
do $do$
declare d text; antes text;
begin
  -- central: ficha de um visitante
  d := pg_get_functiondef('public.teeds_central_pessoa(text, text)'::regprocedure); antes := d;
  d := replace(d, 'public.teeds_admin_geral_da(p_marca)', 'public.teeds_admin_pleno_da(p_marca)');
  d := replace(d, 'if not found then return null; end if;',
    'if not found then return null; end if;' || E'\n  if public.teeds_parceiro_forcado(p_marca) is not null and coalesce(v.parceiro, '''') <> public.teeds_parceiro_forcado(p_marca) then return null; end if;');
  if d = antes then raise exception 'central_pessoa'; end if; execute d;

  -- estúdio: arquivar rascunho e público
  d := pg_get_functiondef('public.teeds_estudio_arquivar(text, uuid)'::regprocedure); antes := d;
  d := replace(d, 'public.teeds_admin_geral_da(p_marca)', 'public.teeds_admin_pleno_da(p_marca)');
  d := replace(d, 'where id = p_id and marca = p_marca;', 'where id = p_id and marca = p_marca and parceiro = coalesce(public.teeds_parceiro_forcado(p_marca), parceiro);');
  if d = antes then raise exception 'estudio_arquivar'; end if; execute d;

  d := pg_get_functiondef('public.teeds_estudio_publico_arquivar(text, uuid)'::regprocedure); antes := d;
  d := replace(d, 'public.teeds_admin_geral_da(p_marca)', 'public.teeds_admin_pleno_da(p_marca)');
  d := replace(d, 'where id = p_id and marca = p_marca;', 'where id = p_id and marca = p_marca and parceiro = coalesce(public.teeds_parceiro_forcado(p_marca), parceiro);');
  if d = antes then raise exception 'estudio_publico_arquivar'; end if; execute d;

  -- links de rastreio
  d := pg_get_functiondef('public.teeds_rastreio_link_arquivar(text, uuid, boolean)'::regprocedure); antes := d;
  d := replace(d, 'public.teeds_admin_geral_da(p_marca)', 'public.teeds_admin_pleno_da(p_marca)');
  d := replace(d, 'where marca = p_marca and id = p_id;', 'where marca = p_marca and id = p_id and (public.teeds_parceiro_forcado(p_marca) is null or parceiro = public.teeds_parceiro_forcado(p_marca));');
  if d = antes then raise exception 'rastreio_link_arquivar'; end if; execute d;

  d := pg_get_functiondef('public.teeds_rastreio_links(text)'::regprocedure); antes := d;
  d := replace(d, 'public.teeds_admin_geral_da(p_marca)', 'public.teeds_admin_pleno_da(p_marca)');
  d := replace(d, 'from public.rastreio_links k where k.marca = p_marca)', 'from public.rastreio_links k where k.marca = p_marca and (public.teeds_parceiro_forcado(p_marca) is null or k.parceiro = public.teeds_parceiro_forcado(p_marca)))');
  if d = antes then raise exception 'rastreio_links'; end if; execute d;

  -- notificações: histórico e quem recebeu
  d := pg_get_functiondef('public.teeds_push_historico(text)'::regprocedure); antes := d;
  d := replace(d, 'public.teeds_admin_geral_da(p_marca)', 'public.teeds_admin_pleno_da(p_marca)');
  d := replace(d, E'where d.marca = p_marca\n', E'where d.marca = p_marca and (public.teeds_parceiro_forcado(p_marca) is null or d.parceiro = public.teeds_parceiro_forcado(p_marca))\n');
  if d = antes then raise exception 'push_historico'; end if; execute d;

  d := pg_get_functiondef('public.teeds_push_quem(uuid)'::regprocedure); antes := d;
  d := replace(d, 'select marca into v_marca from public.push_disparos where id = p_disparo;',
    'select marca into v_marca from public.push_disparos where id = p_disparo and (public.teeds_parceiro_forcado(marca) is null or parceiro = public.teeds_parceiro_forcado(marca));');
  d := replace(d, 'public.teeds_admin_geral_da(v_marca)', 'public.teeds_admin_pleno_da(v_marca)');
  if d = antes then raise exception 'push_quem'; end if; execute d;

  -- relatório por parceiro: o parceiro vê só a linha dele
  d := pg_get_functiondef('public.teeds_relatorio_parceiros(text, date, date, text)'::regprocedure); antes := d;
  d := replace(d, 'if not public.teeds_sou_admin_geral() then', 'if not (public.teeds_sou_admin_geral() or public.teeds_admin_pleno_da(p_marca)) then');
  d := replace(d, 'select p.codigo, p.nome, 0 as ordem from public.parceiros p where p.marca = p_marca',
    'select p.codigo, p.nome, 0 as ordem from public.parceiros p where p.marca = p_marca and (public.teeds_parceiro_forcado(p_marca) is null or p.codigo = public.teeds_parceiro_forcado(p_marca))');
  d := replace(d, E'union all select '''', ''Direto (sem link)'', 1', E'union all select '''', ''Direto (sem link)'', 1 where public.teeds_parceiro_forcado(p_marca) is null');
  if d = antes then raise exception 'relatorio_parceiros'; end if; execute d;

  -- links do parceiro (Divulgação): o parceiro edita os dele
  d := pg_get_functiondef('public.teeds_salvar_link_parceiro(text, text, uuid, text, text, text, integer)'::regprocedure); antes := d;
  d := replace(d, 'if not public.teeds_sou_admin_geral() then',
    'if not (public.teeds_sou_admin_geral() or (public.teeds_admin_pleno_da(p_marca) and p_codigo = public.teeds_parceiro_forcado(p_marca))) then');
  if d = antes then raise exception 'salvar_link_parceiro'; end if; execute d;

  -- aulas: quem assistiu (só os clientes do parceiro), publicar a grade
  d := pg_get_functiondef('public.teeds_aulas_controle(text)'::regprocedure); antes := d;
  d := replace(d, 'where g.marca = p_marca and public.teeds_sou_admin_da(p_marca)',
    'where g.marca = p_marca and public.teeds_admin_pleno_da(p_marca) and (public.teeds_parceiro_forcado(p_marca) is null or coalesce(c.parceiro, '''') = public.teeds_parceiro_forcado(p_marca))');
  if d = antes then raise exception 'aulas_controle'; end if; execute d;

  -- configurações da marca: grade das aulas e planos
  for d in select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('teeds_aulas_publicar', 'teeds_plano_salvar', 'teeds_plano_apagar', 'teeds_planos_painel')
  loop
    antes := d;
    d := replace(d, 'public.teeds_sou_admin_da(p_marca)', 'public.teeds_admin_pleno_da(p_marca)');
    if d = antes then raise exception 'config: %', left(antes, 80); end if;
    execute d;
  end loop;
end $do$;

-- apagar link do parceiro: só tem o id
create or replace function public.teeds_apagar_link_parceiro(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.parceiro_links l
   where l.id = p_id
     and (public.teeds_sou_admin_geral() or (public.teeds_admin_pleno_da(l.marca) and l.codigo = public.teeds_parceiro_forcado(l.marca)));
  if not found then raise exception 'Só o admin geral ou o próprio parceiro edita estes links.'; end if;
end $$;

-- 3. Live de lançamento: os números do parceiro são os clientes dele; liberar libera os dele.
create or replace function public.teeds_lancamento_liberar_agora(p_marca text, p_quem uuid, p_parceiro text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_n integer := 0;
  r record;
  v_ate constant timestamptz := '2027-11-09 23:59:59-03';
begin
  if p_parceiro is null then return public.teeds_lancamento_liberar_agora(p_marca, p_quem); end if;
  for r in
    select c.user_id, cp.id as lead
      from public.clientes c
      left join lateral (
        select x.id from public.clientes_pendentes x
         where x.marca = p_marca and x.status = 'pendente'
           and (x.user_id = c.user_id or lower(x.email) = lower(c.email))
         order by (x.user_id = c.user_id) desc nulls last limit 1) cp on true
     where c.marca = p_marca and c.status_acesso = 'pendente' and c.plano_id = 'globalfly-aguardando-live'
       and coalesce(c.parceiro, '') = p_parceiro
       and (cp.id is not null or not exists (
             select 1 from public.clientes_pendentes y
              where y.marca = p_marca and y.status = 'recusado'
                and (y.user_id = c.user_id or lower(y.email) = lower(c.email))))
  loop
    update public.clientes
       set plano_id = 'treino', status_acesso = 'ativo', acesso_inicio = now(), acesso_expira_em = v_ate
     where user_id = r.user_id and marca = p_marca and status_acesso = 'pendente';
    if r.lead is not null then
      update public.clientes_pendentes
         set status = 'aprovado', plano_id = 'treino', user_id = r.user_id,
             decidido_em = now(), decidido_por = p_quem, trava = null, trava_ate = null
       where id = r.lead and status = 'pendente';
      update auth.users
         set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
               || jsonb_build_object('aprovacao_lead', r.lead)
               || case when coalesce((raw_app_meta_data->>'senha_propria')::boolean, false) = false
                            and raw_user_meta_data->>'trocar_senha' = 'true'
                       then jsonb_build_object('senha_aprovacao_versao', 'provisoria-v2') else '{}'::jsonb end
       where id = r.user_id;
    end if;
    v_n := v_n + 1;
  end loop;

  update public.clientes c
     set plano_id = 'treino',
         acesso_expira_em = case when c.acesso_expira_em is null and c.plano_id = 'treino' then null
                                 else greatest(coalesce(c.acesso_expira_em, v_ate), v_ate) end
   where c.marca = p_marca and c.status_acesso = 'ativo' and coalesce(c.parceiro, '') = p_parceiro
     and (c.plano_id = 'essencial' or (c.plano_id = 'treino' and c.acesso_expira_em < v_ate))
     and not exists (select 1 from public.administradores a where a.user_id = c.user_id and a.marca in (p_marca, 'teeds'));

  -- liberado_em fica para a liberação da plataforma inteira (a das 20h30 continua valendo para os outros)
  update public.lancamento_live set liberados = coalesce(liberados, 0) + v_n, atualizado_em = now() where marca = p_marca;
  return v_n;
end $$;
revoke all on function public.teeds_lancamento_liberar_agora(text, uuid, text) from public, anon, authenticated;

do $do$
declare d text; antes text;
begin
  d := pg_get_functiondef('public.teeds_lancamento_controlar(text, text, text)'::regprocedure); antes := d;
  d := replace(d, 'public.teeds_admin_geral_da(p_marca)', 'public.teeds_admin_pleno_da(p_marca)');
  d := replace(d, 'public.teeds_lancamento_liberar_agora(p_marca, (select auth.uid()))',
    'public.teeds_lancamento_liberar_agora(p_marca, (select auth.uid()), public.teeds_parceiro_forcado(p_marca))');
  if d = antes then raise exception 'lancamento_controlar'; end if; execute d;
end $do$;

create or replace function public.teeds_lancamento_painel(p_marca text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare l public.lancamento_live; v_p text := public.teeds_parceiro_forcado(p_marca);
begin
  if not public.teeds_admin_pleno_da(p_marca) then raise exception 'Só o administrador controla a live de lançamento'; end if;
  select * into l from public.lancamento_live where marca = p_marca;
  return jsonb_build_object(
    'inicioPrevisto', l.inicio_previsto, 'youtube', l.youtube, 'noAr', public.teeds_lancamento_no_ar(l),
    'comecouEm', l.comecou_em, 'terminouEm', l.terminou_em, 'liberadoEm', l.liberado_em,
    'liberados', case when v_p is null then l.liberados else (
      select count(*) from public.clientes c where c.marca = p_marca and coalesce(c.parceiro, '') = v_p
         and c.plano_id = 'treino' and c.acesso_inicio >= coalesce(l.comecou_em, l.inicio_previsto, now()) - interval '1 day') end,
    'minimoPct', l.minimo_pct,
    'aguardando', (select count(*) from public.clientes c where c.marca = p_marca and c.status_acesso = 'pendente'
                    and (v_p is null or coalesce(c.parceiro, '') = v_p)),
    'assistindoAgora', (select count(distinct p.user_id) from public.lancamento_presencas p
                         where p.marca = p_marca and p.minuto >= date_trunc('minute', now()) - interval '1 minute'
                           and (v_p is null or exists (select 1 from public.clientes c where c.user_id = p.user_id and c.marca = p_marca and coalesce(c.parceiro, '') = v_p))),
    'assistiram', (select count(*) from public.teeds_lancamento_quem_ficou(p_marca) q
                    where v_p is null or exists (select 1 from public.clientes c where c.user_id = q.user_id and c.marca = p_marca and coalesce(c.parceiro, '') = v_p)),
    'ficaram', (select count(*) from public.teeds_lancamento_quem_ficou(p_marca) q
                  join public.clientes c on c.user_id = q.user_id and c.marca = p_marca
                 where q.ficou and c.status_acesso = 'pendente' and (v_p is null or coalesce(c.parceiro, '') = v_p)),
    'total', (select max(total) from public.teeds_lancamento_quem_ficou(p_marca)));
end $$;

-- 4. Insights: o admin do parceiro (com ou sem acesso total) só soma os clientes dele.
--    Visitas do site: só os visitantes que passaram pelo link do parceiro (parceiro_toques).
--    O filtro usa (select teeds_parceiro_forcado(...)) para virar InitPlan: calcula uma vez só,
--    e para o geral (null) o "or" corta antes de olhar linha por linha.
do $do$
declare r record; d text; antes text;
  f constant text := '(select public.teeds_parceiro_forcado(p_marca))';
  dono text; visit text;
begin
  -- %1$s = coluna da marca, %2$s = coluna do usuário (ou do visitante)
  dono := '(' || f || ' is null or exists (select 1 from public.clientes cz where cz.user_id = %2$s and cz.marca = %1$s and coalesce(cz.parceiro, '''') = ' || f || '))';
  visit := '(' || f || ' is null or exists (select 1 from public.parceiro_toques tz where tz.marca = %1$s and tz.visitante = %2$s and tz.codigo = ' || f || '))';
  for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'teeds_insights_%'
  loop
    d := pg_get_functiondef(r.oid); antes := d;
    if r.proname = 'teeds_insights_acessos_dia' then
      d := replace(d, 'and a.dia = d.dia', 'and a.dia = d.dia and ' || format(dono, 'a.marca', 'a.user_id'));
    elsif r.proname = 'teeds_insights_aulas' then
      d := replace(d, 'and ultima_vez >= now() - make_interval(days => p_dias)', 'and ultima_vez >= now() - make_interval(days => p_dias) and ' || format(dono, 'aulas_progresso.marca', 'aulas_progresso.user_id'));
    elsif r.proname = 'teeds_insights_dispositivos' then
      d := replace(d, 'and dia >= current_date - p_dias', 'and dia >= current_date - p_dias and ' || format(dono, 'acessos_diarios.marca', 'acessos_diarios.user_id'));
    elsif r.proname = 'teeds_insights_horas' then
      -- a tabela não tem pessoa: o parceiro não vê o horário da plataforma inteira
      d := replace(d, 'and a.hora = h.hora', 'and a.hora = h.hora and ' || f || ' is null');
    elsif r.proname = 'teeds_insights_localizacoes' then
      d := replace(d, 'and c.total_acessos > 0', 'and c.total_acessos > 0 and ' || format(dono, 'c.marca', 'c.user_id'));
    elsif r.proname = 'teeds_insights_alunos' then
      d := replace(d, 'where p.marca = any(public.teeds_marcas_em_foco(p_marca))', 'where p.marca = any(public.teeds_marcas_em_foco(p_marca)) and ' || format(dono, 'p.marca', 'p.user_id'));
    elsif r.proname = 'teeds_insights_resumo' then
      d := replace(d, 'from public.clientes where marca = any(v)', 'from public.clientes where marca = any(v) and ' || format(dono, 'clientes.marca', 'clientes.user_id'));
      d := replace(d, 'from public.acessos_diarios where marca = any(v)', 'from public.acessos_diarios where marca = any(v) and ' || format(dono, 'acessos_diarios.marca', 'acessos_diarios.user_id'));
      d := replace(d, 'from public.aulas_progresso where marca = any(v)', 'from public.aulas_progresso where marca = any(v) and ' || format(dono, 'aulas_progresso.marca', 'aulas_progresso.user_id'));
      d := replace(d, 'from public.contas_deriv where marca = any(v)', 'from public.contas_deriv where marca = any(v) and ' || format(dono, 'contas_deriv.marca', 'contas_deriv.user_id'));
    elsif r.proname in ('teeds_insights_origens', 'teeds_insights_visitas', 'teeds_insights_visitas_dia') then
      -- o geral continua vendo o site todo; o parceiro, os visitantes que vieram pelo link dele
      d := replace(d, 'public.teeds_marcas_em_foco_geral(p_marca)', 'public.teeds_marcas_em_foco(p_marca)');
      d := replace(d, 'and criado_em >= now() - make_interval(days => p_dias))', 'and criado_em >= now() - make_interval(days => p_dias) and ' || format(visit, 'visitas.marca', 'visitas.visitante') || ')');
      d := replace(d, 'and criado_em >= date_trunc(''day'', now()))', 'and criado_em >= date_trunc(''day'', now()) and ' || format(visit, 'visitas.marca', 'visitas.visitante') || ')');
      d := replace(d, 'and v.criado_em >= now() - make_interval(days => p_dias)', 'and v.criado_em >= now() - make_interval(days => p_dias) and ' || format(visit, 'v.marca', 'v.visitante'));
      d := replace(d, 'and v.criado_em < d.dia + interval ''1 day''', 'and v.criado_em < d.dia + interval ''1 day'' and ' || format(visit, 'v.marca', 'v.visitante'));
    end if;
    if d = antes then raise exception 'insights: %', r.proname; end if;
    execute d;
  end loop;
end $do$;

-- 5. As tabelas de configuração da marca: o admin com acesso total também edita.
do $do$
declare r record; q text; c text; v_cmd text;
begin
  for r in select pp.tablename, pp.policyname, pp.qual, pp.with_check from pg_policies pp
            where pp.schemaname = 'public'
              and (pp.tablename, pp.policyname) in (
                ('aulas_grade', 'admin da marca gerencia a grade'), ('aulas_grade_versoes', 'admin da marca ve as versoes'),
                ('aulas_videos', 'logados veem aulas publicadas'), ('aulas_videos', 'admin da marca gerencia aulas'),
                ('produtos', 'admin gerencia produtos da sua marca'), ('subplanos', 'admin geral edita os subplanos'),
                ('robos_parametros', 'admin da marca ve os parametros dos robos'),
                ('robos_parametros_versoes', 'admin da marca ve o historico dos parametros'))
  loop
    q := replace(r.qual, 'teeds_sou_admin_da(', 'teeds_admin_pleno_da(');
    c := replace(r.with_check, 'teeds_sou_admin_da(', 'teeds_admin_pleno_da(');
    v_cmd := format('alter policy %I on public.%I', r.policyname, r.tablename);
    if q is not null then v_cmd := v_cmd || format(' using (%s)', q); end if;
    if c is not null then v_cmd := v_cmd || format(' with check (%s)', c); end if;
    execute v_cmd;
  end loop;
end $do$;

alter policy "admin geral ve os disparos" on public.push_disparos
  using (public.teeds_admin_geral_da(marca) or (public.teeds_admin_pleno_da(marca) and parceiro = public.teeds_parceiro_forcado(marca)));

-- 6. Arquivos das aulas e dos materiais (vídeos, capas, PDFs): o admin com acesso total também envia.
do $do$
declare r record; q text; c text; v_cmd text;
begin
  for r in select pp.policyname, pp.qual, pp.with_check from pg_policies pp
            where pp.schemaname = 'storage' and pp.tablename = 'objects'
              and pp.policyname in ('aulas: admin da marca envia', 'aulas: admin da marca substitui', 'aulas: admin da marca apaga',
                                    'materiais: admin da marca envia', 'materiais: admin da marca substitui', 'materiais: admin da marca apaga')
  loop
    q := replace(r.qual, 'teeds_sou_admin_da(', 'teeds_admin_pleno_da(');
    c := replace(r.with_check, 'teeds_sou_admin_da(', 'teeds_admin_pleno_da(');
    v_cmd := format('alter policy %I on storage.objects', r.policyname);
    if q is not null then v_cmd := v_cmd || format(' using (%s)', q); end if;
    if c is not null then v_cmd := v_cmd || format(' with check (%s)', c); end if;
    execute v_cmd;
  end loop;
end $do$;
