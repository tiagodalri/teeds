-- Central de rastreio (04/11/2026, Tiago: "uma central de inteligência que rastreia tudo, cada passo,
-- cada evento, cada clique, jornada detalhada... preciso saber a origem pra metrificar... mandei
-- link no canal do Telegram, postei nos stories").
--
-- Três peças:
--   rastreio_links       os links marcados que o admin gera (?o=<codigo>), um por divulgação;
--   rastreio_visitantes  um por navegador (o mesmo id `globalfly.visitante` do site e do app), com o
--                        primeiro e o último toque (de onde veio) e, depois do cadastro, o e-mail;
--   rastreio_eventos     cada passo da pessoa nas páginas, com o canal que valia naquele momento.
-- As páginas gravam só pela função gf_rastro (chave pública, com freio); as tabelas não têm acesso
-- direto. A leitura é só do administrador geral, pelas funções teeds_central_*.

-- ------------------------------------------------------------------ tabelas
create table if not exists public.rastreio_links (
  id uuid primary key default gen_random_uuid(),
  marca text not null,
  parceiro text,
  codigo text not null check (codigo ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  nome text not null check (length(nome) between 2 and 80),
  canal text not null check (canal ~ '^[a-z][a-z0-9-]{1,29}$'),
  arquivado boolean not null default false,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  unique (marca, codigo)
);
alter table public.rastreio_links enable row level security;
revoke all on public.rastreio_links from anon, authenticated;

create table if not exists public.rastreio_visitantes (
  marca text not null,
  visitante text not null,
  parceiro text,
  -- primeiro toque: o que trouxe a pessoa da primeira vez (nunca muda)
  p_canal text not null default 'direto', p_origem text, p_meio text, p_campanha text, p_conteudo text, p_termo text, p_link text, p_ref text,
  -- último toque com origem (uma visita sem marcação não apaga a origem anterior)
  u_canal text not null default 'direto', u_origem text, u_meio text, u_campanha text, u_conteudo text, u_termo text, u_link text, u_ref text,
  dispositivo text, navegador text,
  visitas integer not null default 0,
  eventos integer not null default 0,
  primeira_em timestamptz not null default now(),
  ultima_em timestamptz not null default now(),
  email_normalizado text,
  lead_id uuid,
  primary key (marca, visitante)
);
create index if not exists rastreio_visitantes_ultima on public.rastreio_visitantes (marca, ultima_em desc);
create index if not exists rastreio_visitantes_email on public.rastreio_visitantes (marca, email_normalizado) where email_normalizado is not null;
create index if not exists rastreio_visitantes_lead on public.rastreio_visitantes (lead_id) where lead_id is not null;
alter table public.rastreio_visitantes enable row level security;
revoke all on public.rastreio_visitantes from anon, authenticated;

create table if not exists public.rastreio_eventos (
  id bigint generated always as identity primary key,
  marca text not null,
  parceiro text,
  visitante text not null,
  evento text not null,
  pagina text,
  canal text not null default 'direto',
  conteudo text,
  link text,
  detalhe jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists rastreio_eventos_quando on public.rastreio_eventos (marca, criado_em desc);
create index if not exists rastreio_eventos_visitante on public.rastreio_eventos (marca, visitante, criado_em);
alter table public.rastreio_eventos enable row level security;
revoke all on public.rastreio_eventos from anon, authenticated;

-- ------------------------------------------------------------------ de onde veio
-- O canal de uma visita, pela marcação do link, pelo site que mandou a pessoa (referência) e pelo
-- navegador embutido (o do Instagram e o do Facebook se identificam). Os anúncios da GF levam
-- utm_source=meta&utm_medium=pago; o link da bio do Instagram chega com utm_source=ig&utm_medium=social.
create or replace function public.rastreio_canal(p_origem text, p_meio text, p_ref text, p_nav text, p_fbclid boolean)
returns text language plpgsql immutable set search_path = public as $$
declare o text := lower(trim(coalesce(p_origem, ''))); m text := lower(trim(coalesce(p_meio, '')));
        r text := lower(trim(coalesce(p_ref, ''))); n text := lower(trim(coalesce(p_nav, '')));
begin
  if o <> '' then
    if o = 'meta' or (o in ('facebook', 'fb', 'instagram', 'ig', 'an', 'messenger', 'audience_network') and m in ('pago', 'paid', 'cpc', 'ads', 'anuncio', 'paid_social', 'ppc')) then return 'anuncio-meta'; end if;
    if o in ('ig', 'instagram') then return 'instagram'; end if;
    if o in ('fb', 'facebook') then return 'facebook'; end if;
    if o in ('telegram', 'tg') then return 'telegram'; end if;
    if o in ('whatsapp', 'wa', 'zap') then return 'whatsapp'; end if;
    if o in ('youtube', 'yt') then return 'youtube'; end if;
    if o in ('tiktok', 'tt') then return 'tiktok'; end if;
    if o in ('email', 'e-mail', 'mail') then return 'email'; end if;
    if o = 'google' then return 'google'; end if;
    return left(regexp_replace(o, '[^a-z0-9-]', '-', 'g'), 30);
  end if;
  -- sem marcação: o fbclid vem de link clicado no Facebook ou no Instagram (os anúncios têm marcação)
  if r ~ '(^|\.)t\.me$|telegram' or n = 'telegram' then return 'telegram'; end if;
  if r ~ 'instagram' or n = 'instagram' then return 'instagram'; end if;
  if r ~ 'facebook|(^|\.)fb\.(com|me)$' or n = 'facebook' or p_fbclid then return 'facebook'; end if;
  if r ~ 'whatsapp|(^|\.)wa\.me$' then return 'whatsapp'; end if;
  if r ~ 'youtube|youtu\.be' then return 'youtube'; end if;
  if r ~ 'tiktok' or n = 'tiktok' then return 'tiktok'; end if;
  if r ~ '(^|\.)google\.' then return 'google'; end if;
  if r ~ 'mail\.|outlook|gmail' then return 'email'; end if;
  if r ~ 'globalflytrade\.com$' then return 'site'; end if;
  if r <> '' then return 'outro-site'; end if;
  return 'direto';
end $$;

-- ------------------------------------------------------------------ gravar (páginas, chave pública)
-- p_toque: {origem, meio, campanha, conteudo, termo, link, ref, nav, disp, fbclid}
-- p_email só vale no evento 'cadastro': liga este navegador ao cadastro que o motor acabou de gravar.
create or replace function public.gf_rastro(p_marca text, p_parceiro text, p_visitante text, p_evento text,
  p_pagina text default null, p_toque jsonb default '{}'::jsonb, p_detalhe jsonb default null, p_email text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_par text := public.teeds_parceiro_valido(p_marca, p_parceiro);
  t jsonb := coalesce(p_toque, '{}'::jsonb);
  v_origem text := left(nullif(trim(t->>'origem'), ''), 60);
  v_meio text := left(nullif(trim(t->>'meio'), ''), 60);
  v_campanha text := left(nullif(trim(t->>'campanha'), ''), 120);
  v_conteudo text := left(nullif(trim(t->>'conteudo'), ''), 80);
  v_termo text := left(nullif(trim(t->>'termo'), ''), 80);
  v_link text := left(nullif(lower(trim(t->>'link')), ''), 40);
  v_ref text := left(nullif(lower(trim(t->>'ref')), ''), 80);
  v_nav text := left(nullif(lower(trim(t->>'nav')), ''), 20);
  v_disp text := left(nullif(lower(trim(t->>'disp')), ''), 20);
  v_fbclid boolean := coalesce((t->>'fbclid')::boolean, false);
  v_canal text; v_tem_origem boolean; v_link_canal text; v_vis record; v_lead record; v_email text;
begin
  if p_marca is distinct from 'globalfly' or p_visitante !~ '^[a-zA-Z0-9]{8,40}$' or p_evento !~ '^[a-z][a-z0-9-]{1,29}$' then return; end if;
  if p_detalhe is not null and length(p_detalhe::text) > 1500 then p_detalhe := null; end if;
  -- freio: um navegador não passa de 120 eventos por minuto
  if (select count(*) from public.rastreio_eventos e where e.marca = p_marca and e.visitante = p_visitante and e.criado_em > now() - interval '1 minute') >= 120 then return; end if;
  -- freio geral: quem gira ids aleatórios não enche as tabelas (o lançamento inteiro fica muito abaixo disso)
  if (select count(*) from public.rastreio_eventos e where e.marca = p_marca and e.criado_em > now() - interval '1 minute') >= 6000 then return; end if;
  if not exists (select 1 from public.rastreio_visitantes v where v.marca = p_marca and v.visitante = p_visitante)
     and (select count(*) from public.rastreio_visitantes v where v.marca = p_marca and v.primeira_em > now() - interval '1 minute') >= 600 then return; end if;

  if v_link is not null then
    -- texto, não registro: um registro sem linha não pode ser lido no case abaixo (erro 55000)
    select l.canal into v_link_canal from public.rastreio_links l where l.marca = p_marca and l.codigo = v_link;
    if v_link_canal is null then v_link := null; end if;
  end if;
  v_canal := case when v_link is not null then v_link_canal else public.rastreio_canal(v_origem, v_meio, v_ref, v_nav, v_fbclid) end;
  v_tem_origem := v_canal not in ('direto', 'site');

  insert into public.rastreio_visitantes as rv (marca, visitante, parceiro,
      p_canal, p_origem, p_meio, p_campanha, p_conteudo, p_termo, p_link, p_ref,
      u_canal, u_origem, u_meio, u_campanha, u_conteudo, u_termo, u_link, u_ref,
      dispositivo, navegador, visitas, eventos)
  values (p_marca, p_visitante, v_par,
      v_canal, v_origem, v_meio, v_campanha, v_conteudo, v_termo, v_link, v_ref,
      v_canal, v_origem, v_meio, v_campanha, v_conteudo, v_termo, v_link, v_ref,
      v_disp, v_nav, case when p_evento = 'entrada' then 1 else 0 end, 1)
  on conflict (marca, visitante) do update set
      parceiro = coalesce(rv.parceiro, excluded.parceiro),
      -- quem chegou sem origem e depois veio por um link marcado: o primeiro toque passa a ser esse
      p_canal = case when rv.p_canal in ('direto', 'site') and v_tem_origem then excluded.p_canal else rv.p_canal end,
      p_origem = case when rv.p_canal in ('direto', 'site') and v_tem_origem then excluded.p_origem else rv.p_origem end,
      p_meio = case when rv.p_canal in ('direto', 'site') and v_tem_origem then excluded.p_meio else rv.p_meio end,
      p_campanha = case when rv.p_canal in ('direto', 'site') and v_tem_origem then excluded.p_campanha else rv.p_campanha end,
      p_conteudo = case when rv.p_canal in ('direto', 'site') and v_tem_origem then excluded.p_conteudo else rv.p_conteudo end,
      p_termo = case when rv.p_canal in ('direto', 'site') and v_tem_origem then excluded.p_termo else rv.p_termo end,
      p_link = case when rv.p_canal in ('direto', 'site') and v_tem_origem then excluded.p_link else rv.p_link end,
      p_ref = case when rv.p_canal in ('direto', 'site') and v_tem_origem then excluded.p_ref else rv.p_ref end,
      u_canal = case when v_tem_origem then excluded.u_canal else rv.u_canal end,
      u_origem = case when v_tem_origem then excluded.u_origem else rv.u_origem end,
      u_meio = case when v_tem_origem then excluded.u_meio else rv.u_meio end,
      u_campanha = case when v_tem_origem then excluded.u_campanha else rv.u_campanha end,
      u_conteudo = case when v_tem_origem then excluded.u_conteudo else rv.u_conteudo end,
      u_termo = case when v_tem_origem then excluded.u_termo else rv.u_termo end,
      u_link = case when v_tem_origem then excluded.u_link else rv.u_link end,
      u_ref = case when v_tem_origem then excluded.u_ref else rv.u_ref end,
      dispositivo = coalesce(excluded.dispositivo, rv.dispositivo),
      navegador = coalesce(excluded.navegador, rv.navegador),
      visitas = rv.visitas + case when p_evento = 'entrada' then 1 else 0 end,
      eventos = rv.eventos + 1,
      ultima_em = now()
  returning * into v_vis;

  insert into public.rastreio_eventos (marca, parceiro, visitante, evento, pagina, canal, conteudo, link, detalhe)
  values (p_marca, v_par, p_visitante, p_evento, left(p_pagina, 120), v_vis.u_canal, v_vis.u_conteudo, v_vis.u_link, p_detalhe);

  -- cadastro: liga o navegador ao lead que o motor acabou de gravar (só se ele existir de verdade)
  v_email := lower(trim(coalesce(p_email, '')));
  if p_evento = 'cadastro' and v_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
    select l.id, l.origem into v_lead from public.leads_capturados l
     where l.marca = p_marca and l.email_normalizado = v_email
       and coalesce(l.inscricao_recebida_em, l.convertido_em) > now() - interval '2 hours'
     order by coalesce(l.inscricao_recebida_em, l.convertido_em) desc limit 1;
    -- o lead só é ligado uma vez, e só ao navegador que acabou de enviar o formulário (evento 'enviou'):
    -- ninguém de fora "toma" o cadastro de outra pessoa mandando o e-mail dela
    if found and not exists (select 1 from public.rastreio_visitantes o where o.lead_id = v_lead.id)
       and exists (select 1 from public.rastreio_eventos e where e.marca = p_marca and e.visitante = p_visitante and e.evento = 'enviou' and e.criado_em > now() - interval '15 minutes') then
      update public.rastreio_visitantes set email_normalizado = v_email, lead_id = v_lead.id
       where marca = p_marca and visitante = p_visitante;
      -- o lead que chegou sem marcação ganha a origem que o navegador guardou
      if coalesce(v_lead.origem, '') = '' and v_vis.u_canal not in ('direto', 'site') then
        update public.leads_capturados set
            origem = coalesce(v_vis.u_origem, case v_vis.u_canal when 'anuncio-meta' then 'meta' else v_vis.u_canal end),
            meio = coalesce(meio, v_vis.u_meio, case when v_vis.u_link is not null then 'link' else 'referencia' end),
            campanha = coalesce(campanha, v_vis.u_campanha, v_vis.u_link),
            conteudo = coalesce(conteudo, v_vis.u_conteudo),
            termo = coalesce(termo, v_vis.u_termo)
         where id = v_lead.id;
      end if;
    end if;
  end if;
end $$;
revoke all on function public.gf_rastro(text, text, text, text, text, jsonb, jsonb, text) from public;
grant execute on function public.gf_rastro(text, text, text, text, text, jsonb, jsonb, text) to anon, authenticated;

-- O app (logado) avisa que este navegador entrou: liga o visitante à conta pelo e-mail do login.
create or replace function public.gf_rastro_app(p_marca text, p_visitante text, p_evento text, p_pagina text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text; v_vis record;
begin
  if p_marca is distinct from 'globalfly' or p_visitante !~ '^[a-zA-Z0-9]{8,40}$' or p_evento !~ '^app-[a-z0-9-]{1,25}$' or auth.uid() is null then return; end if;
  if (select count(*) from public.rastreio_eventos e where e.marca = p_marca and e.visitante = p_visitante and e.criado_em > now() - interval '1 minute') >= 120 then return; end if;
  select lower(public.teeds_email_real(u.email)) into v_email from auth.users u where u.id = auth.uid();
  update public.rastreio_visitantes set email_normalizado = coalesce(email_normalizado, v_email), eventos = eventos + 1, ultima_em = now()
   where marca = p_marca and visitante = p_visitante
  returning * into v_vis;
  if not found then return; end if;
  insert into public.rastreio_eventos (marca, parceiro, visitante, evento, pagina, canal, conteudo, link)
  values (p_marca, v_vis.parceiro, p_visitante, p_evento, left(p_pagina, 120), v_vis.u_canal, v_vis.u_conteudo, v_vis.u_link);
end $$;
revoke all on function public.gf_rastro_app(text, text, text, text) from public, anon;
grant execute on function public.gf_rastro_app(text, text, text, text) to authenticated;

-- ------------------------------------------------------------------ ler (só o administrador geral)
-- O canal de cada cadastro: o do navegador ligado a ele; sem navegador (cadastro de antes da central,
-- ou feito pelo app), pela marcação gravada no próprio lead.
create or replace function public.rastreio_canal_do_lead(p_origem text, p_meio text, p_pagina text)
returns text language sql immutable set search_path = public as $$
  select case when coalesce(p_origem, '') = '' and coalesce(p_pagina, '') !~* 'fbclid=' then 'sem-origem'
              else public.rastreio_canal(p_origem, p_meio, null, null, coalesce(p_pagina, '') ~* 'fbclid=') end;
$$;

create or replace function public.teeds_central_resumo(p_marca text, p_parceiro text, p_de date, p_ate date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb; v_par text := nullif(trim(coalesce(p_parceiro, '')), '');
begin
  if not public.teeds_admin_geral_da(p_marca) then raise exception 'Só o administrador geral vê a central de rastreio'; end if;
  with ev as (
    select e.* from public.rastreio_eventos e
     where e.marca = p_marca and (v_par is null or e.parceiro = v_par)
       and e.criado_em >= (p_de::timestamp at time zone 'America/Sao_Paulo') and e.criado_em < ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
  ), passos as (
    select canal, conteudo, link, visitante,
           -- visitante = quem abriu qualquer página no período (a 2ª página da mesma sessão vem como 'pagina')
           bool_or(evento in ('entrada', 'pagina')) as entrou, bool_or(evento = 'formulario') as formulario,
           bool_or(evento = 'clicou') as clicou, bool_or(evento = 'comecou') as comecou, bool_or(evento = 'cadastro') as cadastrou
      from ev group by canal, conteudo, link, visitante
  ), l as (
    -- o canal do cadastro é o do momento do cadastro (o evento 'cadastro'), não o da última visita depois dele
    select l.id, l.email_normalizado, l.questionario_em,
           coalesce(ce.canal, rv.u_canal, public.rastreio_canal_do_lead(l.origem, l.meio, l.pagina)) as canal,
           case when ce.canal is not null then ce.conteudo
                when rv.visitante is not null then rv.u_conteudo
                when public.rastreio_canal_do_lead(l.origem, l.meio, l.pagina) = 'anuncio-meta' then l.conteudo end as conteudo,
           case when ce.canal is not null then ce.link
                when rv.visitante is not null then rv.u_link
                else (select k.codigo from public.rastreio_links k where k.marca = p_marca and k.codigo = lower(l.campanha)) end as link
      from public.leads_capturados l
      left join lateral (select v.* from public.rastreio_visitantes v where v.marca = p_marca and v.lead_id = l.id order by v.primeira_em limit 1) rv on true
      left join lateral (select e.canal, e.conteudo, e.link from public.rastreio_eventos e
                          where rv.visitante is not null and e.marca = p_marca and e.visitante = rv.visitante and e.evento = 'cadastro' order by e.id limit 1) ce on true
     where l.marca = p_marca
       and (v_par is null or l.parceiro = v_par or l.pagina ilike '%/' || v_par || '/%')
       and coalesce(l.inscricao_recebida_em, l.convertido_em) >= (p_de::timestamp at time zone 'America/Sao_Paulo')
       and coalesce(l.inscricao_recebida_em, l.convertido_em) < ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
  ), x as (
    select l.*, c.user_id, c.status_acesso,
           exists (select 1 from public.lancamento_push p where p.marca = p_marca and lower(p.email) = l.email_normalizado) as notif,
           (c.user_id is not null and exists (select 1 from public.lancamento_presencas pr where pr.marca = p_marca and pr.user_id = c.user_id)) as live
      -- uma conta por e-mail (a mesma pessoa pode ter mais de uma linha em clientes)
      from l left join lateral (select c.user_id, c.status_acesso from public.clientes c where c.marca = p_marca and lower(c.email) = l.email_normalizado order by c.criado_em limit 1) c on true
  ), com as (
    select 'canal' as tipo, canal as chave from passos union select 'canal', canal from x
    union select 'anuncio', conteudo from passos where canal = 'anuncio-meta' and conteudo is not null
    union select 'anuncio', conteudo from x where canal = 'anuncio-meta' and conteudo is not null
    union select 'link', link from passos where link is not null union select 'link', link from x where link is not null
  ), pp as (
    select c.tipo, c.chave, count(distinct p.visitante) filter (where p.entrou) as visitantes,
           count(distinct p.visitante) filter (where p.formulario) as formulario,
           count(distinct p.visitante) filter (where p.clicou) as clicou,
           count(distinct p.visitante) filter (where p.comecou) as comecou,
           -- conversão honesta: só quem foi rastreado do começo ao cadastro (numerador e denominador do mesmo grupo)
           count(distinct p.visitante) filter (where p.cadastrou) as convertidos
      from com c join passos p on (c.tipo = 'canal' and p.canal = c.chave) or (c.tipo = 'anuncio' and p.canal = 'anuncio-meta' and p.conteudo = c.chave) or (c.tipo = 'link' and p.link = c.chave)
     group by c.tipo, c.chave
  ), xx as (
    select c.tipo, c.chave, count(*) as cadastros, count(x.questionario_em) as questionario,
           count(*) filter (where x.notif) as notificacoes, count(*) filter (where x.live) as live,
           count(*) filter (where x.status_acesso = 'ativo') as liberados
      from com c join x on (c.tipo = 'canal' and x.canal = c.chave) or (c.tipo = 'anuncio' and x.canal = 'anuncio-meta' and x.conteudo = c.chave) or (c.tipo = 'link' and x.link = c.chave)
     group by c.tipo, c.chave
  ), linhas as (
    select c.tipo, c.chave, coalesce(pp.visitantes, 0) as visitantes, coalesce(pp.formulario, 0) as formulario, coalesce(pp.clicou, 0) as clicou,
           coalesce(pp.comecou, 0) as comecou, coalesce(pp.convertidos, 0) as convertidos, coalesce(xx.cadastros, 0) as cadastros, coalesce(xx.questionario, 0) as questionario,
           coalesce(xx.notificacoes, 0) as notificacoes, coalesce(xx.live, 0) as live, coalesce(xx.liberados, 0) as liberados
      from com c left join pp on pp.tipo = c.tipo and pp.chave = c.chave left join xx on xx.tipo = c.tipo and xx.chave = c.chave
     where c.chave is not null
  )
  select jsonb_build_object(
    'total', jsonb_build_object(
      'visitantes', (select count(distinct visitante) from passos where entrou),
      'formulario', (select count(distinct visitante) from passos where formulario),
      'clicou', (select count(distinct visitante) from passos where clicou),
      'comecou', (select count(distinct visitante) from passos where comecou),
      'convertidos', (select count(distinct visitante) from passos where cadastrou),
      'cadastros', (select count(*) from x), 'questionario', (select count(questionario_em) from x),
      'notificacoes', (select count(*) filter (where notif) from x), 'live', (select count(*) filter (where live) from x),
      'liberados', (select count(*) filter (where status_acesso = 'ativo') from x),
      'eventos', (select count(*) from ev)),
    'porCanal', (select coalesce(jsonb_agg(to_jsonb(s) - 'tipo' order by s.cadastros desc, s.visitantes desc), '[]'::jsonb) from linhas s where s.tipo = 'canal'),
    'porAnuncio', (select coalesce(jsonb_agg(to_jsonb(s) - 'tipo' order by s.cadastros desc, s.visitantes desc), '[]'::jsonb) from linhas s where s.tipo = 'anuncio'),
    'porLink', (select coalesce(jsonb_agg(to_jsonb(s) - 'tipo' order by s.cadastros desc, s.visitantes desc), '[]'::jsonb) from linhas s where s.tipo = 'link'),
    'porDia', (select coalesce(jsonb_agg(d order by d.dia), '[]'::jsonb) from (
       select dia, sum(vis)::int as visitantes, sum(cad)::int as cadastros from (
         select (criado_em at time zone 'America/Sao_Paulo')::date as dia, count(distinct visitante) filter (where evento in ('entrada', 'pagina')) as vis, 0 as cad from ev group by 1
         union all
         select (coalesce(l.inscricao_recebida_em, l.convertido_em) at time zone 'America/Sao_Paulo')::date, 0, count(*) from public.leads_capturados l where l.id in (select id from x) group by 1) u
       group by dia) d)
  ) into v;
  return v;
end $$;
revoke all on function public.teeds_central_resumo(text, text, date, date) from public, anon;
grant execute on function public.teeds_central_resumo(text, text, date, date) to authenticated;

-- O que está acontecendo agora: os últimos eventos, com quem é (se já se cadastrou) e de onde veio.
create or replace function public.teeds_central_ao_vivo(p_marca text, p_parceiro text, p_depois bigint default null, p_limite integer default 60)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_par text := nullif(trim(coalesce(p_parceiro, '')), '');
begin
  if not public.teeds_admin_geral_da(p_marca) then raise exception 'Só o administrador geral vê a central de rastreio'; end if;
  return (select coalesce(jsonb_agg(s order by s.id desc), '[]'::jsonb) from (
    select e.id, e.criado_em as quando, e.evento, e.pagina, e.canal, e.conteudo, e.link, e.detalhe, e.parceiro, e.visitante,
           v.dispositivo, v.navegador, v.visitas, l.nome, (v.lead_id is not null) as cadastrado
      from public.rastreio_eventos e
      join public.rastreio_visitantes v on v.marca = e.marca and v.visitante = e.visitante
      left join public.leads_capturados l on l.id = v.lead_id
     where e.marca = p_marca and (v_par is null or e.parceiro = v_par) and (p_depois is null or e.id > p_depois)
       and e.criado_em > now() - interval '3 days'
     order by e.id desc limit least(greatest(coalesce(p_limite, 60), 1), 200)) s);
end $$;
revoke all on function public.teeds_central_ao_vivo(text, text, bigint, integer) from public, anon;
grant execute on function public.teeds_central_ao_vivo(text, text, bigint, integer) to authenticated;

-- As pessoas (navegadores) do período, com até onde chegaram.
create or replace function public.teeds_central_pessoas(p_marca text, p_parceiro text, p_de date, p_ate date, p_canal text default null, p_busca text default null, p_limite integer default 200)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_par text := nullif(trim(coalesce(p_parceiro, '')), ''); v_busca text := lower(nullif(trim(coalesce(p_busca, '')), ''));
        -- p_canal também é nome de coluna: o filtro usa a cópia
        v_canal text := nullif(trim(coalesce(p_canal, '')), ''); v_bruta text := trim(coalesce(p_busca, ''));
begin
  if not public.teeds_admin_geral_da(p_marca) then raise exception 'Só o administrador geral vê a central de rastreio'; end if;
  return (select coalesce(jsonb_agg(s order by s.ultima_em desc), '[]'::jsonb) from (
    select v.visitante, v.parceiro, v.p_canal as primeiro_canal, v.u_canal as canal, v.u_conteudo as conteudo, v.u_link as link, v.dispositivo, v.navegador, v.visitas, v.eventos,
           v.primeira_em, v.ultima_em, l.nome, v.email_normalizado as email, (v.lead_id is not null) as cadastrado,
           (select array_agg(distinct e.evento) from public.rastreio_eventos e where e.marca = v.marca and e.visitante = v.visitante) as passos
      from public.rastreio_visitantes v
      left join public.leads_capturados l on l.id = v.lead_id
     where v.marca = p_marca and (v_par is null or v.parceiro = v_par)
       and v.ultima_em >= (p_de::timestamp at time zone 'America/Sao_Paulo') and v.ultima_em < ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
       and (v_canal is null or v.u_canal = v_canal)
       and (v_busca is null or lower(coalesce(l.nome, '')) like '%' || v_busca || '%' or coalesce(v.email_normalizado, '') like '%' || v_busca || '%' or v.visitante = v_bruta)
     order by v.ultima_em desc limit least(greatest(coalesce(p_limite, 200), 1), 500)) s);
end $$;
revoke all on function public.teeds_central_pessoas(text, text, date, date, text, text, integer) from public, anon;
grant execute on function public.teeds_central_pessoas(text, text, date, date, text, text, integer) to authenticated;

-- A ficha de uma pessoa: de onde veio, cada passo nas páginas e o que fez depois na plataforma.
create or replace function public.teeds_central_pessoa(p_marca text, p_visitante text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v public.rastreio_visitantes%rowtype; l public.leads_capturados%rowtype; c public.clientes%rowtype; v_email text;
begin
  if not public.teeds_admin_geral_da(p_marca) then raise exception 'Só o administrador geral vê a central de rastreio'; end if;
  select * into v from public.rastreio_visitantes where marca = p_marca and visitante = p_visitante;
  if not found then return null; end if;
  select * into l from public.leads_capturados where id = v.lead_id;
  v_email := coalesce(v.email_normalizado, l.email_normalizado);
  select * into c from public.clientes where v_email is not null and marca = p_marca and lower(email) = v_email limit 1;
  return jsonb_build_object(
    'visitante', to_jsonb(v),
    'lead', case when l.id is null then null else jsonb_build_object('nome', l.nome, 'email', l.email, 'telefone', l.telefone, 'quando', coalesce(l.inscricao_recebida_em, l.convertido_em),
              'questionario', l.questionario_em, 'exCliente', l.ex_cliente, 'produtos', l.produtos_anteriores, 'origem', l.origem, 'conteudo', l.conteudo) end,
    'conta', case when c.user_id is null then null else jsonb_build_object('criadaEm', c.criado_em, 'vistoEm', c.visto_em, 'acessos', c.total_acessos, 'status', c.status_acesso,
              'categoria', c.categoria,
              'notificacoes', exists (select 1 from public.lancamento_push p where p.marca = p_marca and lower(p.email) = v_email),
              'minutosNaLive', (select count(*) from public.lancamento_presencas pr where pr.marca = p_marca and pr.user_id = c.user_id)) end,
    'eventos', (select coalesce(jsonb_agg(e order by e.id), '[]'::jsonb) from (
                  select id, criado_em as quando, evento, pagina, canal, conteudo, link, detalhe from public.rastreio_eventos
                   where marca = p_marca and visitante = p_visitante order by id desc limit 600) e),
    -- o mesmo e-mail em outro aparelho (ex.: chegou pelo celular, entrou no app pelo computador)
    'outros', (select coalesce(jsonb_agg(o.visitante), '[]'::jsonb) from public.rastreio_visitantes o
                where v_email is not null and o.marca = p_marca and o.email_normalizado = v_email and o.visitante <> p_visitante));
end $$;
revoke all on function public.teeds_central_pessoa(text, text) from public, anon;
grant execute on function public.teeds_central_pessoa(text, text) to authenticated;

-- ------------------------------------------------------------------ links marcados
create or replace function public.teeds_rastreio_links(p_marca text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.teeds_admin_geral_da(p_marca) then raise exception 'Só o administrador geral vê os links'; end if;
  return (select coalesce(jsonb_agg(s order by s.criado_em desc), '[]'::jsonb) from (
    select k.id, k.codigo, k.nome, k.canal, k.parceiro, k.arquivado, k.criado_em,
           (select count(*) from public.rastreio_visitantes v where v.marca = k.marca and (v.u_link = k.codigo or v.p_link = k.codigo)) as visitantes,
           (select count(*) from public.rastreio_visitantes v where v.marca = k.marca and (v.u_link = k.codigo or v.p_link = k.codigo) and v.lead_id is not null) as cadastros
      from public.rastreio_links k where k.marca = p_marca) s);
end $$;
revoke all on function public.teeds_rastreio_links(text) from public, anon;
grant execute on function public.teeds_rastreio_links(text) to authenticated;

create or replace function public.teeds_rastreio_link_salvar(p_marca text, p_parceiro text, p_nome text, p_canal text, p_codigo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cod text := lower(trim(coalesce(p_codigo, ''))); v_par text := public.teeds_parceiro_valido(p_marca, p_parceiro); r record;
begin
  if not public.teeds_admin_geral_da(p_marca) then raise exception 'Só o administrador geral cria links'; end if;
  if v_cod !~ '^[a-z0-9][a-z0-9-]{1,39}$' then raise exception 'O código do link só pode ter letras minúsculas, números e hífen (2 a 40).'; end if;
  if length(trim(coalesce(p_nome, ''))) < 2 then raise exception 'Dê um nome ao link.'; end if;
  if lower(trim(coalesce(p_canal, ''))) !~ '^[a-z][a-z0-9-]{1,29}$' then raise exception 'Escolha o canal do link.'; end if;
  if exists (select 1 from public.rastreio_links where marca = p_marca and codigo = v_cod) then raise exception 'Já existe um link com esse código.'; end if;
  insert into public.rastreio_links (marca, parceiro, codigo, nome, canal, criado_por)
  values (p_marca, v_par, v_cod, left(trim(p_nome), 80), lower(trim(p_canal)), auth.uid()) returning * into r;
  return to_jsonb(r);
end $$;
revoke all on function public.teeds_rastreio_link_salvar(text, text, text, text, text) from public, anon;
grant execute on function public.teeds_rastreio_link_salvar(text, text, text, text, text) to authenticated;

create or replace function public.teeds_rastreio_link_arquivar(p_marca text, p_id uuid, p_arquivado boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.teeds_admin_geral_da(p_marca) then raise exception 'Só o administrador geral mexe nos links'; end if;
  update public.rastreio_links set arquivado = coalesce(p_arquivado, true) where marca = p_marca and id = p_id;
end $$;
revoke all on function public.teeds_rastreio_link_arquivar(text, uuid, boolean) from public, anon;
grant execute on function public.teeds_rastreio_link_arquivar(text, uuid, boolean) to authenticated;
