-- Admin do parceiro, rápido (27/10/2026). A primeira versão chamava "quem é
-- você" a cada linha: em 166 mil operações e 327 mil eventos ao vivo a
-- consulta estourava o tempo. Aqui o banco calcula UMA vez por consulta
-- (subconsulta escalar = initplan) as marcas que a pessoa vê inteiras, os
-- escopos dela e, para o admin do parceiro, os clientes e sessões dele; cada
-- linha só é comparada com essas listas.
-- A regra não muda (ver 20261027220000_admin_do_parceiro.sql).

-- ------------------------------------------------------------- 1. registros antigos ganham a vitrine
-- Antes desta regra, valia o parceiro da conta; gravar isso na linha dá o
-- mesmo resultado e tira a consulta à conta de cada linha.
update public.sessoes_robos s set parceiro = coalesce(c.parceiro, '')
  from public.clientes c where s.marca = 'globalfly' and s.parceiro is null and c.user_id = s.user_id and c.marca = s.marca;
update public.sessoes_robos set parceiro = '' where marca = 'globalfly' and parceiro is null;
update public.operacoes_robos o set parceiro = coalesce(c.parceiro, '')
  from public.clientes c where o.marca = 'globalfly' and o.parceiro is null and c.user_id = o.user_id and c.marca = o.marca;
update public.operacoes_robos set parceiro = '' where marca = 'globalfly' and parceiro is null;
update public.operacoes_manuais m set parceiro = coalesce(c.parceiro, '')
  from public.clientes c where m.marca = 'globalfly' and m.parceiro is null and c.user_id = m.user_id and c.marca = m.marca;
update public.operacoes_manuais set parceiro = '' where marca = 'globalfly' and parceiro is null;
update public.sessoes_robos_ao_vivo v set parceiro = s.parceiro
  from public.sessoes_robos s where v.marca = 'globalfly' and v.parceiro is null and s.id = v.sessao_id;
update public.suporte_conversas x set parceiro = coalesce(c.parceiro, '')
  from public.clientes c where x.marca = 'globalfly' and x.parceiro is null and c.user_id = x.user_id and c.marca = x.marca;

-- Daqui em diante nenhum registro de marca com parceiros nasce sem vitrine:
-- sem informação, vale o parceiro da conta (ou direto). Assim a política só
-- compara a coluna, sem consultar a conta a cada linha.
create or replace function public.teeds_vitrine_normalizar() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.parceiro is null then
    if exists (select 1 from public.parceiros p where p.marca = new.marca) then
      new.parceiro := coalesce((select c.parceiro from public.clientes c where c.user_id = new.user_id and c.marca = new.marca), '');
    end if;
  else
    new.parceiro := public.teeds_vitrine_valida(new.marca, new.parceiro);
  end if;
  return new;
end $$;
create or replace function public.teeds_vitrine_da_sessao() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.sessao_id is not null then
    select s.parceiro into new.parceiro from public.sessoes_robos s where s.id = new.sessao_id;
  end if;
  if new.parceiro is null then
    if exists (select 1 from public.parceiros p where p.marca = new.marca) then
      new.parceiro := coalesce((select c.parceiro from public.clientes c where c.user_id = new.user_id and c.marca = new.marca), '');
    end if;
  else
    new.parceiro := public.teeds_vitrine_valida(new.marca, new.parceiro);
  end if;
  return new;
end $$;

