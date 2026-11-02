-- 02/11/2026: o funil da live de lançamento da GlobalFly (plano aprovado pelo
-- Tiago, PDF "Como vai funcionar o funil no lançamento?").
--
-- 1. Plano "Aguardando live": o de quem se inscreve até a live. Não libera
--    nenhum recurso; o app mostra a plataforma trancada, com contagem.
--    Vira o plano padrão da GF, então todo cadastro novo (página do Naor, do
--    Victor, /cadastro ou "Criar conta" no app) nasce nele.
-- 2. A live: link do YouTube, começo, fim e a régua de quem "ficou até o fim".
-- 3. Presença: um registro por pessoa por minuto, enquanto ela assiste.
-- 4. Liberação: no fim da live, quem ficou até o fim vira GF Member sozinho
--    (ativo, plano 'treino'). O carteiro do servidor manda o e-mail de acesso
--    liberado, como em qualquer aprovação.

-- ------------------------------------------------------------ 1. plano
insert into public.planos (id, nome, duracao_dias, ativo, recursos, marcas)
values ('globalfly-aguardando-live', 'Aguardando live', null, true, '{}'::jsonb, '{globalfly}')
on conflict (id) do nothing;

update public.planos_da_marca set padrao = false where marca = 'globalfly' and padrao and plano_id <> 'globalfly-aguardando-live';
insert into public.planos_da_marca (marca, plano_id, nome, descricao, duracao_dias, ativo, padrao, recursos, ordem)
values ('globalfly', 'globalfly-aguardando-live', 'Aguardando live',
        'Inscritos na live de lançamento de 09/11. Veem a plataforma trancada, com contagem regressiva. Quem fica até o fim da live vira GF Member sozinho.',
        null, true, true, '{"ao_vivo": false, "simulador": false, "sala_de_treino": false}'::jsonb, 0)
on conflict (marca, plano_id) do update set padrao = true, ativo = true;

-- quem já está esperando entra no mesmo plano
update public.clientes set plano_id = 'globalfly-aguardando-live'
 where marca = 'globalfly' and status_acesso = 'pendente';

-- ------------------------------------------------------------ 2. a live
create table if not exists public.lancamento_live (
  marca text primary key,
  inicio_previsto timestamptz not null,
  youtube text,
  comecou_em timestamptz,
  terminou_em timestamptz,
  liberado_em timestamptz,
  liberados integer,
  -- "ficou até o fim": assistiu pelo menos esta parte da live e estava lá nos últimos 10 minutos
  minimo_pct integer not null default 80 check (minimo_pct between 10 and 100),
  atualizado_em timestamptz not null default now()
);
alter table public.lancamento_live enable row level security;
insert into public.lancamento_live (marca, inicio_previsto) values ('globalfly', '2026-11-09 23:00:00+00')
on conflict (marca) do nothing;

create table if not exists public.lancamento_presencas (
  marca text not null,
  user_id uuid not null,
  minuto timestamptz not null,
  primary key (marca, user_id, minuto)
);
alter table public.lancamento_presencas enable row level security;
create index if not exists lancamento_presencas_minuto_idx on public.lancamento_presencas (marca, minuto);

-- A live está no ar: começou pelo painel e não terminou; ou, se ninguém apertou
-- "Começar", dentro das 3 horas a partir do horário marcado.
create or replace function public.teeds_lancamento_no_ar(l public.lancamento_live)
returns boolean language sql stable set search_path = public as $$
  select l.terminou_em is null and (
    l.comecou_em is not null
    or (now() >= l.inicio_previsto and now() < l.inicio_previsto + interval '3 hours'));
$$;

create or replace function public.teeds_admin_geral_da(p_marca text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.administradores a
                  where a.user_id = (select auth.uid()) and (a.marca = p_marca or a.marca = 'teeds') and a.parceiro is null);
$$;

-- O estado da live para quem abre o app (inscrito, membro ou equipe).
create or replace function public.teeds_lancamento_estado(p_marca text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'inicioPrevisto', l.inicio_previsto,
    'youtube', l.youtube,
    'noAr', public.teeds_lancamento_no_ar(l),
    'comecouEm', coalesce(l.comecou_em, case when now() >= l.inicio_previsto then l.inicio_previsto end),
    'terminouEm', l.terminou_em,
    'liberadoEm', l.liberado_em,
    'meusMinutos', (select count(*) from public.lancamento_presencas p
                     where p.marca = l.marca and p.user_id = (select auth.uid())
                       and p.minuto >= date_trunc('minute', coalesce(l.comecou_em, l.inicio_previsto))))
  from public.lancamento_live l
  where l.marca = p_marca and (select auth.uid()) is not null;
