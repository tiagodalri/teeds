-- 05/11/2026, Tiago: "se marca numa campanha específica, o número de cadastros tem que ser os cadastros daquela
-- campanha especificamente... se teve cadastro por fora dessa campanha, não tem que ser contabilizado nela, tem que
-- ser contabilizado totalmente separado". O funil passa a devolver também de onde vieram os cadastros que NÃO
-- vieram de anúncio (foraPorOrigem), para a aba Anúncios mostrar a campanha e o "por fora" separados.
-- O resto da função é o mesmo de antes.
CREATE OR REPLACE FUNCTION public.teeds_meta_funil(p_marca text, p_parceiro text, p_de date, p_ate date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  if not public.teeds_admin_geral_da(p_marca) then raise exception 'Só o administrador geral vê os anúncios'; end if;
  with l as (
    select l.email_normalizado, l.origem, coalesce(nullif(public.rastreio_anuncio_do_lead(p_marca, l.id, l.email_normalizado, coalesce(l.inscricao_recebida_em, l.convertido_em), l.origem, l.meio, l.pagina, l.conteudo), ''), l.conteudo) as conteudo, l.campanha, l.questionario_em,
           (public.rastreio_anuncio_do_lead(p_marca, l.id, l.email_normalizado, coalesce(l.inscricao_recebida_em, l.convertido_em), l.origem, l.meio, l.pagina, l.conteudo) is not null) as de_anuncio,
           (l.inscricao_recebida_em at time zone 'America/Sao_Paulo')::date as dia
      from public.leads_capturados l
     where l.marca = p_marca
       and (l.parceiro = p_parceiro or l.pagina ilike '%/' || p_parceiro || '/%')
       and (l.inscricao_recebida_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
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
  v := v || jsonb_build_object('passos', jsonb_build_object(
    'visitas', (select count(distinct t.visitante) from public.parceiro_toques t where t.marca = p_marca and t.codigo = p_parceiro and t.dia between p_de and p_ate),
    'formulario', (select count(*) from public.funil_passos f where f.marca = p_marca and f.parceiro = p_parceiro and f.passo = 'formulario' and (f.criado_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate),
    'clicou', (select count(*) from public.funil_passos f where f.marca = p_marca and f.parceiro = p_parceiro and f.passo = 'clicou' and (f.criado_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate),
    'comecou', (select count(*) from public.funil_passos f where f.marca = p_marca and f.parceiro = p_parceiro and f.passo = 'comecou' and (f.criado_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate)));
  -- 04/11/2026: os mesmos passos só de quem veio dos anúncios (Central de rastreio, desde 04/11), para o funil
  -- "Só os de anúncio" não misturar visitas orgânicas com as etapas da Meta
  v := v || jsonb_build_object('passosAnuncio', (select jsonb_build_object(
      'visitas', count(distinct e.visitante) filter (where e.evento in ('entrada', 'pagina')),
      'formulario', count(distinct e.visitante) filter (where e.evento = 'formulario'),
      'clicou', count(distinct e.visitante) filter (where e.evento = 'clicou'),
      'comecou', count(distinct e.visitante) filter (where e.evento = 'comecou'))
    from public.rastreio_eventos e
   where e.marca = p_marca and e.parceiro = p_parceiro and e.canal = 'anuncio-meta'
     and e.criado_em >= (p_de::timestamp at time zone 'America/Sao_Paulo') and e.criado_em < ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')));
  return v;
end $function$;
