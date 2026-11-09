-- Correções da revisão de 08–09/11/2026, antes da live de lançamento da GlobalFly.
--
-- 1. A live e a liberação são só da GlobalFly: o painel do site da Teeds, com a GF
--    escolhida no seletor, mandava p_marca = 'teeds' e passava os ativos da Teeds
--    para o plano de treino. Agora o banco recusa qualquer outra marca.
-- 2. Quem controla a live (liberar, link do YouTube, começar, encerrar, mínimo):
--    o admin geral, ou o admin de parceiro com acesso total que enxerga TODOS os
--    parceiros (o Victor). O admin de um parceiro só (o Naor) não libera a
--    plataforma inteira.
-- 3. A liberação em uma passada só (antes: uma volta por pessoa, ~4 s para 727,
--    perto do limite de 8 s do papel authenticated). Conta só quem mudou de verdade
--    (dois admins apertando juntos não inflam o número) e inclui a ficha que ficou
--    presa em "processando" (trava vencida), que antes era liberada sem o e-mail.
-- 4. Depois da liberação, o plano padrão da GF volta a ser o GF Member e o
--    "Aguardando live" sai das opções: quem se inscreve depois não nasce trancado e
--    a aprovação não sugere um plano sem recursos.
-- 5. O "esperando" do painel conta as mesmas pessoas que o botão libera (antes
--    contava também os recusados).
-- 6. A presença de cada acesso (upsert em clientes) falhava 786 vezes por dia com
--    "Somente o administrador pode liberar o simulador": o gatilho olha o INSERT
--    antes do conflito, com o plano padrão da coluna ('essencial'). Agora a ficha
--    nova de quem não é admin recebe o plano padrão da marca em vez de dar erro.
-- 7. As 5 funções sem search_path fixo (aviso de segurança do Supabase).

