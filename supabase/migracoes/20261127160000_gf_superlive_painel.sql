-- Super Live 29/11/2026 (Tiago, 27/11: "onde eu acompanho a qtd de leads aguardando a live? quero trackear certinho
-- de onde veio cada cadastro. story, manychat, telegram, tudo certinho").
-- 1) Links da Central de rastreio só da Super Live, um por parceiro e canal (abrem a página da Super Live do parceiro).
-- 2) teeds_superlive_painel: inscritos, quem espera a live, quem já era cliente, por parceiro, por link e pessoa a pessoa.
--    Mesma regra de leitura dos leads: admin geral vê tudo; admin do parceiro, só o dele.

insert into public.rastreio_links (marca, parceiro, codigo, nome, canal)
select 'globalfly', p, c, n, k from (values
  ('v','sl-victor-stories','Super Live · Stories do Victor','stories'),
  ('v','sl-victor-bio','Super Live · Bio do Instagram do Victor','bio-instagram'),
  ('v','sl-victor-direct','Super Live · Direct do Instagram do Victor','instagram'),
  ('v','sl-victor-manychat','Super Live · ManyChat do Victor','manychat'),
  ('v','sl-victor-telegram','Super Live · Telegram do Victor','telegram'),
  ('v','sl-victor-comunidade','Super Live · Comunidade do WhatsApp do Victor','whatsapp'),
  ('v','sl-victor-whatsapp','Super Live · WhatsApp direto do Victor','whatsapp'),
  ('n','sl-naor-stories','Super Live · Stories do Naor','stories'),
  ('n','sl-naor-bio','Super Live · Bio do Instagram do Naor','bio-instagram'),
  ('n','sl-naor-direct','Super Live · Direct do Instagram do Naor','instagram'),
  ('n','sl-naor-manychat','Super Live · ManyChat do Naor','manychat'),
  ('n','sl-naor-telegram','Super Live · Telegram do Naor','telegram'),
  ('n','sl-naor-comunidade','Super Live · Comunidade do WhatsApp do Naor','whatsapp'),
  ('n','sl-naor-whatsapp','Super Live · WhatsApp direto do Naor','whatsapp')
) as t(p, c, n, k)
where not exists (select 1 from public.rastreio_links r where r.marca = 'globalfly' and r.codigo = t.c);

create or replace function public.teeds_superlive_painel(p_marca text default 'globalfly')
 returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  with base as (
    select distinct on (p.email)
           p.email, p.nome, p.telefone, p.status, p.superlive_segura, p.criado_em, p.ultima_inscricao_em, p.email_cadastro_em,
           l.id as lead_id, coalesce(l.parceiro, '') as parceiro, l.origem, l.meio, l.campanha, l.conteudo
      from public.clientes_pendentes p
      left join lateral (select x.* from public.leads_capturados x
                          where x.marca = p.marca and lower(x.email) = p.email
                          order by x.inscricao_recebida_em desc nulls last limit 1) l on true
     where p.marca = p_marca and p.superlive
     order by p.email, p.ultima_inscricao_em desc nulls last
  ), comvisita as (
    select b.*,
           v.u_link, v.p_link, v.u_canal, v.p_canal,
           exists(select 1 from public.clientes c where c.marca = p_marca and lower(trim(c.email)) = b.email) as tem_conta,
           (select c.status_acesso from public.clientes c where c.marca = p_marca and lower(trim(c.email)) = b.email limit 1) as acesso
      from base b
      left join lateral (select r.* from public.rastreio_visitantes r
                          where r.marca = p_marca and (r.lead_id = b.lead_id or r.email_normalizado = b.email)
                          order by (r.lead_id = b.lead_id) desc nulls last, r.ultima_em desc limit 1) v on true
     where p_marca = any(public.teeds_marcas_admin_total())
        or (p_marca || ':' || b.parceiro) = any(public.teeds_escopos())
  ), pessoa as (
    select c.*,
           nullif(coalesce(nullif(c.u_link, ''), nullif(c.p_link, '')), '') as link,
           coalesce(case when nullif(trim(c.origem), '') is not null then public.rastreio_canal(c.origem, c.meio, null, null, false) end,
                    (select k.canal from public.rastreio_links k where k.marca = p_marca and k.codigo = coalesce(nullif(c.u_link, ''), nullif(c.p_link, ''))),
                    nullif(c.u_canal, ''), nullif(c.p_canal, ''), 'direto') as canal,
           case when c.superlive_segura and c.status in ('pendente', 'processando') then 'aguardando'
                when not c.superlive_segura then 'ja_cliente'
                else 'liberado' end as situacao
      from comvisita c
  )
  select jsonb_build_object(
    'inicio', (select inicio from public.superlive_controle where marca = p_marca),
    'liberado_em', (select liberado_em from public.superlive_controle where marca = p_marca),
    'total', (select count(*) from pessoa),
    'aguardando', (select count(*) from pessoa where situacao = 'aguardando'),
    'ja_clientes', (select count(*) from pessoa where situacao = 'ja_cliente'),
    'liberados', (select count(*) from pessoa where situacao = 'liberado'),
    'entraram', (select count(*) from pessoa where situacao = 'aguardando' and tem_conta),
    'hoje', (select count(*) from pessoa where (ultima_inscricao_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date),
    'por_parceiro', coalesce((select jsonb_agg(jsonb_build_object('parceiro', parceiro, 'inscritos', n, 'aguardando', a, 'ja_clientes', j) order by n desc)
        from (select parceiro, count(*) n, count(*) filter (where situacao = 'aguardando') a, count(*) filter (where situacao = 'ja_cliente') j from pessoa group by parceiro) s), '[]'::jsonb),
    'por_origem', coalesce((select jsonb_agg(jsonb_build_object('link', link, 'nome', nome, 'canal', canal, 'parceiro', parceiro, 'inscritos', n, 'aguardando', a) order by n desc)
        from (select p.link, k.nome, p.canal, p.parceiro, count(*) n, count(*) filter (where p.situacao = 'aguardando') a
                from pessoa p left join public.rastreio_links k on k.marca = p_marca and k.codigo = p.link
               group by p.link, k.nome, p.canal, p.parceiro) s), '[]'::jsonb),
    'pessoas', coalesce((select jsonb_agg(jsonb_build_object('nome', p.nome, 'email', p.email, 'telefone', p.telefone, 'parceiro', p.parceiro,
        'situacao', p.situacao, 'entrou', p.tem_conta, 'email_enviado', p.email_cadastro_em is not null, 'canal', p.canal, 'link', p.link,
        'link_nome', k.nome, 'campanha', p.campanha, 'conteudo', p.conteudo, 'quando', p.ultima_inscricao_em) order by p.ultima_inscricao_em desc)
        from pessoa p left join public.rastreio_links k on k.marca = p_marca and k.codigo = p.link), '[]'::jsonb)
  );
$function$;
revoke all on function public.teeds_superlive_painel(text) from public, anon;
grant execute on function public.teeds_superlive_painel(text) to authenticated;
