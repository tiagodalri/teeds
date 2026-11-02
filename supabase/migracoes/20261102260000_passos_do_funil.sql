-- Os passos da página de cadastro gravados no nosso banco (02/11/2026).
--
-- A Meta segura os eventos próprios novos do pixel ("não verificados") até o dono do pixel
-- aprovar: ClicouCadastrar e ComecouCadastro chegavam ao pixel e eram descartados. Para o funil
-- da aba Anúncios não depender disso, a página grava aqui também: viu o formulário, clicou em
-- cadastrar e começou a preencher. Um por visitante e passo (o mesmo visitante de parceiro_toques).

create table if not exists public.funil_passos (
  marca text not null,
  parceiro text not null,
  visitante text not null,
  passo text not null check (passo in ('formulario', 'clicou', 'comecou')),
  criado_em timestamptz not null default now(),
  primary key (marca, parceiro, visitante, passo)
);
create index if not exists funil_passos_quando on public.funil_passos (marca, parceiro, criado_em);
alter table public.funil_passos enable row level security;
revoke all on public.funil_passos from anon, authenticated;

create or replace function public.gf_funil_passo(p_marca text, p_parceiro text, p_visitante text, p_passo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_codigo text := public.teeds_parceiro_valido(p_marca, p_parceiro);
begin
  if v_codigo is null or p_visitante !~ '^[a-zA-Z0-9]{8,40}$' or p_passo not in ('formulario', 'clicou', 'comecou') then return; end if;
  insert into public.funil_passos (marca, parceiro, visitante, passo) values (p_marca, v_codigo, p_visitante, p_passo)
  on conflict do nothing;
end $$;
revoke all on function public.gf_funil_passo(text, text, text, text) from public;
grant execute on function public.gf_funil_passo(text, text, text, text) to anon, authenticated;

-- teeds_meta_funil passa a trazer os passos da página (visitas, formulário, clicou, começou)
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
  -- os passos da página antes do cadastro (visita = parceiro_toques; o resto = funil_passos)
  v := v || jsonb_build_object('passos', jsonb_build_object(
    'visitas', (select count(distinct t.visitante) from public.parceiro_toques t where t.marca = p_marca and t.codigo = p_parceiro and t.dia between p_de and p_ate),
    'formulario', (select count(*) from public.funil_passos f where f.marca = p_marca and f.parceiro = p_parceiro and f.passo = 'formulario' and (f.criado_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate),
    'clicou', (select count(*) from public.funil_passos f where f.marca = p_marca and f.parceiro = p_parceiro and f.passo = 'clicou' and (f.criado_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate),
    'comecou', (select count(*) from public.funil_passos f where f.marca = p_marca and f.parceiro = p_parceiro and f.passo = 'comecou' and (f.criado_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate)));
  return v;
end $$;
revoke all on function public.teeds_meta_funil(text, text, date, date) from public, anon;
grant execute on function public.teeds_meta_funil(text, text, date, date) to authenticated;
