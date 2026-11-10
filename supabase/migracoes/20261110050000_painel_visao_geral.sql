-- 10/11/2026 (Tiago: "esse dash da visão geral está MUITO CRU... quero um dash foda, imersivo, com métricas
-- impactantes"). Tudo o que a Visão geral mostra, numa leitura só: quem está operando AGORA em conta real (e a
-- banca somada dessas pessoas), demo à parte, quem está na plataforma, o dinheiro nas contas reais (total,
-- faixas, maiores bancas), o markup (hoje, 7 e 30 dias, mês, série diária), as operações de hoje, o funil da
-- base e o dinheiro que entrou e saiu. Só a administração; o admin do parceiro vê só os clientes dele.
-- A equipe (administradores) fica de fora de todos os números.
create or replace function public.teeds_painel_visao_geral(p_marca text, p_parceiro text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_par text;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ini_hoje timestamptz := (v_hoje::timestamp at time zone 'America/Sao_Paulo');
  v_ini_mes date := date_trunc('month', v_hoje)::date;
  r jsonb;
begin
  if not public.teeds_admin_pleno_da(p_marca) then raise exception 'Só a administração vê o painel'; end if;
  v_par := nullif(trim(coalesce(public.teeds_parceiro_forcado(p_marca), p_parceiro, '')), '');

  with cli as (
    select c.* from public.clientes c
     where c.marca = p_marca
       and not exists (select 1 from public.administradores a where a.user_id = c.user_id)
       and (v_par is null or (v_par = 'direto' and c.parceiro is null) or c.parceiro = v_par)
  ),
  contas as (
    select k.user_id, k.conta_id, k.saldo, k.moeda from public.contas_deriv k join cli on cli.user_id = k.user_id
     where k.marca = p_marca and k.tipo = 'real'
  ),
  banca as (select user_id, sum(coalesce(saldo, 0)) as saldo from contas group by user_id),
  ses as (
    select s.user_id, s.demo, s.id from public.sessoes_robos s join cli on cli.user_id = s.user_id
     where s.marca = p_marca and s.situacao = 'rodando'
  ),
  man as (
    select m.user_id, m.demo from public.operacoes_manuais m join cli on cli.user_id = m.user_id
     where m.marca = p_marca and m.situacao = 'aberta' and coalesce(m.expira_em, m.criado_em + interval '1 hour') > now()
  ),
  op_real as (select user_id from ses where not demo union select user_id from man where not demo),
  op_demo as (select user_id from ses where demo union select user_id from man where demo except select user_id from op_real),
  com as (
    select d.dia, sum(d.comissao) as markup, sum(d.operacoes) as operacoes, sum(d.entradas) as entradas, sum(d.resultado) as resultado
      from public.comissoes_diarias d join cli on cli.user_id = d.user_id
     where d.marca = p_marca and not d.demo and d.dia > v_hoje - 30
     group by d.dia
  ),
  mov as (
    select v.tipo, v.valor, v.ocorrida_em from public.movimentacoes_deriv v join cli on cli.user_id = v.user_id
     where v.marca = p_marca and not v.demo and v.ocorrida_em > now() - interval '30 days'
  ),
  faixas as (
    select f.ordem, f.rotulo, count(b.user_id) as clientes, coalesce(sum(b.saldo), 0) as soma
      from (values (1, 'Até US$ 50', 0.01, 50), (2, 'US$ 50 a 200', 50, 200), (3, 'US$ 200 a 1 mil', 200, 1000),
                   (4, 'US$ 1 mil a 5 mil', 1000, 5000), (5, 'Mais de US$ 5 mil', 5000, 1e12)) f(ordem, rotulo, de, ate)
      left join banca b on b.saldo >= f.de and b.saldo < f.ate
     group by f.ordem, f.rotulo
  )
  select jsonb_build_object(
    'agora', jsonb_build_object(
      'na_plataforma', (select count(*) from cli where visto_em >= now() - interval '3 minutes'),
      'operando_real', (select count(*) from op_real),
      'operando_demo', (select count(*) from op_demo),
      'banca_operando_real', (select coalesce(sum(b.saldo), 0) from banca b where b.user_id in (select user_id from op_real)),
      'ias_real', (select count(*) from ses where not demo),
      'ias_demo', (select count(*) from ses where demo),
      'manuais_real', (select count(*) from man where not demo)
    ),
    'banca', jsonb_build_object(
      'total', (select coalesce(sum(saldo), 0) from banca),
      'clientes_com_saldo', (select count(*) from banca where saldo > 0),
      'contas_reais', (select count(*) from contas),
      'maior', (select coalesce(max(saldo), 0) from banca),
      'faixas', (select coalesce(jsonb_agg(jsonb_build_object('rotulo', rotulo, 'clientes', clientes, 'soma', soma) order by ordem), '[]'::jsonb) from faixas),
      'top', (select coalesce(jsonb_agg(t order by t.saldo desc), '[]'::jsonb) from (
                select b.user_id, cli.nome, cli.foto_url, cli.parceiro, b.saldo,
                       b.user_id in (select user_id from op_real) as operando,
                       cli.visto_em >= now() - interval '3 minutes' as online
                  from banca b join cli on cli.user_id = b.user_id where b.saldo > 0 order by b.saldo desc limit 5) t)
    ),
    'markup', jsonb_build_object(
      'hoje', (select coalesce(sum(markup), 0) from com where dia = v_hoje),
      'd7', (select coalesce(sum(markup), 0) from com where dia > v_hoje - 7),
      'd30', (select coalesce(sum(markup), 0) from com),
      'mes', (select coalesce(sum(markup), 0) from com where dia >= v_ini_mes),
      'serie', (select coalesce(jsonb_agg(jsonb_build_object('dia', g.dia, 'markup', coalesce(c.markup, 0), 'operacoes', coalesce(c.operacoes, 0)) order by g.dia), '[]'::jsonb)
                  from generate_series(v_hoje - 29, v_hoje, interval '1 day') g(dia) left join com c on c.dia = g.dia::date)
    ),
    'hoje', jsonb_build_object(
      'operacoes', (select coalesce(sum(operacoes), 0) from com where dia = v_hoje),
      'volume', (select coalesce(sum(entradas), 0) from com where dia = v_hoje),
      'resultado', (select coalesce(sum(resultado), 0) from com where dia = v_hoje),
      'operaram', (select count(distinct d.user_id) from public.comissoes_diarias d join cli on cli.user_id = d.user_id
                    where d.marca = p_marca and not d.demo and d.dia = v_hoje and d.operacoes > 0)
    ),
    'funil', jsonb_build_object(
      'cadastrados', (select count(*) from cli),
      'ativos', (select count(*) from cli where status_acesso = 'ativo'),
      'conectaram', (select count(distinct k.user_id) from public.contas_deriv k join cli on cli.user_id = k.user_id where k.marca = p_marca),
      'conta_real', (select count(distinct user_id) from contas),
      'com_saldo', (select count(*) from banca where saldo > 0),
      'operaram_real', (select count(distinct d.user_id) from public.comissoes_diarias d join cli on cli.user_id = d.user_id
                         where d.marca = p_marca and not d.demo and d.dia > v_hoje - 30 and d.operacoes > 0),
      'ativos_24h', (select count(*) from cli where visto_em > now() - interval '24 hours')
    ),
    'dinheiro', jsonb_build_object(
      'depositos_7d', (select coalesce(sum(abs(valor)), 0) from mov where tipo = 'deposit' and ocorrida_em > now() - interval '7 days'),
      'saques_7d', (select coalesce(sum(abs(valor)), 0) from mov where tipo = 'withdrawal' and ocorrida_em > now() - interval '7 days'),
      'depositos_30d', (select coalesce(sum(abs(valor)), 0) from mov where tipo = 'deposit'),
      'saques_30d', (select coalesce(sum(abs(valor)), 0) from mov where tipo = 'withdrawal'),
      'depositantes_30d', (select count(distinct v.user_id) from public.movimentacoes_deriv v join cli on cli.user_id = v.user_id
                            where v.marca = p_marca and not v.demo and v.tipo = 'deposit' and v.ocorrida_em > now() - interval '30 days')
    ),
    'alertas', jsonb_build_object(
      'expirados', (select count(*) from cli where status_acesso = 'expirado'),
      'vencem_7d', (select count(*) from cli where status_acesso = 'ativo' and acesso_expira_em between now() and now() + interval '7 days')
    ),
    'lido_em', now()
  ) into r;
  return r;
end $$;
revoke all on function public.teeds_painel_visao_geral(text, text) from public, anon;
grant execute on function public.teeds_painel_visao_geral(text, text) to authenticated;
