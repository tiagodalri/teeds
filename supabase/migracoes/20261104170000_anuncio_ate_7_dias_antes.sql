-- 04/11/2026, Tiago: "os números do gerenciador estão bem diferentes dos da plataforma... isso não pode
-- acontecer". Conferido: investido, impressões, cliques e chegadas na página batem com a Meta. O que não
-- batia era o cadastro: a plataforma só dava o cadastro ao anúncio quando a pessoa chegava pelo link
-- marcado NA HORA do cadastro. Quem clicou no anúncio e voltou depois pelo perfil/bio ficava como
-- "Instagram" (hoje, 3 dos 8). A Meta dá o cadastro a quem clicou no anúncio até 7 dias antes.
--
-- Regra nova, a mesma em todas as leituras (funil, horários, jornada, resumo da central): o cadastro é do
-- anúncio se chegou com a marcação do anúncio OU se o mesmo navegador/e-mail veio de um anúncio nos 7
-- dias antes do cadastro (vale o último anúncio visto). Devolve o id do anúncio ('' se não souber qual)
-- ou null quando não veio de anúncio.
create or replace function public.rastreio_anuncio_do_lead(p_marca text, p_lead uuid, p_email text, p_cadastro timestamptz,
  p_origem text, p_meio text, p_pagina text, p_conteudo text)
returns text language sql stable security definer set search_path = public as $$
  select case
    when public.rastreio_canal_do_lead(p_origem, p_meio, p_pagina) = 'anuncio-meta' then coalesce(p_conteudo, '')
    else (select coalesce(e.conteudo, '')
            from public.rastreio_visitantes v
            join public.rastreio_eventos e on e.marca = v.marca and e.visitante = v.visitante
           where v.marca = p_marca and (v.lead_id = p_lead or (p_email is not null and v.email_normalizado = p_email))
             and e.canal = 'anuncio-meta'
             and p_cadastro is not null and e.criado_em between p_cadastro - interval '7 days' and p_cadastro + interval '5 minutes'
           order by e.criado_em desc limit 1)
  end;
$$;
revoke all on function public.rastreio_anuncio_do_lead(text, uuid, text, timestamptz, text, text, text, text) from public, anon, authenticated;

do $$
declare
  f text; n int;
  chamada_l text := 'public.rastreio_anuncio_do_lead(p_marca, l.id, l.email_normalizado, coalesce(l.inscricao_recebida_em, l.convertido_em), l.origem, l.meio, l.pagina, l.conteudo)';
  velho_de_anuncio text := '(public.rastreio_canal_do_lead(l.origem, l.meio, l.pagina) = ''anuncio-meta'') as de_anuncio';
  novo_de_anuncio text := '(' || chamada_l || ' is not null) as de_anuncio';
  troca text;
begin
  -- 1. funil dos anúncios: de_anuncio e o anúncio do cadastro
  f := pg_get_functiondef('public.teeds_meta_funil(text,text,date,date)'::regprocedure);
  if position(velho_de_anuncio in f) = 0 then raise exception 'funil: trecho de_anuncio não encontrado'; end if;
  f := replace(f, velho_de_anuncio, novo_de_anuncio);
  troca := 'select l.email_normalizado, l.origem, l.conteudo,';
  if position(troca in f) = 0 then raise exception 'funil: trecho conteudo não encontrado'; end if;
  f := replace(f, troca, 'select l.email_normalizado, l.origem, coalesce(nullif(' || chamada_l || ', ''''), l.conteudo) as conteudo,');
  execute f;

  -- 2. horários
  f := pg_get_functiondef('public.teeds_meta_horarios(text,text,date,date)'::regprocedure);
  if position(velho_de_anuncio in f) = 0 then raise exception 'horarios: trecho de_anuncio não encontrado'; end if;
  execute replace(f, velho_de_anuncio, novo_de_anuncio);

  -- 3. jornada completa: o canal e o anúncio de cada pessoa
  f := pg_get_functiondef('public.teeds_jornada_completa(text,text,date,date)'::regprocedure);
  troca := 'join public.leads_capturados l on l.id = jl.id';
  if position(troca in f) = 0 then raise exception 'jornada: join não encontrado'; end if;
  f := replace(f, troca, troca || E'\n      left join lateral (select public.rastreio_anuncio_do_lead(p_marca, l.id, l.email_normalizado, jl.cad, l.origem, l.meio, l.pagina, l.conteudo) as id) ad on true');
  troca := 'coalesce(ce.canal, rv.u_canal, public.rastreio_canal_do_lead(l.origem, l.meio, l.pagina)) as canal,';
  if position(troca in f) = 0 then raise exception 'jornada: canal não encontrado'; end if;
  f := replace(f, troca, 'case when ad.id is not null then ''anuncio-meta'' else coalesce(ce.canal, rv.u_canal, public.rastreio_canal_do_lead(l.origem, l.meio, l.pagina)) end as canal,');
  troca := 'case when ce.canal is not null then ce.conteudo';
  if position(troca in f) = 0 then raise exception 'jornada: anuncio não encontrado'; end if;
  f := replace(f, troca, 'case when ad.id is not null then nullif(ad.id, '''') when ce.canal is not null then ce.conteudo');
  execute f;

  -- 4. resumo da central (origens e criativos)
  f := pg_get_functiondef('public.teeds_central_resumo(text,text,date,date)'::regprocedure);
  troca := 'e.evento = ''cadastro'' order by e.id limit 1) ce on true';
  if position(troca in f) = 0 then raise exception 'resumo: join ce não encontrado'; end if;
  f := replace(f, troca, troca || E'\n      left join lateral (select ' || chamada_l || ' as id) ad on true');
  troca := 'coalesce(ce.canal, rv.u_canal, public.rastreio_canal_do_lead(l.origem, l.meio, l.pagina)) as canal,';
  if position(troca in f) = 0 then raise exception 'resumo: canal não encontrado'; end if;
  f := replace(f, troca, 'case when ad.id is not null then ''anuncio-meta'' else coalesce(ce.canal, rv.u_canal, public.rastreio_canal_do_lead(l.origem, l.meio, l.pagina)) end as canal,');
  troca := 'case when ce.canal is not null then ce.conteudo';
  if position(troca in f) = 0 then raise exception 'resumo: conteudo não encontrado'; end if;
  f := replace(f, troca, 'case when ad.id is not null then nullif(ad.id, '''') when ce.canal is not null then ce.conteudo');
  execute f;
end $$;
