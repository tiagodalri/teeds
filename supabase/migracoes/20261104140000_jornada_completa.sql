-- Jornada completa (04/11/2026, Tiago: "fulano assistiu o anúncio, clicou, foi marcado pelo pixel, se
-- cadastrou, assistiu a live, efetivou acesso, abriu conta na Deriv, depositou (quando e quanto? primeiro
-- depósito?), gerou markup (quanto)... comunidade, app, e-mail... me surpreenda").
--
-- Uma linha por cadastro do período, com tudo o que a pessoa fez depois: de onde veio (o canal do momento
-- do cadastro, da Central de rastreio), questionário, comunidade, app, notificações, e-mails do lançamento,
-- conta na plataforma, acessos, live, conta real na Deriv, depósitos (primeiro, total, saques), I.A. e
-- operações reais e o markup estimado (comissoes_diarias), tudo só depois do cadastro e só em dólar. A tela soma por anúncio,
-- por canal e no total. Só o administrador geral.
create or replace function public.teeds_jornada_completa(p_marca text, p_parceiro text, p_de date, p_ate date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_par text := nullif(trim(coalesce(p_parceiro, '')), '');
begin
  if not public.teeds_admin_geral_da(p_marca) then raise exception 'Só o administrador geral vê a jornada'; end if;
  return (with jl as (
    -- o parceiro do lead: o gravado; sem ele, o do endereço (nunca os dois: um lead não entra no /n e no /v)
    select l.id, coalesce(l.inscricao_recebida_em, l.convertido_em) as cad from public.leads_capturados l
     where l.marca = p_marca
       and (v_par is null or coalesce(l.parceiro, case when l.pagina ilike '%/n/%' then 'n' when l.pagina ilike '%/v/%' then 'v' end) = v_par)
       and coalesce(l.inscricao_recebida_em, l.convertido_em) >= (p_de::timestamp at time zone 'America/Sao_Paulo')
       and coalesce(l.inscricao_recebida_em, l.convertido_em) < ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
  )
  select jsonb_build_object('total', (select count(*) from jl), 'pessoas', (select coalesce(jsonb_agg(p order by p.cadastro_em desc), '[]'::jsonb) from (
    select l.id, l.nome, l.email, l.telefone, jl.cad as cadastro_em,
           l.questionario_em, l.ex_cliente, l.parceiro,
           coalesce(ce.canal, rv.u_canal, public.rastreio_canal_do_lead(l.origem, l.meio, l.pagina)) as canal,
           case when ce.canal is not null then ce.conteudo
                when rv.visitante is not null then rv.u_conteudo
                when public.rastreio_canal_do_lead(l.origem, l.meio, l.pagina) = 'anuncio-meta' then l.conteudo end as anuncio,
           case when ce.canal is not null then ce.link when rv.visitante is not null then rv.u_link end as link,
           rv.visitante, rv.dispositivo, rv.navegador, rv.visitas, rv.primeira_em as chegou_em,
           ev.comunidade, ev.app, ev.plataforma, ev.agenda, ev.segundos_na_pagina,
           exists (select 1 from public.lancamento_push p where p.marca = p_marca and lower(p.email) = l.email_normalizado) as notificacoes,
           (select count(*) from public.lancamento_emails m where m.marca = p_marca and m.email = l.email_normalizado) as emails,
           c.user_id is not null as tem_conta, c.criado_em as conta_em, c.status_acesso, c.categoria,
           -- já tinha conta antes deste cadastro (recadastro): o que fez antes não conta para este cadastro
           (c.criado_em is not null and c.criado_em < jl.cad - interval '1 day') as cliente_antes,
           coalesce(c.total_acessos, 0) as acessos, coalesce(c.tempo_total_segundos, 0) as segundos_na_plataforma, c.visto_em,
           (select min(a.dia) from public.acessos_diarios a where a.marca = p_marca and a.user_id = c.user_id and a.dia >= (jl.cad at time zone 'America/Sao_Paulo')::date) as primeiro_acesso,
           (select count(*) from public.lancamento_presencas pr where pr.marca = p_marca and pr.user_id = c.user_id) as minutos_live,
           dr.conectada_em as deriv_real_em, dr.saldo as saldo_real, dd.conectada_em as deriv_demo_em,
           dep.primeiro_em as deposito1_em, dep.primeiro_valor as deposito1_valor, coalesce(dep.total, 0) as depositado,
           coalesce(dep.n, 0) as depositos, coalesce(saq.total, 0) as sacado,
           coalesce(ses.total, 0) as sessoes_ia, coalesce(ses.reais, 0) as sessoes_ia_reais,
           coalesce(opr.n, 0) + coalesce(opm.n, 0) as operacoes_reais,
           coalesce(opr.resultado, 0) + coalesce(opm.resultado, 0) as resultado_real,
           -- markup ESTIMADO pelo servidor (comissoes_diarias: 3% do pagamento das contas reais), desde o cadastro
           coalesce(com.markup, 0) as markup
      from jl
      join public.leads_capturados l on l.id = jl.id
      left join lateral (select v.* from public.rastreio_visitantes v where v.marca = p_marca and v.lead_id = l.id order by v.primeira_em limit 1) rv on true
      left join lateral (select e.canal, e.conteudo, e.link from public.rastreio_eventos e
                          where rv.visitante is not null and e.marca = p_marca and e.visitante = rv.visitante and e.evento = 'cadastro' order by e.id limit 1) ce on true
      left join lateral (select bool_or(e.evento = 'comunidade') as comunidade, bool_or(e.evento = 'baixou-app') as app,
                                bool_or(e.evento = 'plataforma') as plataforma, bool_or(e.evento = 'agenda') as agenda,
                                -- o detalhe vem da página pública: só número entra na conta
                                max(case when e.evento = 'saiu' and e.detalhe->>'segundos' ~ '^\d{1,7}(\.\d+)?$' then (e.detalhe->>'segundos')::numeric end) as segundos_na_pagina
                           from public.rastreio_eventos e
                          where e.marca = p_marca and e.visitante in (select v.visitante from public.rastreio_visitantes v where v.marca = p_marca and (v.lead_id = l.id or v.email_normalizado = l.email_normalizado))) ev on true
      left join lateral (select c.* from public.clientes c where c.marca = p_marca and lower(c.email) = l.email_normalizado order by c.criado_em limit 1) c on true
      left join lateral (select min(d.conectada_em) as conectada_em, sum(d.saldo) filter (where coalesce(d.moeda, 'USD') = 'USD') as saldo from public.contas_deriv d where d.marca = p_marca and d.user_id = c.user_id and d.tipo = 'real' having count(*) > 0) dr on true
      left join lateral (select min(d.conectada_em) as conectada_em from public.contas_deriv d where d.marca = p_marca and d.user_id = c.user_id and d.tipo = 'demo' having count(*) > 0) dd on true
      -- dinheiro: só em dólar e só depois do cadastro (recadastro de ex-cliente não traz o histórico junto)
      left join lateral (select min(m.ocorrida_em) as primeiro_em, (array_agg(m.valor order by m.ocorrida_em))[1] as primeiro_valor, sum(m.valor) as total, count(*) as n
                           from public.movimentacoes_deriv m where m.marca = p_marca and m.user_id = c.user_id and not m.demo and m.tipo = 'deposit' and coalesce(m.moeda, 'USD') = 'USD' and m.ocorrida_em >= jl.cad having count(*) > 0) dep on true
      left join lateral (select sum(abs(m.valor)) as total from public.movimentacoes_deriv m where m.marca = p_marca and m.user_id = c.user_id and not m.demo and m.tipo = 'withdrawal' and coalesce(m.moeda, 'USD') = 'USD' and m.ocorrida_em >= jl.cad) saq on true
      left join lateral (select count(*) as total, count(*) filter (where not s.demo) as reais from public.sessoes_robos s where s.marca = p_marca and s.user_id = c.user_id and s.criada_em >= jl.cad) ses on true
      left join lateral (select count(*) as n, sum(o.resultado) as resultado from public.operacoes_robos o where o.marca = p_marca and o.user_id = c.user_id and not o.demo and coalesce(o.moeda, 'USD') = 'USD' and o.executada_em >= jl.cad) opr on true
      left join lateral (select count(*) as n, sum(o.resultado) as resultado from public.operacoes_manuais o where o.marca = p_marca and o.user_id = c.user_id and not o.demo and coalesce(o.moeda, 'USD') = 'USD' and o.comprada_em >= jl.cad) opm on true
      left join lateral (select sum(k.comissao) as markup from public.comissoes_diarias k where k.marca = p_marca and k.user_id = c.user_id and not k.demo and coalesce(k.moeda, 'USD') = 'USD' and k.dia >= (jl.cad at time zone 'America/Sao_Paulo')::date having count(*) > 0) com on true
     order by jl.cad desc
     limit 3000) p)));
end $$;
revoke all on function public.teeds_jornada_completa(text, text, date, date) from public, anon;
grant execute on function public.teeds_jornada_completa(text, text, date, date) to authenticated;
-- os cruzamentos por e-mail (um por cadastro) com índice
create index if not exists clientes_marca_email_minusculo on public.clientes (marca, lower(email));
create index if not exists lancamento_push_marca_email_minusculo on public.lancamento_push (marca, lower(email));