create or replace function public.teeds_lancamento_pode_controlar(p_marca text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.teeds_sou_admin_da(p_marca) or exists (
    select 1 from public.administradores a
     where a.user_id = (select auth.uid()) and a.marca = p_marca and a.acesso_total
       and a.ve_parceiros is not null
       and a.ve_parceiros @> coalesce((select array_agg(distinct b.parceiro) from public.administradores b
                                        where b.marca = p_marca and b.parceiro is not null), '{}'::text[]));
$$;
revoke all on function public.teeds_lancamento_pode_controlar(text) from public, anon;
grant execute on function public.teeds_lancamento_pode_controlar(text) to authenticated;

create or replace function public.teeds_lancamento_liberar_agora(p_marca text, p_quem uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_n integer := 0;
  v_ate constant timestamptz := '2027-11-09 23:59:59-03';
begin
  if p_marca <> 'globalfly' then raise exception 'A liberação do lançamento é só da GlobalFly'; end if;

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

  update public.clientes c
     set plano_id = 'treino',
         acesso_expira_em = case when c.acesso_expira_em is null and c.plano_id = 'treino' then null
                                 else greatest(coalesce(c.acesso_expira_em, v_ate), v_ate) end
   where c.marca = p_marca and c.status_acesso = 'ativo'
     and (c.plano_id = 'essencial' or (c.plano_id = 'treino' and c.acesso_expira_em < v_ate))
     and not exists (select 1 from public.administradores a where a.user_id = c.user_id and a.marca in (p_marca, 'teeds'));

  -- depois da live, quem se inscreve nasce no GF Member (pendente, para aprovar) e
  -- o "Aguardando live" some das opções de aprovação
  -- (dois passos: a marca só pode ter um padrão por vez)
  if exists (select 1 from public.planos_da_marca t where t.marca = p_marca and t.plano_id = 'treino') then
    update public.planos_da_marca set padrao = false, atualizado_em = now()
     where marca = p_marca and padrao and plano_id <> 'treino';
    update public.planos_da_marca
       set padrao = (plano_id = 'treino'),
           ativo = case when plano_id = 'globalfly-aguardando-live' then false else ativo end,
           atualizado_em = now()
     where marca = p_marca and (plano_id in ('treino', 'globalfly-aguardando-live'));
  end if;

  update public.lancamento_live
     set liberado_em = coalesce(liberado_em, now()), liberados = coalesce(liberados, 0) + v_n, atualizado_em = now()
   where marca = p_marca;
  return v_n;
end $$;

create or replace function public.teeds_lancamento_controlar(p_marca text, p_acao text, p_valor text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if p_marca <> 'globalfly' then raise exception 'A live de lançamento é só da GlobalFly'; end if;
  if not public.teeds_lancamento_pode_controlar(p_marca) then
    raise exception 'Só o administrador geral controla a live e a liberação do acesso';
  end if;
  if p_acao = 'youtube' then
    update public.lancamento_live set youtube = nullif(trim(p_valor), ''), atualizado_em = now() where marca = p_marca;
  elsif p_acao = 'comecar' then
    update public.lancamento_live set comecou_em = now(), terminou_em = null, atualizado_em = now() where marca = p_marca;
  elsif p_acao = 'retomar' then
    update public.lancamento_live set terminou_em = null, atualizado_em = now() where marca = p_marca;
  elsif p_acao = 'encerrar' then
    update public.lancamento_live
       set comecou_em = coalesce(comecou_em, least(inicio_previsto, now())), terminou_em = now(), atualizado_em = now()
     where marca = p_marca and terminou_em is null;
  elsif p_acao = 'liberar_geral' then
    v_n := public.teeds_lancamento_liberar_agora(p_marca, (select auth.uid()));
    return jsonb_build_object('liberados', v_n);
  elsif p_acao = 'minimo' then
    update public.lancamento_live set minimo_pct = greatest(10, least(100, p_valor::int)), atualizado_em = now() where marca = p_marca;
  else
    raise exception 'Ação inválida';
  end if;
  return '{}'::jsonb;
end $$;

create or replace function public.teeds_lancamento_painel(p_marca text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare l public.lancamento_live; v_p text := public.teeds_parceiro_forcado(p_marca);
begin
  if p_marca <> 'globalfly' then raise exception 'A live de lançamento é só da GlobalFly'; end if;
  if not public.teeds_admin_pleno_da(p_marca) then raise exception 'Só o administrador controla a live de lançamento'; end if;
  select * into l from public.lancamento_live where marca = p_marca;
  return jsonb_build_object(
    'inicioPrevisto', l.inicio_previsto, 'youtube', l.youtube, 'noAr', public.teeds_lancamento_no_ar(l),
    'comecouEm', l.comecou_em, 'terminouEm', l.terminou_em, 'liberadoEm', l.liberado_em,
    'podeControlar', public.teeds_lancamento_pode_controlar(p_marca),
    'liberados', case when v_p is null then l.liberados else (
      select count(*) from public.clientes c where c.marca = p_marca and coalesce(c.parceiro, '') = v_p
         and c.plano_id = 'treino' and c.acesso_inicio >= coalesce(l.comecou_em, l.inicio_previsto, now()) - interval '1 day') end,
    'minimoPct', l.minimo_pct,
    -- as mesmas pessoas que o botão libera: inscritos no "Aguardando live", menos os recusados
    'aguardando', (select count(*) from public.clientes c
                    where c.marca = p_marca and c.status_acesso = 'pendente' and c.plano_id = 'globalfly-aguardando-live'
                      and (v_p is null or coalesce(c.parceiro, '') = v_p)
                      and (exists (select 1 from public.clientes_pendentes x
                                    where x.marca = p_marca and x.status in ('pendente', 'processando')
                                      and (x.user_id = c.user_id or lower(x.email) = lower(c.email)))
                           or not exists (select 1 from public.clientes_pendentes y
                                    where y.marca = p_marca and y.status = 'recusado'
                                      and (y.user_id = c.user_id or lower(y.email) = lower(c.email))))),
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

create or replace function public.teeds_proteger_plano()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.planos_da_marca where plano_id = new.plano_id and marca = new.marca) then
    -- ficha nova de quem não é admin (ex.: a presença em upsert): o plano padrão da marca
    if tg_op = 'INSERT' and auth.role() = 'authenticated' and not public.teeds_ve_cliente(new.marca, new.user_id) then
      new.plano_id := public.teeds_plano_padrao(new.marca);
    else
      raise exception 'Escolha um dos planos de clientes desta plataforma';
    end if;
  end if;
  if tg_op = 'INSERT' and new.marca = 'globalfly' and new.categoria is null then
    new.categoria := 'gold';
  end if;
  if auth.role()='authenticated' and not public.teeds_ve_cliente(new.marca, new.user_id) then
    if tg_op='INSERT' then
      -- antes dava erro aqui; o upsert da presença passa por este INSERT antes de achar a ficha
      -- que já existe, e o erro derrubava a presença e o registro de acesso (09/11/2026)
      if new.plano_id <> public.teeds_plano_padrao(new.marca) then new.plano_id := public.teeds_plano_padrao(new.marca); end if;
      if new.plano_id = 'globalfly-aguardando-live' then new.status_acesso := 'pendente'; end if;
      new.categoria := case when new.marca = 'globalfly' then 'gold' else null end;
      new.liberado_antes_da_live := false;
    elsif new.plano_id is distinct from old.plano_id or new.status_acesso is distinct from old.status_acesso
          or new.acesso_expira_em is distinct from old.acesso_expira_em
          or new.categoria is distinct from old.categoria
          or new.liberado_antes_da_live is distinct from old.liberado_antes_da_live then
      raise exception 'Somente o administrador pode alterar o acesso';
    end if;
  end if;
  return new;
end $$;

update public.planos_da_marca
   set descricao = 'Inscritos na live de lançamento de 09/11. Veem a plataforma trancada, com contagem regressiva. Na live, o botão Liberar acesso geral passa todos para GF Member, com acesso até 09/11/2027.'
 where marca = 'globalfly' and plano_id = 'globalfly-aguardando-live';

alter function public.teeds_suporte_etiquetas(text) set search_path = public, pg_temp;
alter function public.teeds_suporte_normalizar(text) set search_path = public, pg_temp;
alter function public.teeds_suporte_peso(text) set search_path = public, pg_temp;
alter function public.teeds_suporte_prioridade(text, text[]) set search_path = public, pg_temp;
alter function public.whatsapp_chave_tel(text) set search_path = public, pg_temp;
