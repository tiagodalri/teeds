-- 08/11/2026, Tiago (funil do /v em "Só os de anúncio"): "como é possível 1 cadastrado e 3 questionários respondidos?
-- tem coisa estranha". Conferido pessoa por pessoa, eram dois furos:
--
-- 1) Robôs de revisão da Meta. Quando um anúncio é criado ou editado, a Meta abre o link com a marcação do anúncio e
--    preenche o formulário de uma vez: 6 eventos 'comecou' no mesmo instante (< 1 s), sem nunca enviar. No /v, 25 dos 26
--    "começaram o cadastro" eram isso, em rajadas de ~3 por anúncio às 13h18–13h27 e 17h58. Em todo o histórico da
--    GlobalFly nenhuma pessoa que virou cadastro tem esse padrão (0 de 468), então a regra não tira gente de verdade.
-- 2) Anúncio de outro parceiro. O cliente fica preso ao 1º parceiro: quem é do /v e clicou num anúncio do Naor contava
--    como "de anúncio" no funil do Victor (2 dos 3 questionários). Agora o anúncio só vale para o parceiro dono da conta
--    (a lista vem da ponte da Meta, meta_ponte_entidade). Anúncio que a ponte ainda não conhece continua valendo.

-- Robô de revisão: preencheu 3+ campos em menos de 1 segundo e nunca virou cadastro
create or replace function public.rastreio_robo(p_marca text, p_visitante text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.rastreio_visitantes v where v.marca = p_marca and v.visitante = p_visitante and v.lead_id is not null)
     and coalesce((select count(*) >= 3 and max(e.criado_em) - min(e.criado_em) < interval '1 second'
                     from public.rastreio_eventos e
                    where e.marca = p_marca and e.visitante = p_visitante and e.evento = 'comecou'), false)
$$;

-- O anúncio é deste parceiro? Sem número, da conta dele, ou ainda desconhecido pela ponte: sim. Da conta de outro: não.
create or replace function public.rastreio_anuncio_do_parceiro(p_marca text, p_parceiro text, p_anuncio text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_anuncio, '') = ''
      or exists (select 1 from public.meta_ponte_entidade m where m.marca = p_marca and m.parceiro = p_parceiro and m.tipo = 'anuncio' and m.id = p_anuncio)
      or not exists (select 1 from public.meta_ponte_entidade m where m.marca = p_marca and m.tipo = 'anuncio' and m.id = p_anuncio)
$$;
revoke all on function public.rastreio_robo(text, text) from public, anon;
revoke all on function public.rastreio_anuncio_do_parceiro(text, text, text) from public, anon;

