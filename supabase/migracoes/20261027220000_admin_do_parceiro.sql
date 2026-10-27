-- Admin do parceiro (27/10/2026, Tiago: "Naor deve ver somente Naor e Victor
-- deve ver somente Victor. Usuário Naor adm do /n e Victor adm do /v. Eu,
-- Tiago, adm geral, devo ver tudo e conseguir filtrar cada um. Sem cruzamento
-- de informações.").
--
-- DOIS TIPOS DE ADMINISTRADOR
--   administradores.parceiro null  = admin geral da marca: vê tudo.
--   administradores.parceiro 'n'   = admin do parceiro: vê só o que é do /n.
--
-- NEGA POR PADRÃO. `teeds_sou_admin_da` passa a valer só para o admin geral:
-- tudo o que existia (cerca de 40 tabelas e 30 funções) fecha sozinho para o
-- admin do parceiro, e só o que é dele é reaberto aqui, filtrado no banco:
-- clientes, cadastros, leads, sessões, operações, monitoramento, suporte,
-- contas, depósitos e saques, acessos e aulas assistidas.
-- `teeds_sou_equipe_da` (qualquer admin) vale para o que é da equipe toda: as
-- lives e a sala de treino (Naor e Victor apresentam), a Organização, o
-- Laboratório e o chat da equipe.
--
-- O QUE É DE QUEM (a vitrine, ver 20261027200000_parceiro_pela_url.sql)
--   registro com vitrine ('n', 'v', '' direto): vale a vitrine;
--   registro antigo (null): vale o parceiro da conta;
--   cliente: é do parceiro se a conta veio por ele OU se operou na vitrine dele.
--
-- O FILTRO DO ADMIN GERAL é a mesma regra: o painel manda o cabeçalho
-- x-teeds-vitrine ('n', 'v' ou 'direto') e o banco responde exatamente o que
-- aquele parceiro veria. O cabeçalho só vale para o admin geral: o do
-- parceiro fica sempre preso ao dele.

-- ------------------------------------------------------------- 1. o escopo de cada admin
alter table public.administradores add column if not exists parceiro text;
-- a conversa do suporte também guarda a vitrine em que foi aberta (o /n ou o /v)
alter table public.suporte_conversas add column if not exists parceiro text;

-- Naor no /n; Victor Cordeiro e Victor Dias no /v. Tiago segue geral.
update public.administradores set parceiro = 'n'
 where marca = 'globalfly' and user_id = 'dd0de769-c218-43e6-8a45-97cf26af94f0';
update public.administradores set parceiro = 'v'
 where marca = 'globalfly' and user_id in ('c66b8863-97b3-44f5-ae7a-e7a4300504b7', 'f6effea3-4da1-4b6c-901b-d8ec538708e7');

-- admin geral da marca (ou da Teeds, a master)
create or replace function public.teeds_sou_admin_da(p_marca text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.administradores a
    where a.user_id = (select auth.uid()) and (a.marca = p_marca or a.marca = 'teeds') and a.parceiro is null
  );
$$;

-- qualquer admin da marca (geral ou de parceiro): o que é da equipe toda
create or replace function public.teeds_sou_equipe_da(p_marca text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.administradores a
    where a.user_id = (select auth.uid()) and (a.marca = p_marca or a.marca = 'teeds')
  );
$$;

-- o filtro pedido pelo painel do admin geral ('n', 'v', 'direto'), ou null
create or replace function public.teeds_vitrine_pedida()
returns text language sql stable set search_path to 'public' as $$
  select nullif(lower(btrim(coalesce(
    (nullif(current_setting('request.headers', true), '')::json ->> 'x-teeds-vitrine'), ''))), '');
$$;

/*
  O escopo de quem pergunta, nesta marca:
    null = vê tudo (admin geral sem filtro)
    'n'  = só o /n;  '' = só o direto
  Admin do parceiro: sempre o dele (o cabeçalho é ignorado). Não admin: null,
  e as funções abaixo respondem "não" pelo `teeds_sou_admin_da`.
*/
create or replace function public.teeds_escopo_de(p_marca text)
returns text language sql stable security definer set search_path to 'public' as $$
  select case
    when public.teeds_sou_admin_da(p_marca) then (
      select case
        when v.p is null then null
        when v.p = 'direto' then ''
        else public.teeds_parceiro_valido(p_marca, v.p)
      end from (select public.teeds_vitrine_pedida() as p) v)
    else (select a.parceiro from public.administradores a
           where a.user_id = (select auth.uid()) and a.marca = p_marca and a.parceiro is not null limit 1)
  end;
$$;

-- a vitrine de um registro: a dele; registro antigo, o parceiro da conta; '' = direto
create or replace function public.teeds_vitrine_do_registro(p_marca text, p_parceiro text, p_user uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select coalesce(p_parceiro, (select c.parceiro from public.clientes c where c.user_id = p_user and c.marca = p_marca), '');
$$;

-- o cliente é deste escopo? (a conta veio por ele, ou operou/conversou na vitrine dele)
create or replace function public.teeds_cliente_no_escopo(p_marca text, p_user uuid, p_escopo text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select p_escopo is not null and (
       exists (select 1 from public.clientes c where c.user_id = p_user and c.marca = p_marca and coalesce(c.parceiro, '') = p_escopo)
    or exists (select 1 from public.sessoes_robos s where s.user_id = p_user and s.marca = p_marca and s.parceiro = p_escopo)
    or exists (select 1 from public.operacoes_manuais m where m.user_id = p_user and m.marca = p_marca and m.parceiro = p_escopo)
    or exists (select 1 from public.suporte_conversas x where x.user_id = p_user and x.marca = p_marca and x.parceiro = p_escopo)
  );
$$;

-- quem pergunta vê este cliente?
create or replace function public.teeds_ve_cliente(p_marca text, p_user uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case when e.v is not null then public.teeds_cliente_no_escopo(p_marca, p_user, e.v)
              else public.teeds_sou_admin_da(p_marca) end
    from (select public.teeds_escopo_de(p_marca) as v) e;
$$;

-- quem pergunta vê este registro (sessão, operação, conversa)?
create or replace function public.teeds_ve_registro(p_marca text, p_parceiro text, p_user uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case when e.v is not null then public.teeds_vitrine_do_registro(p_marca, p_parceiro, p_user) = e.v
              else public.teeds_sou_admin_da(p_marca) end
    from (select public.teeds_escopo_de(p_marca) as v) e;
$$;

create or replace function public.teeds_ve_sessao(p_sessao uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.sessoes_robos s where s.id = p_sessao and public.teeds_ve_registro(s.marca, s.parceiro, s.user_id));
$$;

-- ------------------------------------------------------------- 2. suporte e cadastros com vitrine
drop trigger if exists suporte_conversas_vitrine on public.suporte_conversas;
create trigger suporte_conversas_vitrine before insert or update of parceiro on public.suporte_conversas
  for each row execute function public.teeds_vitrine_normalizar();

create or replace function public.teeds_ve_conversa(p_conversa uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.suporte_conversas c where c.id = p_conversa and public.teeds_ve_registro(c.marca, c.parceiro, c.user_id));
$$;

-- o cadastro pendente é do parceiro do lead (o formulário em /n/cadastro ou no app pelo /n)
alter table public.clientes_pendentes add column if not exists parceiro text;
create or replace function public.teeds_pendente_parceiro() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  select l.parceiro into new.parceiro from public.leads_capturados l
   where l.marca = new.marca and l.email_normalizado = lower(new.email) and l.parceiro is not null
   order by coalesce(l.inscricao_recebida_em, l.atualizado_em, l.convertido_em) desc nulls last limit 1;
  return new;
end $$;
drop trigger if exists clientes_pendentes_parceiro on public.clientes_pendentes;
create trigger clientes_pendentes_parceiro before insert or update of email, ultima_inscricao_em on public.clientes_pendentes
  for each row execute function public.teeds_pendente_parceiro();
update public.clientes_pendentes p set parceiro = (
  select l.parceiro from public.leads_capturados l
   where l.marca = p.marca and l.email_normalizado = lower(p.email) and l.parceiro is not null
   order by coalesce(l.inscricao_recebida_em, l.atualizado_em, l.convertido_em) desc nulls last limit 1)
 where p.parceiro is null;

-- acesso criado pelo admin do parceiro já nasce dele
create or replace function public.teeds_atribuir_ao_meu_escopo(p_user uuid, p_marca text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_escopo text := public.teeds_escopo_de(p_marca); v_ok boolean;
begin
  if coalesce(v_escopo, '') = '' then return false; end if;
  perform set_config('teeds.troca_parceiro', '1', true);
  update public.clientes set parceiro = v_escopo, parceiro_em = now(), parceiro_fonte = 'admin-do-parceiro'
   where user_id = p_user and marca = p_marca and parceiro is null and criado_em > now() - interval '15 minutes'
  returning true into v_ok;
  perform set_config('teeds.troca_parceiro', '', true);
  if coalesce(v_ok, false) then
    insert into public.parceiro_trocas (marca, user_id, de, para, motivo, por, fonte)
    values (p_marca, p_user, null, v_escopo, 'acesso criado pelo admin do parceiro', auth.uid(), 'admin-do-parceiro');
  end if;
  return coalesce(v_ok, false);
end $$;

-- o papel de quem está logado, para o painel ajustar as abas
create or replace function public.teeds_meu_papel(p_marca text)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case
    when public.teeds_sou_admin_da(p_marca) then jsonb_build_object('admin', true, 'geral', true, 'parceiro', null)
    when public.teeds_sou_equipe_da(p_marca) then jsonb_build_object('admin', true, 'geral', false,
      'parceiro', (select a.parceiro from public.administradores a where a.user_id = (select auth.uid()) and a.marca = p_marca and a.parceiro is not null limit 1))
    else jsonb_build_object('admin', false, 'geral', false, 'parceiro', null)
  end;
$$;

revoke all on function public.teeds_sou_equipe_da(text), public.teeds_escopo_de(text), public.teeds_vitrine_do_registro(text, text, uuid),
  public.teeds_cliente_no_escopo(text, uuid, text), public.teeds_ve_cliente(text, uuid), public.teeds_ve_registro(text, text, uuid),
  public.teeds_ve_sessao(uuid), public.teeds_ve_conversa(uuid), public.teeds_atribuir_ao_meu_escopo(uuid, text), public.teeds_meu_papel(text)
  from public, anon;
grant execute on function public.teeds_sou_equipe_da(text), public.teeds_escopo_de(text), public.teeds_vitrine_do_registro(text, text, uuid),
  public.teeds_ve_cliente(text, uuid), public.teeds_ve_registro(text, text, uuid),
  public.teeds_ve_sessao(uuid), public.teeds_ve_conversa(uuid), public.teeds_atribuir_ao_meu_escopo(uuid, text), public.teeds_meu_papel(text)
  to authenticated;
-- o servidor (chave de serviço) confere cliente x escopo com escopo explícito
grant execute on function public.teeds_cliente_no_escopo(text, uuid, text) to service_role;

-- ------------------------------------------------------------- 3. as tabelas do parceiro, filtradas no banco
alter policy "proprio ou admin desta marca le" on public.clientes
  using ((user_id = (select auth.uid())) or public.teeds_ve_cliente(marca, user_id));
-- A política ALL também liberava LEITURA para o admin geral, e o filtro do painel
-- (Naor /n) mostraria todos os clientes. Vira três: criar, alterar e apagar.
drop policy if exists "admin gerencia clientes desta marca" on public.clientes;
drop policy if exists "admin geral cria clientes" on public.clientes;
drop policy if exists "admin geral altera clientes" on public.clientes;
drop policy if exists "admin geral apaga clientes" on public.clientes;
create policy "admin geral cria clientes" on public.clientes for insert to authenticated with check (public.teeds_sou_admin_da(marca));
create policy "admin geral altera clientes" on public.clientes for update to authenticated
  using (public.teeds_sou_admin_da(marca)) with check (public.teeds_sou_admin_da(marca));
create policy "admin geral apaga clientes" on public.clientes for delete to authenticated using (public.teeds_sou_admin_da(marca));
drop policy if exists "admin do parceiro atualiza os seus" on public.clientes;
create policy "admin do parceiro atualiza os seus" on public.clientes for update to authenticated
  using (public.teeds_escopo_de(marca) is not null and public.teeds_ve_cliente(marca, user_id))
  with check (public.teeds_escopo_de(marca) is not null and public.teeds_ve_cliente(marca, user_id));

alter policy "admin le pendentes da marca" on public.clientes_pendentes
  using (case when public.teeds_escopo_de(marca) is not null then coalesce(parceiro, '') = public.teeds_escopo_de(marca)
              else public.teeds_sou_admin_da(marca) end);
alter policy "admin desta marca ve leads" on public.leads_capturados
  using (case when public.teeds_escopo_de(marca) is not null then coalesce(parceiro, '') = public.teeds_escopo_de(marca)
              else public.teeds_sou_admin_da(marca) end);
alter policy "admin desta marca atualiza leads" on public.leads_capturados
  using (case when public.teeds_escopo_de(marca) is not null then coalesce(parceiro, '') = public.teeds_escopo_de(marca)
              else public.teeds_sou_admin_da(marca) end)
  with check (case when public.teeds_escopo_de(marca) is not null then coalesce(parceiro, '') = public.teeds_escopo_de(marca)
              else public.teeds_sou_admin_da(marca) end);

alter policy "cliente ve suas sessoes de robo" on public.sessoes_robos
  using ((user_id = (select auth.uid())) or public.teeds_ve_registro(marca, parceiro, user_id));
alter policy "cliente ve suas operacoes de robo" on public.operacoes_robos
  using ((user_id = (select auth.uid())) or public.teeds_ve_registro(marca, parceiro, user_id));
alter policy "cliente ve suas operacoes manuais" on public.operacoes_manuais
  using ((user_id = (select auth.uid())) or public.teeds_ve_registro(marca, parceiro, user_id));
alter policy "admin da marca ve o espelho" on public.sessoes_robos_ao_vivo
  using (public.teeds_ve_registro(marca, parceiro, user_id));
alter policy "admin da marca ve os eventos" on public.eventos_robos_ao_vivo
  using (public.teeds_ve_sessao(sessao_id));
alter policy "admin da marca ve o pulso" on public.pulsos_robos_ao_vivo
  using (public.teeds_ve_sessao(sessao_id));

alter policy "proprio ou admin desta marca le" on public.contas_deriv
  using ((user_id = (select auth.uid())) or public.teeds_ve_cliente(marca, user_id));
alter policy "proprio ou admin desta marca le" on public.comissoes_diarias
  using ((user_id = (select auth.uid())) or public.teeds_ve_cliente(marca, user_id));
alter policy "proprio ou admin desta marca le movimentacoes" on public.movimentacoes_deriv
  using ((user_id = (select auth.uid())) or public.teeds_ve_cliente(marca, user_id));
alter policy "cliente ve seus limites de chat" on public.chat_limites
  using ((user_id = (select auth.uid())) or public.teeds_ve_cliente(marca, user_id));
alter policy "cliente ve seu uso de chat" on public.chat_uso
  using ((user_id = (select auth.uid())) or public.teeds_ve_cliente(marca, user_id));
alter policy "admin da marca le progresso" on public.aulas_progresso using (public.teeds_ve_cliente(marca, user_id));
alter policy "admin da marca le acessos" on public.acessos_diarios using (public.teeds_ve_cliente(marca, user_id));
alter policy "admin da marca le contratos por origem" on public.contratos_por_origem using (public.teeds_ve_cliente(marca, user_id));
alter policy "admin desta marca ve as coletas" on public.extrato_coletas using (public.teeds_ve_cliente(marca, user_id));
alter policy "admin desta marca le o arquivo de duplicatas" on public.arquivo_duplicatas
  using (case when user_id is null then public.teeds_sou_admin_da(marca) and public.teeds_escopo_de(marca) is null
              else public.teeds_ve_cliente(marca, user_id) end);
-- (a ALL vale para leitura também: com teeds_ve_cliente ela já respeita o escopo e o filtro)
alter policy "admin desta marca gerencia liberacoes" on public.cliente_produtos
  using (public.teeds_ve_cliente(marca, user_id)) with check (public.teeds_ve_cliente(marca, user_id));
alter policy "cliente ve suas liberacoes" on public.cliente_produtos
  using ((user_id = (select auth.uid())) or public.teeds_ve_cliente(marca, user_id));

alter policy "suporte: cliente ou equipe le" on public.suporte_conversas
  using ((user_id = (select auth.uid())) or public.teeds_ve_registro(marca, parceiro, user_id));
alter policy "suporte: cliente ou equipe atualiza" on public.suporte_conversas
  using ((user_id = (select auth.uid())) or public.teeds_ve_registro(marca, parceiro, user_id));
alter policy "suporte: mensagens da conversa" on public.suporte_mensagens
  using (public.teeds_ve_conversa(conversa_id) or ((not interna) and exists (
    select 1 from public.suporte_conversas c where c.id = suporte_mensagens.conversa_id and c.user_id = (select auth.uid()))));
alter policy "suporte: cliente escreve na sua, equipe em todas" on public.suporte_mensagens
  with check (((autor = 'cliente') and (not interna) and (autor_id = (select auth.uid())) and exists (
      select 1 from public.suporte_conversas c where c.id = suporte_mensagens.conversa_id and c.user_id = (select auth.uid())))
    or ((autor = 'equipe') and (autor_id = (select auth.uid())) and public.teeds_ve_conversa(conversa_id)));

alter policy "admin desta marca grava auditoria" on public.auditoria_admin with check (public.teeds_sou_equipe_da(marca));
alter policy "admin da marca ve a auditoria" on public.auditoria_monitoramento_admin
  using (public.teeds_sou_admin_da(marca) or admin_id = (select auth.uid()));
alter policy "parceiros_leitura_admin" on public.parceiros
  using (public.teeds_sou_admin_da(marca) or codigo = public.teeds_escopo_de(marca));

-- ------------------------------------------------------------- 4. o que é da equipe toda
do $$
declare r record; v_qual text; v_check text;
begin
  for r in select * from pg_policies where schemaname = 'public'
    and tablename in ('lives', 'live_mensagens', 'live_silenciados', 'aovivo_config', 'org_tarefas', 'org_marcos', 'org_comentarios',
                      'lab_receitas', 'suporte_presenca', 'suporte_respostas', 'planos_da_marca')
    and (coalesce(qual, '') || coalesce(with_check, '')) like '%teeds_sou_admin_da%'
  loop
    v_qual := replace(r.qual, 'teeds_sou_admin_da', 'teeds_sou_equipe_da');
    v_check := replace(r.with_check, 'teeds_sou_admin_da', 'teeds_sou_equipe_da');
    if r.cmd = 'INSERT' then
      execute format('alter policy %I on public.%I with check (%s)', r.policyname, r.tablename, v_check);
    elsif v_check is null then
      execute format('alter policy %I on public.%I using (%s)', r.policyname, r.tablename, v_qual);
    else
      execute format('alter policy %I on public.%I using (%s) with check (%s)', r.policyname, r.tablename, v_qual, v_check);
    end if;
  end loop;
end $$;

-- prints do suporte: a equipe apaga só os das conversas que ela vê
drop policy if exists "suporte: anexo (apagar pela equipe)" on storage.objects;
create policy "suporte: anexo (apagar pela equipe)" on storage.objects for delete to authenticated
  using (bucket_id = 'suporte' and public.teeds_sou_equipe_da((storage.foldername(name))[1]) and public.teeds_suporte_pode_anexo(name));

-- ------------------------------------------------------------- 5. as funções
-- Reescritas pela troca exata de trechos: se um trecho não estiver lá, a migração para.
create or replace function pg_temp.trocar(p_funcao regprocedure, p_trocas text[])
returns void language plpgsql as $$
declare d text := pg_get_functiondef(p_funcao); i int;
begin
  for i in 1 .. array_length(p_trocas, 1) / 2 loop
    if position(p_trocas[2 * i - 1] in d) = 0 then
      raise exception 'trecho não encontrado em %: %', p_funcao, p_trocas[2 * i - 1];
    end if;
    d := replace(d, p_trocas[2 * i - 1], p_trocas[2 * i]);
  end loop;
  execute d;
end $$;

-- marcas em foco: qualquer admin da marca (a RLS filtra o que cada um vê)
do $$ declare d text := pg_get_functiondef('public.teeds_marcas_em_foco(text)'::regprocedure);
begin
  -- a versão só do admin geral, para as funções que leem por fora da RLS (visitas do site)
  execute replace(d, 'FUNCTION public.teeds_marcas_em_foco(', 'FUNCTION public.teeds_marcas_em_foco_geral(');
end $$;
select pg_temp.trocar('public.teeds_marcas_em_foco(text)', array[
  'when public.teeds_sou_admin_da(p_marca) then array[p_marca]', 'when public.teeds_sou_equipe_da(p_marca) then array[p_marca]']);
select pg_temp.trocar('public.teeds_insights_origens(text, integer)', array['teeds_marcas_em_foco(', 'teeds_marcas_em_foco_geral(']);
select pg_temp.trocar('public.teeds_insights_visitas(text, integer)', array['teeds_marcas_em_foco(', 'teeds_marcas_em_foco_geral(']);
select pg_temp.trocar('public.teeds_insights_visitas_dia(text, integer)', array['teeds_marcas_em_foco(', 'teeds_marcas_em_foco_geral(']);

-- a ficha do cliente: só cliente visível, e as operações da vitrine de quem vê
select pg_temp.trocar('public.teeds_cliente_ficha(text, uuid)', array[
  'declare m text[]; c record; resultado json; corpo json;', 'declare m text[]; c record; resultado json; corpo json; v_esc text;',
  'if c.user_id is null then return null; end if;',
    'if c.user_id is null then return null; end if;
  if not public.teeds_ve_cliente(c.marca, c.user_id) then return null; end if;
  v_esc := public.teeds_escopo_de(c.marca);',
  'from public.sessoes_robos s where s.user_id = c.user_id',
    'from public.sessoes_robos s where s.user_id = c.user_id and (v_esc is null or coalesce(s.parceiro, c.parceiro, '''') = v_esc)',
  'where o.user_id = c.user_id',
    'where o.user_id = c.user_id and (v_esc is null or coalesce(o.parceiro, c.parceiro, '''') = v_esc)']);
select pg_temp.trocar('public.teeds_cliente_rastro(text, uuid)', array[
  'where cl.user_id = p_user_id and cl.marca = any(m) limit 1',
  'where cl.user_id = p_user_id and cl.marca = any(m) and public.teeds_ve_cliente(cl.marca, cl.user_id) limit 1']);

-- monitoramento
select pg_temp.trocar('public.teeds_markup_das_sessoes(text, uuid[])', array[
  'if not public.teeds_sou_admin_da(p_marca) then', 'if not public.teeds_sou_equipe_da(p_marca) then',
  'and o.sessao_id = any (p_ids)', 'and o.sessao_id = any (p_ids)
       and public.teeds_ve_sessao(o.sessao_id)']);
select pg_temp.trocar('public.teeds_markup_manual(text, integer)', array[
  'public.teeds_sou_admin_da(p_marca)', 'public.teeds_ve_registro(o.marca, o.parceiro, o.user_id)']);
select pg_temp.trocar('public.teeds_auditar_monitoramento(text, text, text, uuid, uuid)', array[
  'if not public.teeds_sou_admin_da(p_marca) then', 'if not public.teeds_sou_equipe_da(p_marca) then',
  'if v_dono is null then raise exception ''sessao nao pertence a esta marca'' using errcode=''42501''; end if;',
    'if v_dono is null then raise exception ''sessao nao pertence a esta marca'' using errcode=''42501''; end if;
if not public.teeds_ve_sessao(p_sessao_id) then raise exception ''sessao fora do seu escopo'' using errcode=''42501''; end if;',
  'elsif p_cliente_id is not null and not exists(select 1 from public.clientes where user_id=p_cliente_id and marca=p_marca) then',
    'elsif p_cliente_id is not null and not public.teeds_ve_cliente(p_marca, p_cliente_id) then']);

-- acesso do cliente: o admin do parceiro mexe nos clientes dele
select pg_temp.trocar('public.teeds_proteger_plano()', array['public.teeds_sou_admin_da(new.marca)', 'public.teeds_ve_cliente(new.marca, new.user_id)']);
select pg_temp.trocar('public.teeds_proteger_cpf()', array['public.teeds_sou_admin_da(new.marca)', 'public.teeds_ve_cliente(new.marca, new.user_id)']);

-- suporte: cada um nas conversas que vê
select pg_temp.trocar('public.teeds_suporte_apagar_conversa(uuid)', array[
  'if not public.teeds_sou_admin_da(c.marca) then', 'if not public.teeds_ve_conversa(c.id) then']);
select pg_temp.trocar('public.teeds_suporte_organizacao_da_equipe()', array[
  'not public.teeds_sou_admin_da(old.marca)', 'not public.teeds_ve_conversa(old.id)']);
select pg_temp.trocar('public.teeds_suporte_proteger_conversa()', array[
  'if not public.teeds_sou_admin_da(new.marca) then', 'if not public.teeds_sou_equipe_da(new.marca) then',
  'not public.teeds_sou_admin_da(old.marca)', 'not public.teeds_ve_conversa(old.id)',
  'new.origem := old.origem; new.contexto := old.contexto;', 'new.origem := old.origem; new.contexto := old.contexto; new.parceiro := old.parceiro;']);
select pg_temp.trocar('public.teeds_suporte_pode_anexo(text)', array[
  'or public.teeds_sou_admin_da(c.marca)', 'or public.teeds_ve_registro(c.marca, c.parceiro, c.user_id)']);

-- lives, sala de treino e organização: da equipe toda
select pg_temp.trocar('public.teeds_minha_sala_de_treino(text)', array['teeds_sou_admin_da', 'teeds_sou_equipe_da']);
select pg_temp.trocar('public.teeds_pode_assistir(text)', array['teeds_sou_admin_da', 'teeds_sou_equipe_da']);
select pg_temp.trocar('public.teeds_treino_pulso(text, boolean, text)', array['teeds_sou_admin_da', 'teeds_sou_equipe_da']);
select pg_temp.trocar('public.teeds_live_modo_lento()', array['teeds_sou_admin_da', 'teeds_sou_equipe_da']);
select pg_temp.trocar('public.org_equipe(text)', array['teeds_sou_admin_da', 'teeds_sou_equipe_da']);

-- aprovação de cadastro: o admin do parceiro decide só os do parceiro dele
select pg_temp.trocar('public.teeds_decidir_lead(uuid, text, uuid, text, uuid, text)', array[
  'if not found then raise exception ''Cadastro não encontrado''; end if;',
  'if not found then raise exception ''Cadastro não encontrado''; end if;
  if not exists(select 1 from public.administradores b where b.user_id=p_admin and (b.marca=p_marca or b.marca=''teeds'') and b.parceiro is null)
     and coalesce(r.parceiro,'''') <> coalesce((select a.parceiro from public.administradores a where a.user_id=p_admin and a.marca=p_marca and a.parceiro is not null limit 1), ''#'') then
    raise exception ''Este cadastro é de outro parceiro.'';
  end if;']);
