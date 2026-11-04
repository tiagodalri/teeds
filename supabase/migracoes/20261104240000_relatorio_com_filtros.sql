-- 04/11/2026 (Tiago): "precisa ser um painel bem inteligente... filtrar hoje, ontem, intervalos personalizados,
-- só ganhadoras, só perdedoras, robôs específicos... tanto eu como os clientes".
-- teeds_meu_relatorio_v2: o mesmo relatório (sempre do próprio usuário), com filtros e métricas a mais:
--   p_filtros = { resultado: 'ganhas'|'perdidas', estrategias: [ids], ativos: [..], tipos: [..],
--                 dias: [0..6 (domingo=0)], hora_de, hora_ate (0..23, pode virar a noite), entrada_min, entrada_max }
-- Devolve também: o período anterior de mesmo tamanho (com os mesmos filtros), as sequências de ganhos e de
-- perdas, a maior queda do acumulado, por dia da semana e por tipo de contrato, e as opções de filtro do período.
create or replace function public.teeds_meu_relatorio_v2(
  p_marca text, p_de date, p_ate date, p_fuso text default 'America/Sao_Paulo', p_demo boolean default false,
  p_filtros jsonb default '{}'::jsonb, p_limite int default 300)
returns jsonb language plpgsql stable security definer set search_path = public as $function$
declare
  eu uuid := auth.uid();
  v jsonb;
  f jsonb := coalesce(p_filtros, '{}'::jsonb);
  f_res text := nullif(f->>'resultado', '');
  f_est text[] := case when jsonb_typeof(f->'estrategias') = 'array' and jsonb_array_length(f->'estrategias') > 0 then array(select jsonb_array_elements_text(f->'estrategias')) end;
  f_atv text[] := case when jsonb_typeof(f->'ativos') = 'array' and jsonb_array_length(f->'ativos') > 0 then array(select jsonb_array_elements_text(f->'ativos')) end;
  f_tip text[] := case when jsonb_typeof(f->'tipos') = 'array' and jsonb_array_length(f->'tipos') > 0 then array(select jsonb_array_elements_text(f->'tipos')) end;
  f_dias int[] := case when jsonb_typeof(f->'dias') = 'array' and jsonb_array_length(f->'dias') > 0 then array(select (jsonb_array_elements_text(f->'dias'))::int) end;
  f_hde int := nullif(f->>'hora_de', '')::int;
  f_hate int := nullif(f->>'hora_ate', '')::int;
  f_emin numeric := nullif(f->>'entrada_min', '')::numeric;
  f_emax numeric := nullif(f->>'entrada_max', '')::numeric;
  v_len int := greatest(1, p_ate - p_de + 1);
  a_de date := p_de - greatest(1, p_ate - p_de + 1);
  a_ate date := p_de - 1;
  inicio_mes date := (date_trunc('month', now() at time zone p_fuso))::date;
  v_desde timestamptz := (p_de - greatest(1, p_ate - p_de + 1))::timestamp at time zone 'UTC' - interval '1 day';
  v_ate timestamptz := (p_ate + 1)::timestamp at time zone 'UTC' + interval '1 day';
  v_mes timestamptz := inicio_mes::timestamp at time zone 'UTC' - interval '1 day';
  v_lim int := least(greatest(coalesce(p_limite, 300), 1), 1000);