CREATE OR REPLACE FUNCTION public.teeds_meta_funil(p_marca text, p_parceiro text, p_de date, p_ate date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  if not public.teeds_admin_pleno_da(p_marca) then raise exception 'Só o administrador geral vê os anúncios'; end if;
  p_parceiro := coalesce(public.teeds_parceiro_forcado(p_marca), p_parceiro);
  with l0 as (
    select l.*, public.rastreio_anuncio_do_lead(p_marca, l.id, l.email_normalizado, coalesce(l.inscricao_recebida_em, l.convertido_em), l.origem, l.meio, l.pagina, l.conteudo) as anuncio
      from public.leads_capturados l
     where l.marca = p_marca
       and (l.parceiro = p_parceiro or l.pagina ilike '%/' || p_parceiro || '/%')
       and (l.inscricao_recebida_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
  ), l as (
    select l0.email_normalizado, l0.origem, coalesce(nullif(l0.anuncio, ''), l0.conteudo) as conteudo, l0.campanha, l0.questionario_em,
           -- 08/11/2026: só anúncio da conta deste parceiro (o de outro parceiro fica "por fora")
           (l0.anuncio is not null and public.rastreio_anuncio_do_parceiro(p_marca, p_parceiro, l0.anuncio)) as de_anuncio,
           (l0.inscricao_recebida_em at time zone 'America/Sao_Paulo')::date as dia
      from l0
  ), x as (
    select l.*, c.user_id, c.status_acesso,
           exists (select 1 from public.lancamento_push p where p.marca = p_marca and lower(p.email) = l.email_normalizado) as notif,
           (c.user_id is not null and exists (select 1 from public.lancamento_presencas pr where pr.marca = p_marca and pr.user_id = c.user_id)) as live
      from l
      left join public.clientes c on c.marca = p_marca and lower(c.email) = l.email_normalizado
  )
  select jsonb_build_object(
    'total', (select jsonb_build_object('cadastros', count(*), 'questionario', count(questionario_em), 'contas', count(user_id),
                'notificacoes', count(*) filter (where notif), 'live', count(*) filter (where live), 'liberados', count(*) filter (where status_acesso = 'ativo')) from x),
    'anuncio', (select jsonb_build_object('cadastros', count(*), 'questionario', count(questionario_em), 'contas', count(user_id),
                'notificacoes', count(*) filter (where notif), 'live', count(*) filter (where live), 'liberados', count(*) filter (where status_acesso = 'ativo')) from x where de_anuncio),
    'porAnuncio', (select coalesce(jsonb_agg(s order by s.cadastros desc), '[]'::jsonb) from (
                    select conteudo as id, count(*) as cadastros, count(questionario_em) as questionario, count(*) filter (where notif) as notificacoes,
                           count(*) filter (where live) as live, count(*) filter (where status_acesso = 'ativo') as liberados
                      from x where de_anuncio and coalesce(conteudo, '') <> '' group by conteudo) s),
    'porDia', (select coalesce(jsonb_agg(s order by s.dia), '[]'::jsonb) from (
                select dia, count(*) as cadastros, count(*) filter (where de_anuncio) as "deAnuncio" from x group by dia) s),
    'porOrigem', (select coalesce(jsonb_agg(s order by s.cadastros desc), '[]'::jsonb) from (
                select coalesce(nullif(lower(origem), ''), 'sem origem') as origem, count(*) as cadastros from x group by 1) s),
    -- 05/11/2026: só os que não vieram de anúncio, por origem (Instagram, Facebook, Telegram, sem origem...)
    'foraPorOrigem', (select coalesce(jsonb_agg(s order by s.cadastros desc), '[]'::jsonb) from (
                select coalesce(nullif(lower(origem), ''), 'sem origem') as origem, count(*) as cadastros from x where not de_anuncio group by 1) s),
    -- os de anúncio que chegaram sem o número do anúncio (não dá para dizer de qual campanha são)
    'anuncioSemNumero', (select count(*) from x where de_anuncio and coalesce(conteudo, '') = ''),
    'servidor', (select jsonb_build_object('enviados', count(*) filter (where situacao = 'enviado'), 'semChave', count(*) filter (where situacao = 'sem-chave'),
                'erros', count(*) filter (where situacao = 'erro')) from public.meta_conversoes m
                 where m.marca = p_marca and m.parceiro = p_parceiro and (m.criado_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate)
  ) into v;
  -- 08/11/2026: sem os robôs de revisão da Meta
  v := v || jsonb_build_object('passos', jsonb_build_object(
    'visitas', (select count(distinct t.visitante) from public.parceiro_toques t where t.marca = p_marca and t.codigo = p_parceiro and t.dia between p_de and p_ate),
    'formulario', (select count(*) from public.funil_passos f where f.marca = p_marca and f.parceiro = p_parceiro and f.passo = 'formulario' and (f.criado_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate and not public.rastreio_robo(p_marca, f.visitante)),
    'clicou', (select count(*) from public.funil_passos f where f.marca = p_marca and f.parceiro = p_parceiro and f.passo = 'clicou' and (f.criado_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate and not public.rastreio_robo(p_marca, f.visitante)),
    'comecou', (select count(*) from public.funil_passos f where f.marca = p_marca and f.parceiro = p_parceiro and f.passo = 'comecou' and (f.criado_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate and not public.rastreio_robo(p_marca, f.visitante))));
  -- 04/11/2026: os mesmos passos só de quem veio dos anúncios (Central de rastreio, desde 04/11), para o funil
  -- "Só os de anúncio" não misturar visitas orgânicas com as etapas da Meta.
  -- 08/11/2026: só anúncios da conta deste parceiro e sem os robôs de revisão da Meta
  v := v || jsonb_build_object('passosAnuncio', (
    with e as (
      select e.visitante, e.evento
        from public.rastreio_eventos e
       where e.marca = p_marca and e.parceiro = p_parceiro and e.canal = 'anuncio-meta'
         and e.criado_em >= (p_de::timestamp at time zone 'America/Sao_Paulo') and e.criado_em < ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
         and public.rastreio_anuncio_do_parceiro(p_marca, p_parceiro, e.conteudo)
    ), gente as (
      select q.visitante from (select distinct visitante from e) q where not public.rastreio_robo(p_marca, q.visitante)
    )
    select jsonb_build_object(
      'visitas', count(distinct e.visitante) filter (where e.evento in ('entrada', 'pagina')),
      'formulario', count(distinct e.visitante) filter (where e.evento = 'formulario'),
      'clicou', count(distinct e.visitante) filter (where e.evento = 'clicou'),
      'comecou', count(distinct e.visitante) filter (where e.evento = 'comecou'))
      from e join gente g on g.visitante = e.visitante));
  return v;
end $function$;

-- Os horários dos cadastros (aba Anúncios) com a mesma regra do anúncio do parceiro
CREATE OR REPLACE FUNCTION public.teeds_meta_horarios(p_marca text, p_parceiro text, p_de date, p_ate date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  if not public.teeds_admin_pleno_da(p_marca) then raise exception 'Só o administrador geral vê os anúncios'; end if;
  p_parceiro := coalesce(public.teeds_parceiro_forcado(p_marca), p_parceiro);
  with l0 as (
    select (l.inscricao_recebida_em at time zone 'America/Sao_Paulo') as quando,
           public.rastreio_anuncio_do_lead(p_marca, l.id, l.email_normalizado, coalesce(l.inscricao_recebida_em, l.convertido_em), l.origem, l.meio, l.pagina, l.conteudo) as anuncio
      from public.leads_capturados l
     where l.marca = p_marca
       and (l.parceiro = p_parceiro or l.pagina ilike '%/' || p_parceiro || '/%')
       and (l.inscricao_recebida_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
  ), l as (
    select quando, (anuncio is not null and public.rastreio_anuncio_do_parceiro(p_marca, p_parceiro, anuncio)) as de_anuncio from l0
  )
  select jsonb_build_object(
    'porHora', (select coalesce(jsonb_agg(s order by s.hora), '[]'::jsonb) from (
                 select extract(hour from quando)::int as hora, count(*) as cadastros, count(*) filter (where de_anuncio) as "deAnuncio" from l group by 1) s),
    'porSemana', (select coalesce(jsonb_agg(s order by s.dia), '[]'::jsonb) from (
                 select extract(dow from quando)::int as dia, count(*) as cadastros, count(*) filter (where de_anuncio) as "deAnuncio" from l group by 1) s)
  ) into v;
  return v;
end $function$;