-- ------------------------------------------------------------- 2. as listas, calculadas uma vez
create or replace function public.teeds_parceiro_da_conta(p_marca text, p_user uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select c.parceiro from public.clientes c where c.user_id = p_user and c.marca = p_marca;
$$;

-- as marcas que quem pergunta vê inteiras (admin geral sem filtro)
create or replace function public.teeds_marcas_admin_total()
returns text[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(x.m), '{}') from (
    select distinct m from (select unnest(array['teeds', 'omni', 'globalfly']) as m union select marca from public.administradores) t
  ) x where public.teeds_sou_admin_da(x.m) and public.teeds_escopo_de(x.m) is null;
$$;

-- os escopos de quem pergunta, como 'marca:codigo' ('' = direto)
create or replace function public.teeds_escopos()
returns text[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(x.m || ':' || public.teeds_escopo_de(x.m)), '{}') from (
    select distinct m from (select unnest(array['teeds', 'omni', 'globalfly']) as m union select marca from public.administradores) t
  ) x where public.teeds_escopo_de(x.m) is not null;
$$;

-- os clientes do escopo (a conta veio pelo parceiro, ou operou/conversou na vitrine dele)
create or replace function public.teeds_clientes_do_escopo()
returns uuid[] language sql stable security definer set search_path to 'public' as $$
  with e as (select split_part(v, ':', 1) as marca, split_part(v, ':', 2) as codigo from unnest(public.teeds_escopos()) v)
  select coalesce(array_agg(distinct u), '{}') from (
    select c.user_id as u from public.clientes c join e on e.marca = c.marca and coalesce(c.parceiro, '') = e.codigo
    union select s.user_id from public.sessoes_robos s join e on e.marca = s.marca and s.parceiro = e.codigo
    union select m.user_id from public.operacoes_manuais m join e on e.marca = m.marca and m.parceiro = e.codigo
    union select x.user_id from public.suporte_conversas x join e on e.marca = x.marca and x.parceiro = e.codigo
  ) t;
$$;

create or replace function public.teeds_sessoes_do_escopo()
returns uuid[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(s.id), '{}') from public.sessoes_robos s
   where (s.marca || ':' || coalesce(s.parceiro, public.teeds_parceiro_da_conta(s.marca, s.user_id), '')) = any (public.teeds_escopos());
$$;

create or replace function public.teeds_conversas_do_escopo()
returns uuid[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(x.id), '{}') from public.suporte_conversas x
   where (x.marca || ':' || coalesce(x.parceiro, public.teeds_parceiro_da_conta(x.marca, x.user_id), '')) = any (public.teeds_escopos());
$$;

revoke all on function public.teeds_parceiro_da_conta(text, uuid), public.teeds_marcas_admin_total(), public.teeds_escopos(),
  public.teeds_clientes_do_escopo(), public.teeds_sessoes_do_escopo(), public.teeds_conversas_do_escopo() from public, anon;
grant execute on function public.teeds_parceiro_da_conta(text, uuid), public.teeds_marcas_admin_total(), public.teeds_escopos(),
  public.teeds_clientes_do_escopo(), public.teeds_sessoes_do_escopo(), public.teeds_conversas_do_escopo() to authenticated;

-- ------------------------------------------------------------- 3. as políticas com as listas
-- registros com vitrine
alter policy "cliente ve suas sessoes de robo" on public.sessoes_robos
  using ((user_id = (select auth.uid())) or (marca = any ((select public.teeds_marcas_admin_total())::text[]))
    or ((marca || ':' || coalesce(parceiro, '')) = any ((select public.teeds_escopos())::text[])));
alter policy "cliente ve suas operacoes de robo" on public.operacoes_robos
  using ((user_id = (select auth.uid())) or (marca = any ((select public.teeds_marcas_admin_total())::text[]))
    or ((marca || ':' || coalesce(parceiro, '')) = any ((select public.teeds_escopos())::text[])));
alter policy "cliente ve suas operacoes manuais" on public.operacoes_manuais
  using ((user_id = (select auth.uid())) or (marca = any ((select public.teeds_marcas_admin_total())::text[]))
    or ((marca || ':' || coalesce(parceiro, '')) = any ((select public.teeds_escopos())::text[])));
alter policy "admin da marca ve o espelho" on public.sessoes_robos_ao_vivo
  using ((marca = any ((select public.teeds_marcas_admin_total())::text[]))
    or ((marca || ':' || coalesce(parceiro, '')) = any ((select public.teeds_escopos())::text[])));
alter policy "admin da marca ve os eventos" on public.eventos_robos_ao_vivo
  using ((marca = any ((select public.teeds_marcas_admin_total())::text[])) or (sessao_id = any ((select public.teeds_sessoes_do_escopo())::uuid[])));
alter policy "admin da marca ve o pulso" on public.pulsos_robos_ao_vivo
  using ((marca = any ((select public.teeds_marcas_admin_total())::text[])) or (sessao_id = any ((select public.teeds_sessoes_do_escopo())::uuid[])));
alter policy "suporte: cliente ou equipe le" on public.suporte_conversas
  using ((user_id = (select auth.uid())) or (marca = any ((select public.teeds_marcas_admin_total())::text[]))
    or ((marca || ':' || coalesce(parceiro, '')) = any ((select public.teeds_escopos())::text[])));
alter policy "suporte: cliente ou equipe atualiza" on public.suporte_conversas
  using ((user_id = (select auth.uid())) or (marca = any ((select public.teeds_marcas_admin_total())::text[]))
    or ((marca || ':' || coalesce(parceiro, '')) = any ((select public.teeds_escopos())::text[])));
alter policy "suporte: mensagens da conversa" on public.suporte_mensagens
  using ((marca = any ((select public.teeds_marcas_admin_total())::text[])) or (conversa_id = any ((select public.teeds_conversas_do_escopo())::uuid[]))
    or ((not interna) and exists (select 1 from public.suporte_conversas c where c.id = suporte_mensagens.conversa_id and c.user_id = (select auth.uid()))));

-- cadastros e leads: a vitrine do lead
alter policy "admin le pendentes da marca" on public.clientes_pendentes
  using ((marca = any ((select public.teeds_marcas_admin_total())::text[])) or ((marca || ':' || coalesce(parceiro, '')) = any ((select public.teeds_escopos())::text[])));
alter policy "admin desta marca ve leads" on public.leads_capturados
  using ((marca = any ((select public.teeds_marcas_admin_total())::text[])) or ((marca || ':' || coalesce(parceiro, '')) = any ((select public.teeds_escopos())::text[])));
alter policy "admin desta marca atualiza leads" on public.leads_capturados
  using ((marca = any ((select public.teeds_marcas_admin_total())::text[])) or ((marca || ':' || coalesce(parceiro, '')) = any ((select public.teeds_escopos())::text[])))
  with check ((marca = any ((select public.teeds_marcas_admin_total())::text[])) or ((marca || ':' || coalesce(parceiro, '')) = any ((select public.teeds_escopos())::text[])));

-- o que é do cliente: os clientes do escopo
alter policy "proprio ou admin desta marca le" on public.clientes
  using ((user_id = (select auth.uid())) or (marca = any ((select public.teeds_marcas_admin_total())::text[])) or (user_id = any ((select public.teeds_clientes_do_escopo())::uuid[])));
alter policy "admin do parceiro atualiza os seus" on public.clientes
  using (user_id = any ((select public.teeds_clientes_do_escopo())::uuid[])) with check (user_id = any ((select public.teeds_clientes_do_escopo())::uuid[]));
alter policy "proprio ou admin desta marca le" on public.contas_deriv
  using ((user_id = (select auth.uid())) or (marca = any ((select public.teeds_marcas_admin_total())::text[])) or (user_id = any ((select public.teeds_clientes_do_escopo())::uuid[])));
alter policy "proprio ou admin desta marca le" on public.comissoes_diarias
  using ((user_id = (select auth.uid())) or (marca = any ((select public.teeds_marcas_admin_total())::text[])) or (user_id = any ((select public.teeds_clientes_do_escopo())::uuid[])));
alter policy "proprio ou admin desta marca le movimentacoes" on public.movimentacoes_deriv
  using ((user_id = (select auth.uid())) or (marca = any ((select public.teeds_marcas_admin_total())::text[])) or (user_id = any ((select public.teeds_clientes_do_escopo())::uuid[])));
alter policy "cliente ve seus limites de chat" on public.chat_limites
  using ((user_id = (select auth.uid())) or (marca = any ((select public.teeds_marcas_admin_total())::text[])) or (user_id = any ((select public.teeds_clientes_do_escopo())::uuid[])));
alter policy "cliente ve seu uso de chat" on public.chat_uso
  using ((user_id = (select auth.uid())) or (marca = any ((select public.teeds_marcas_admin_total())::text[])) or (user_id = any ((select public.teeds_clientes_do_escopo())::uuid[])));
alter policy "admin da marca le progresso" on public.aulas_progresso
  using ((marca = any ((select public.teeds_marcas_admin_total())::text[])) or (user_id = any ((select public.teeds_clientes_do_escopo())::uuid[])));
alter policy "admin da marca le acessos" on public.acessos_diarios
  using ((marca = any ((select public.teeds_marcas_admin_total())::text[])) or (user_id = any ((select public.teeds_clientes_do_escopo())::uuid[])));
alter policy "admin da marca le contratos por origem" on public.contratos_por_origem
  using ((marca = any ((select public.teeds_marcas_admin_total())::text[])) or (user_id = any ((select public.teeds_clientes_do_escopo())::uuid[])));
alter policy "admin desta marca ve as coletas" on public.extrato_coletas
  using ((marca = any ((select public.teeds_marcas_admin_total())::text[])) or (user_id = any ((select public.teeds_clientes_do_escopo())::uuid[])));
alter policy "admin desta marca le o arquivo de duplicatas" on public.arquivo_duplicatas
  using ((marca = any ((select public.teeds_marcas_admin_total())::text[])) or (user_id is not null and user_id = any ((select public.teeds_clientes_do_escopo())::uuid[])));
alter policy "admin desta marca gerencia liberacoes" on public.cliente_produtos
  using ((marca = any ((select public.teeds_marcas_admin_total())::text[])) or (user_id = any ((select public.teeds_clientes_do_escopo())::uuid[])))
  with check ((marca = any ((select public.teeds_marcas_admin_total())::text[])) or (user_id = any ((select public.teeds_clientes_do_escopo())::uuid[])));
alter policy "cliente ve suas liberacoes" on public.cliente_produtos
  using ((user_id = (select auth.uid())) or (marca = any ((select public.teeds_marcas_admin_total())::text[])) or (user_id = any ((select public.teeds_clientes_do_escopo())::uuid[])));

-- ------------------------------------------------------------- 4. as funções que somam muitas linhas
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
select pg_temp.trocar('public.teeds_markup_das_sessoes(text, uuid[])', array[
  'and public.teeds_ve_sessao(o.sessao_id)',
  'and (o.marca = any ((select public.teeds_marcas_admin_total())::text[]) or o.sessao_id = any ((select public.teeds_sessoes_do_escopo())::uuid[]))']);
select pg_temp.trocar('public.teeds_markup_manual(text, integer)', array[
  'public.teeds_ve_registro(o.marca, o.parceiro, o.user_id)',
  '(o.marca = any ((select public.teeds_marcas_admin_total())::text[]) or (o.marca || '':'' || coalesce(o.parceiro, '''')) = any ((select public.teeds_escopos())::text[]))']);