$$;
revoke all on function public.teeds_lancamento_estado(text) from public, anon;
grant execute on function public.teeds_lancamento_estado(text) to authenticated;

-- ------------------------------------------------------------ 3. presença
-- Chamado a cada 30 s pelo player enquanto a live toca. Um registro por minuto.
create or replace function public.teeds_lancamento_presente(p_marca text)
returns boolean language plpgsql security definer set search_path = public as $$
declare l public.lancamento_live; v_uid uuid := (select auth.uid());
begin
  if v_uid is null then return false; end if;
  select * into l from public.lancamento_live where marca = p_marca;
  if not found or not public.teeds_lancamento_no_ar(l) then return false; end if;
  if not exists (select 1 from public.clientes c where c.user_id = v_uid and c.marca = p_marca) then return false; end if;
  insert into public.lancamento_presencas (marca, user_id, minuto)
  values (p_marca, v_uid, date_trunc('minute', now()))
  on conflict do nothing;
  return true;
end $$;
revoke all on function public.teeds_lancamento_presente(text) from public, anon;
grant execute on function public.teeds_lancamento_presente(text) to authenticated;

-- ------------------------------------------------------------ 4. painel e liberação
-- Quem ficou até o fim, contando a live até agora (ou até o fim marcado).
create or replace function public.teeds_lancamento_quem_ficou(p_marca text)
returns table (user_id uuid, minutos integer, total integer, ultimo timestamptz, ficou boolean)
language sql stable security definer set search_path = public as $$
  with j as (
    select coalesce(l.comecou_em, l.inicio_previsto) as ini,
           coalesce(l.terminou_em, least(now(), l.inicio_previsto + interval '3 hours')) as fim,
           l.minimo_pct
      from public.lancamento_live l where l.marca = p_marca
  ), t as (
    select ini, fim, minimo_pct, greatest(1, ceil(extract(epoch from (fim - ini)) / 60))::int as total from j
  )
  select p.user_id,
         count(*)::int as minutos,
         t.total,
         max(p.minuto) as ultimo,
         count(*) >= ceil(t.total * t.minimo_pct / 100.0) and max(p.minuto) >= t.fim - interval '10 minutes' as ficou
    from public.lancamento_presencas p, t
   where p.marca = p_marca and p.minuto >= date_trunc('minute', t.ini) and p.minuto <= t.fim
   group by p.user_id, t.total, t.fim, t.minimo_pct;
$$;
revoke all on function public.teeds_lancamento_quem_ficou(text) from public, anon, authenticated;

