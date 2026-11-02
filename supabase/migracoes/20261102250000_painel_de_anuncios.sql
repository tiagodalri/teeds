-- Administração › Anúncios (02/11/2026, Tiago: "um dash mega completo dessa integração do
-- Meta Ads... a performance de cada anúncio em detalhes... inclusive os rastreios dos eventos
-- do pixel").
--
-- Duas fontes lado a lado:
--   1) A Meta (função meta-ads): conta, campanhas, conjuntos, anúncios, números por dia,
--      idade/gênero, posicionamento, aparelho, estado e os eventos que o pixel recebeu.
--      Lê com a chave de acesso da conta de anúncios (META_ADS_<MARCA>_<PARCEIRO> em
--      config_servicos), colada pelo admin geral. A resposta fica 5 minutos em meta_ads_cache.
--   2) O nosso banco (teeds_meta_funil): o que a Meta não vê. Quantos cadastros de verdade
--      cada anúncio trouxe (utm_content = id do anúncio), quantos responderam o questionário,
--      ativaram notificações, assistiram à live e tiveram o acesso liberado.

create table if not exists public.meta_ads_cache (
  chave text primary key,
  dados jsonb not null,
  em timestamptz not null default now()
);
alter table public.meta_ads_cache enable row level security;
revoke all on public.meta_ads_cache from anon, authenticated;

-- A chave da conta de anúncios (vazia apaga). A mesma chave serve à API de Conversões
-- quando o parceiro não tiver uma chave só do pixel.
create or replace function public.teeds_meta_ads_chave_salvar(p_marca text, p_parceiro text, p_chave text)
returns void language plpgsql security definer set search_path = public as $$
declare v_nome text := 'META_ADS_' || upper(p_marca) || '_' || upper(p_parceiro);
        v_chave text := btrim(coalesce(p_chave, ''));
begin
  if not public.teeds_admin_geral_da(p_marca) then raise exception 'Só o administrador geral conecta a conta de anúncios'; end if;
  if p_parceiro !~ '^[a-z0-9]{1,12}$' then raise exception 'Parceiro inválido'; end if;
  delete from public.meta_ads_cache where chave like p_marca || ':' || p_parceiro || ':%';
  if v_chave = '' then delete from public.config_servicos where chave = v_nome; return; end if;
  if v_chave !~ '^EA[A-Za-z0-9]{40,}$' then
    raise exception 'Essa não parece a chave da Meta. Ela começa com EA e é bem comprida: copie de novo.';
  end if;
  insert into public.config_servicos (chave, valor, atualizado_em) values (v_nome, v_chave, now())
  on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
end $$;
revoke all on function public.teeds_meta_ads_chave_salvar(text, text, text) from public, anon;
grant execute on function public.teeds_meta_ads_chave_salvar(text, text, text) to authenticated;

-- O envio pelo servidor vale com a chave do pixel OU com a da conta de anúncios
create or replace function public.teeds_meta_situacao(p_marca text, p_parceiro text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
        v_capi text := 'META_CAPI_' || upper(p_marca) || '_' || upper(p_parceiro);
        v_ads text := 'META_ADS_' || upper(p_marca) || '_' || upper(p_parceiro);
begin
  if not public.teeds_admin_geral_da(p_marca) then raise exception 'Só o administrador geral vê o pixel'; end if;
  select jsonb_build_object(
    'temChave', exists (select 1 from public.config_servicos where chave in (v_capi, v_ads)),
    'chaveEm', (select min(atualizado_em) from public.config_servicos where chave in (v_capi, v_ads)),
    'enviados', (select count(*) from public.meta_conversoes m where m.marca = p_marca and m.parceiro = p_parceiro and m.situacao = 'enviado' and m.criado_em > now() - interval '7 days'),
    'semChave', (select count(*) from public.meta_conversoes m where m.marca = p_marca and m.parceiro = p_parceiro and m.situacao = 'sem-chave' and m.criado_em > now() - interval '7 days'),
    'ultimoEnvio', (select max(criado_em) from public.meta_conversoes m where m.marca = p_marca and m.parceiro = p_parceiro and m.situacao = 'enviado'),
    'ultimoErro', (select jsonb_build_object('em', criado_em, 'detalhe', detalhe) from public.meta_conversoes m
                    where m.marca = p_marca and m.parceiro = p_parceiro and m.situacao = 'erro' order by criado_em desc limit 1)
  ) into v;
  return v;
end $$;

-- O funil do nosso lado, no período (datas no horário de Brasília)
create or replace function public.teeds_meta_funil(p_marca text, p_parceiro text, p_de date, p_ate date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.teeds_admin_geral_da(p_marca) then raise exception 'Só o administrador geral vê os anúncios'; end if;
  with l as (
    select l.email_normalizado, l.origem, l.conteudo, l.campanha, l.questionario_em,
           (lower(coalesce(l.origem, '')) in ('meta', 'facebook', 'fb', 'instagram', 'ig', 'an', 'messenger', 'audience_network')
             or l.pagina ilike '%fbclid=%' or l.pagina ilike '%utm_source=meta%') as de_anuncio,
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
    'servidor', (select jsonb_build_object('enviados', count(*) filter (where situacao = 'enviado'), 'semChave', count(*) filter (where situacao = 'sem-chave'),
                'erros', count(*) filter (where situacao = 'erro')) from public.meta_conversoes m
                 where m.marca = p_marca and m.parceiro = p_parceiro and (m.criado_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate)
  ) into v;
  return v;
end $$;
revoke all on function public.teeds_meta_funil(text, text, date, date) from public, anon;
grant execute on function public.teeds_meta_funil(text, text, date, date) to authenticated;