begin
  if eu is null then raise exception 'Entre na sua conta.'; end if;
  if p_ate < p_de then raise exception 'A data final vem antes da inicial.'; end if;
  if p_ate - p_de > 400 then raise exception 'Escolha um período de até 400 dias.'; end if;
  with base as (
    select 'ia'::text as origem, coalesce(o.robo_id, '') as origem_id, coalesce(nullif(o.robo_nome, ''), o.robo_id, 'I.A.') as origem_nome,
           coalesce(o.ativo, '') as ativo, coalesce(o.tipo_contrato, '') as tipo, o.entrada, o.pagamento, o.resultado,
           coalesce(o.ganhou, o.resultado > 0) as ganhou, o.executada_em as quando
    from operacoes_robos o
    where o.user_id = eu and o.marca = p_marca and o.demo = p_demo and o.executada_em >= v_desde and o.executada_em < v_ate
    union all
    select 'manual', 'manual', 'Manual', coalesce(m.ativo, ''), coalesce(m.tipo_contrato, ''), m.entrada, m.pagamento, m.resultado,
           m.resultado > 0, m.comprada_em
    from operacoes_manuais m
    where m.user_id = eu and m.marca = p_marca and m.demo = p_demo and m.situacao <> 'aberta' and m.comprada_em >= v_desde and m.comprada_em < v_ate
  ),
  todas as (
    select b.*, (b.quando at time zone p_fuso) as local, (b.quando at time zone p_fuso)::date as dia,
           extract(hour from b.quando at time zone p_fuso)::int as hora, extract(dow from b.quando at time zone p_fuso)::int as dow
    from base b where (b.quando at time zone p_fuso)::date between a_de and p_ate
  ),
  filtradas as (
    select * from todas t where
      (f_res is null or (f_res = 'ganhas' and t.ganhou) or (f_res = 'perdidas' and not t.ganhou))
      and (f_est is null or t.origem_id = any(f_est))
      and (f_atv is null or t.ativo = any(f_atv))
      and (f_tip is null or t.tipo = any(f_tip))
      and (f_dias is null or t.dow = any(f_dias))
      and (f_hde is null or f_hate is null
           or (f_hde <= f_hate and t.hora between f_hde and f_hate)
           or (f_hde > f_hate and (t.hora >= f_hde or t.hora <= f_hate)))
      and (f_hde is null or f_hate is not null or t.hora >= f_hde)
      and (f_hate is null or f_hde is not null or t.hora <= f_hate)
      and (f_emin is null or t.entrada >= f_emin)
      and (f_emax is null or t.entrada <= f_emax)
  ),
  ops as (select * from filtradas where dia between p_de and p_ate),
  ant as (select * from filtradas where dia between a_de and a_ate),
  periodo as (select * from todas where dia between p_de and p_ate),
  seq as (select ganhou, row_number() over (order by quando) - row_number() over (partition by ganhou order by quando) g from ops),
  rachas as (select ganhou, count(*) n from seq group by ganhou, g),
  cum as (select quando, sum(resultado) over (order by quando rows between unbounded preceding and current row) acc from ops),
  quedas as (select acc, greatest(0, max(acc) over (order by quando rows between unbounded preceding and current row)) - acc as queda from cum),
  mes as (
    select coalesce(sum(o.resultado), 0) r, count(*) n from operacoes_robos o
    where o.user_id = eu and o.marca = p_marca and not o.demo and o.executada_em >= v_mes and (o.executada_em at time zone p_fuso)::date >= inicio_mes
    union all
    select coalesce(sum(m.resultado), 0), count(*) from operacoes_manuais m
    where m.user_id = eu and m.marca = p_marca and not m.demo and m.situacao <> 'aberta' and m.comprada_em >= v_mes and (m.comprada_em at time zone p_fuso)::date >= inicio_mes
  )
  select jsonb_build_object(
    'de', p_de, 'ate', p_ate,
    'total', (select jsonb_build_object(
        'operacoes', count(*), 'ganhas', count(*) filter (where ganhou),
        'entradas', coalesce(sum(entrada), 0), 'pagamentos', coalesce(sum(pagamento), 0),
        'resultado', coalesce(sum(resultado), 0),
        'soma_ganhos', coalesce(sum(resultado) filter (where resultado > 0), 0),
        'soma_perdas', coalesce(sum(resultado) filter (where resultado < 0), 0),
        'maior_ganho', coalesce(max(resultado) filter (where resultado > 0), 0),
        'maior_perda', coalesce(min(resultado) filter (where resultado < 0), 0),
        'primeira', min(quando), 'ultima', max(quando)) from ops),
    'anterior', (select jsonb_build_object('de', a_de, 'ate', a_ate, 'operacoes', count(*), 'ganhas', count(*) filter (where ganhou),
        'entradas', coalesce(sum(entrada), 0), 'resultado', coalesce(sum(resultado), 0)) from ant),
    'sequencias', (select jsonb_build_object('ganhos', coalesce(max(n) filter (where ganhou), 0), 'perdas', coalesce(max(n) filter (where not ganhou), 0)) from rachas),
    'queda', (select jsonb_build_object('maior', coalesce(max(queda), 0), 'pico', greatest(0, coalesce(max(acc), 0))) from quedas),
    'por_dia', (select coalesce(jsonb_agg(d order by d->>'dia'), '[]') from (
        select jsonb_build_object('dia', dia, 'operacoes', count(*), 'ganhas', count(*) filter (where ganhou),
          'entradas', sum(entrada), 'resultado', sum(resultado)) d from ops group by dia) x),
    'por_origem', (select coalesce(jsonb_agg(d order by (d->>'operacoes')::int desc), '[]') from (
        select jsonb_build_object('origem', origem, 'id', origem_id, 'nome', max(origem_nome), 'operacoes', count(*),
          'ganhas', count(*) filter (where ganhou), 'entradas', sum(entrada), 'resultado', sum(resultado)) d
        from ops group by origem, origem_id) x),
    'por_ativo', (select coalesce(jsonb_agg(d order by (d->>'operacoes')::int desc), '[]') from (
        select jsonb_build_object('ativo', ativo, 'operacoes', count(*), 'ganhas', count(*) filter (where ganhou),
          'entradas', sum(entrada), 'resultado', sum(resultado)) d from ops group by ativo) x),
    'por_tipo', (select coalesce(jsonb_agg(d order by (d->>'operacoes')::int desc), '[]') from (
        select jsonb_build_object('tipo', tipo, 'operacoes', count(*), 'ganhas', count(*) filter (where ganhou),
          'resultado', sum(resultado)) d from ops group by tipo) x),
    'por_hora', (select coalesce(jsonb_agg(d order by (d->>'hora')::int), '[]') from (
        select jsonb_build_object('hora', hora, 'operacoes', count(*), 'ganhas', count(*) filter (where ganhou),
          'resultado', sum(resultado)) d from ops group by hora) x),
    'por_dia_semana', (select coalesce(jsonb_agg(d order by (d->>'dow')::int), '[]') from (
        select jsonb_build_object('dow', dow, 'operacoes', count(*), 'ganhas', count(*) filter (where ganhou),
          'resultado', sum(resultado)) d from ops group by dow) x),
    'contagem', (select count(*) from ops),
    'ultimas', (select coalesce(jsonb_agg(d order by d->>'quando' desc), '[]') from (
        select jsonb_build_object('quando', quando, 'origem', origem, 'id', origem_id, 'nome', origem_nome, 'ativo', ativo, 'tipo', tipo,
          'entrada', entrada, 'pagamento', pagamento, 'resultado', resultado, 'ganhou', ganhou) d
        from ops order by quando desc limit v_lim) x),
    'opcoes', jsonb_build_object(
        'estrategias', (select coalesce(jsonb_agg(d order by (d->>'operacoes')::int desc), '[]') from (
            select jsonb_build_object('id', origem_id, 'origem', origem, 'nome', max(origem_nome), 'operacoes', count(*)) d from periodo group by origem, origem_id) x),
        'ativos', (select coalesce(jsonb_agg(d order by (d->>'operacoes')::int desc), '[]') from (
            select jsonb_build_object('id', ativo, 'operacoes', count(*)) d from periodo group by ativo) x),
        'tipos', (select coalesce(jsonb_agg(d order by (d->>'operacoes')::int desc), '[]') from (
            select jsonb_build_object('id', tipo, 'operacoes', count(*)) d from periodo group by tipo) x),
        'entrada_max', (select coalesce(max(entrada), 0) from periodo)),
    'mes', (select jsonb_build_object('inicio', inicio_mes, 'resultado', coalesce(sum(r), 0), 'operacoes', coalesce(sum(n), 0)) from mes)
  ) into v;
  return v;
end $function$;
revoke all on function public.teeds_meu_relatorio_v2(text, date, date, text, boolean, jsonb, int) from public;
grant execute on function public.teeds_meu_relatorio_v2(text, date, date, text, boolean, jsonb, int) to authenticated;