create or replace function public.teeds_lancamento_painel(p_marca text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare l public.lancamento_live;
begin
  if not public.teeds_admin_geral_da(p_marca) then raise exception 'Só o administrador geral controla a live de lançamento'; end if;
  select * into l from public.lancamento_live where marca = p_marca;
  return jsonb_build_object(
    'inicioPrevisto', l.inicio_previsto, 'youtube', l.youtube, 'noAr', public.teeds_lancamento_no_ar(l),
    'comecouEm', l.comecou_em, 'terminouEm', l.terminou_em, 'liberadoEm', l.liberado_em, 'liberados', l.liberados,
    'minimoPct', l.minimo_pct,
    'aguardando', (select count(*) from public.clientes c where c.marca = p_marca and c.status_acesso = 'pendente'),
    'assistindoAgora', (select count(distinct p.user_id) from public.lancamento_presencas p
                         where p.marca = p_marca and p.minuto >= date_trunc('minute', now()) - interval '1 minute'),
    'assistiram', (select count(*) from public.teeds_lancamento_quem_ficou(p_marca)),
    'ficaram', (select count(*) from public.teeds_lancamento_quem_ficou(p_marca) q
                  join public.clientes c on c.user_id = q.user_id and c.marca = p_marca
                 where q.ficou and c.status_acesso = 'pendente'),
    'total', (select max(total) from public.teeds_lancamento_quem_ficou(p_marca)));
end $$;
revoke all on function public.teeds_lancamento_painel(text) from public, anon;
grant execute on function public.teeds_lancamento_painel(text) to authenticated;

-- Libera quem ficou até o fim: ativo no GF Member, cadastro aprovado. Pode
-- rodar mais de uma vez (só pega quem ainda está esperando).
create or replace function public.teeds_lancamento_liberar_agora(p_marca text, p_quem uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer := 0; r record;
begin
  for r in
    select c.user_id, cp.id as lead
      from public.teeds_lancamento_quem_ficou(p_marca) q
      join public.clientes c on c.user_id = q.user_id and c.marca = p_marca and c.status_acesso = 'pendente'
      left join lateral (
        select x.id from public.clientes_pendentes x
         where x.marca = p_marca and x.status = 'pendente'
           and (x.user_id = c.user_id or lower(x.email) = lower(c.email))
         order by (x.user_id = c.user_id) desc nulls last limit 1) cp on true
     where q.ficou
       -- cadastro recusado pela equipe continua recusado, mesmo tendo assistido
       and (cp.id is not null or not exists (
             select 1 from public.clientes_pendentes y
              where y.marca = p_marca and y.status = 'recusado'
                and (y.user_id = c.user_id or lower(y.email) = lower(c.email))))
  loop
    update public.clientes
       set plano_id = 'treino', status_acesso = 'ativo', acesso_inicio = now(),
           acesso_expira_em = public.teeds_validade_do_plano(p_marca, 'treino')
     where user_id = r.user_id and marca = p_marca and status_acesso = 'pendente';
    if r.lead is not null then
      update public.clientes_pendentes
         set status = 'aprovado', plano_id = 'treino', user_id = r.user_id,
             decidido_em = now(), decidido_por = p_quem, trava = null, trava_ate = null
       where id = r.lead and status = 'pendente';
      -- os mesmos carimbos da aprovação (aprovacao-leads.ts): o e-mail de acesso
      -- liberado repete a senha provisória só para quem ainda está com ela
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
  update public.lancamento_live
     set liberado_em = now(), liberados = coalesce(liberados, 0) + v_n, atualizado_em = now()
   where marca = p_marca;
  return v_n;
end $$;
revoke all on function public.teeds_lancamento_liberar_agora(text, uuid) from public, anon, authenticated;

-- Os botões do painel: link do YouTube, começar, encerrar e liberar, régua.
create or replace function public.teeds_lancamento_controlar(p_marca text, p_acao text, p_valor text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if not public.teeds_admin_geral_da(p_marca) then raise exception 'Só o administrador geral controla a live de lançamento'; end if;
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
    v_n := public.teeds_lancamento_liberar_agora(p_marca, (select auth.uid()));
    return jsonb_build_object('liberados', v_n);
  elsif p_acao = 'liberar' then
    v_n := public.teeds_lancamento_liberar_agora(p_marca, (select auth.uid()));
    return jsonb_build_object('liberados', v_n);
  elsif p_acao = 'minimo' then
    update public.lancamento_live set minimo_pct = greatest(10, least(100, p_valor::int)), atualizado_em = now() where marca = p_marca;
  else
    raise exception 'Ação inválida';
  end if;
  return '{}'::jsonb;
end $$;
revoke all on function public.teeds_lancamento_controlar(text, text, text) from public, anon;
grant execute on function public.teeds_lancamento_controlar(text, text, text) to authenticated;

-- Para o servidor: se ninguém encerrar, a live fecha sozinha 3 horas depois do
-- horário marcado e libera quem ficou (chamado pelo carteiro, chave secreta).
create or replace function public.teeds_lancamento_fechar_sozinha(p_marca text)
returns integer language plpgsql security definer set search_path = public as $$
declare l public.lancamento_live;
begin
  select * into l from public.lancamento_live where marca = p_marca for update;
  if not found or l.liberado_em is not null then return 0; end if;
  if l.terminou_em is null and now() >= greatest(l.inicio_previsto, coalesce(l.comecou_em, l.inicio_previsto)) + interval '3 hours' then
    update public.lancamento_live set comecou_em = coalesce(comecou_em, inicio_previsto),
           terminou_em = least(now(), greatest(l.inicio_previsto, coalesce(l.comecou_em, l.inicio_previsto)) + interval '3 hours')
     where marca = p_marca;
    return public.teeds_lancamento_liberar_agora(p_marca, null);
  end if;
  return 0;
end $$;
revoke all on function public.teeds_lancamento_fechar_sozinha(text) from public, anon, authenticated;

-- ------------------------------------------------------------ 5. e-mails do lançamento
-- Uma linha por e-mail mandado (etapa da sequência): o carteiro nunca manda duas vezes.
create table if not exists public.lancamento_emails (
  marca text not null,
  email text not null,
  etapa text not null,
  enviado_em timestamptz not null default now(),
  primary key (marca, email, etapa)
);
alter table public.lancamento_emails enable row level security;
