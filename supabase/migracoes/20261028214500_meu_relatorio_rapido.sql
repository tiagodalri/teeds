-- Relatórios do cliente (28/10/2026): o filtro de data era só pela data local
-- ("(executada_em at time zone fuso)::date between de e ate"), que não usa
-- índice: cada abertura lia TODAS as operações da pessoa (49 mil numa conta
-- de teste). Agora vai junto um corte por instante (com 1 dia de folga para
-- qualquer fuso), que usa o índice (user_id, marca, executada_em). A regra
-- original continua valendo: o resultado é o mesmo.
create or replace function public.teeds_meu_relatorio(p_marca text, p_de date, p_ate date, p_fuso text default 'America/Sao_Paulo', p_demo boolean default false, p_conta text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $f$
declare
  eu uuid := auth.uid();
  v jsonb;
  inicio_mes date := (date_trunc('month', now() at time zone p_fuso))::date;
  v_de timestamptz := p_de::timestamp at time zone 'UTC' - interval '1 day';
  v_ate timestamptz := (p_ate + 1)::timestamp at time zone 'UTC' + interval '1 day';
  v_mes timestamptz := inicio_mes::timestamp at time zone 'UTC' - interval '1 day';
begin
  if eu is null then raise exception 'Entre na sua conta.'; end if;
  with ops as (
    select 'ia'::text as origem, coalesce(o.robo_id, '') as origem_id, coalesce(nullif(o.robo_nome, ''), o.robo_id, 'I.A.') as origem_nome,
           o.ativo, o.tipo_contrato, o.entrada, o.pagamento, o.resultado, coalesce(o.ganhou, o.resultado > 0) as ganhou,
           o.executada_em as quando, o.conta_id
    from operacoes_robos o
    where o.user_id = eu and o.marca = p_marca and o.demo = p_demo and (p_conta is null or o.conta_id = p_conta)
      and o.executada_em >= v_de and o.executada_em < v_ate
      and (o.executada_em at time zone p_fuso)::date between p_de and p_ate
    union all
    select 'manual', 'manual', 'Manual', m.ativo, m.tipo_contrato, m.entrada, m.pagamento, m.resultado, m.resultado > 0,
           m.comprada_em, m.conta_id
    from operacoes_manuais m
    where m.user_id = eu and m.marca = p_marca and m.demo = p_demo and m.situacao <> 'aberta' and (p_conta is null or m.conta_id = p_conta)
      and m.comprada_em >= v_de and m.comprada_em < v_ate
      and (m.comprada_em at time zone p_fuso)::date between p_de and p_ate
  ),
  mes as (
    select coalesce(sum(o.resultado), 0) r, count(*) n from operacoes_robos o
    where o.user_id = eu and o.marca = p_marca and not o.demo and o.executada_em >= v_mes and (o.executada_em at time zone p_fuso)::date >= inicio_mes
    union all
    select coalesce(sum(m.resultado), 0), count(*) from operacoes_manuais m
    where m.user_id = eu and m.marca = p_marca and not m.demo and m.situacao <> 'aberta' and m.comprada_em >= v_mes and (m.comprada_em at time zone p_fuso)::date >= inicio_mes
  )
  select jsonb_build_object(
    'total', (select jsonb_build_object(
        'operacoes', count(*), 'ganhas', count(*) filter (where ganhou),
        'entradas', coalesce(sum(entrada), 0), 'pagamentos', coalesce(sum(pagamento), 0),
        'resultado', coalesce(sum(resultado), 0),
        'maior_ganho', coalesce(max(resultado) filter (where resultado > 0), 0),
        'maior_perda', coalesce(min(resultado) filter (where resultado < 0), 0),
        'primeira', min(quando), 'ultima', max(quando)) from ops),
    'por_dia', (select coalesce(jsonb_agg(d order by d->>'dia'), '[]') from (
        select jsonb_build_object('dia', (quando at time zone p_fuso)::date, 'operacoes', count(*), 'ganhas', count(*) filter (where ganhou),
          'entradas', sum(entrada), 'resultado', sum(resultado)) d
        from ops group by (quando at time zone p_fuso)::date) x),
    'por_origem', (select coalesce(jsonb_agg(d order by (d->>'operacoes')::int desc), '[]') from (
        select jsonb_build_object('origem', origem, 'id', origem_id, 'nome', max(origem_nome), 'operacoes', count(*),
          'ganhas', count(*) filter (where ganhou), 'entradas', sum(entrada), 'resultado', sum(resultado)) d
        from ops group by origem, origem_id) x),
    'por_ativo', (select coalesce(jsonb_agg(d order by (d->>'operacoes')::int desc), '[]') from (
        select jsonb_build_object('ativo', coalesce(ativo, ''), 'operacoes', count(*), 'ganhas', count(*) filter (where ganhou),
          'resultado', sum(resultado)) d
        from ops group by ativo) x),
    'por_hora', (select coalesce(jsonb_agg(d order by (d->>'hora')::int), '[]') from (
        select jsonb_build_object('hora', extract(hour from quando at time zone p_fuso)::int, 'operacoes', count(*),
          'ganhas', count(*) filter (where ganhou), 'resultado', sum(resultado)) d
        from ops group by extract(hour from quando at time zone p_fuso)) x),
    'ultimas', (select coalesce(jsonb_agg(d order by d->>'quando' desc), '[]') from (
        select jsonb_build_object('quando', quando, 'origem', origem, 'id', origem_id, 'nome', origem_nome, 'ativo', ativo, 'tipo', tipo_contrato,
          'entrada', entrada, 'pagamento', pagamento, 'resultado', resultado, 'ganhou', ganhou) d
        from ops order by quando desc limit 80) x),
    'contas', (select coalesce(jsonb_agg(distinct jsonb_build_object('conta', conta_id, 'demo', demo)), '[]') from (
        select conta_id, demo from operacoes_robos where user_id = eu and marca = p_marca
        union select conta_id, demo from operacoes_manuais where user_id = eu and marca = p_marca) c),
    'mes', (select jsonb_build_object('inicio', inicio_mes, 'resultado', coalesce(sum(r), 0), 'operacoes', coalesce(sum(n), 0)) from mes)
  ) into v;
  return v;
end $f$;
