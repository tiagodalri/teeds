-- Os insights também passam a responder pelas marcas em foco.
create or replace function public.teeds_insights_resumo(p_marca text default 'teeds', p_dias integer default 30)
returns json language sql stable set search_path to 'public' as $$
  select case when coalesce(array_length(public.teeds_marcas_em_foco(p_marca), 1), 0) = 0 then null else json_build_object(
    'clientes', (select count(*) from public.clientes where marca = any(public.teeds_marcas_em_foco(p_marca))),
    'novos', (select count(*) from public.clientes where marca = any(public.teeds_marcas_em_foco(p_marca)) and criado_em >= now() - make_interval(days => p_dias)),
    'ativos', (select count(distinct user_id) from public.acessos_diarios where marca = any(public.teeds_marcas_em_foco(p_marca)) and dia >= current_date - p_dias),
    'ativos_hoje', (select count(distinct user_id) from public.acessos_diarios where marca = any(public.teeds_marcas_em_foco(p_marca)) and dia = current_date),
    'acessos', (select coalesce(sum(acessos),0) from public.acessos_diarios where marca = any(public.teeds_marcas_em_foco(p_marca)) and dia >= current_date - p_dias),
    'segundos', (select coalesce(sum(segundos),0) from public.acessos_diarios where marca = any(public.teeds_marcas_em_foco(p_marca)) and dia >= current_date - p_dias),
    'aulas_pessoas', (select count(distinct user_id) from public.aulas_progresso where marca = any(public.teeds_marcas_em_foco(p_marca)) and ultima_vez >= now() - make_interval(days => p_dias)),
    'aulas_segundos', (select coalesce(sum(segundos),0) from public.aulas_progresso where marca = any(public.teeds_marcas_em_foco(p_marca)) and ultima_vez >= now() - make_interval(days => p_dias)),
    'aulas_concluidas', (select count(*) from public.aulas_progresso where marca = any(public.teeds_marcas_em_foco(p_marca)) and concluida and ultima_vez >= now() - make_interval(days => p_dias)),
    'com_deriv', (select count(distinct user_id) from public.contas_deriv where marca = any(public.teeds_marcas_em_foco(p_marca)))
  ) end;
$$;

create or replace function public.teeds_insights_acessos_dia(p_marca text default 'teeds', p_dias integer default 30)
returns table(dia date, pessoas bigint, acessos bigint, segundos bigint)
language sql stable set search_path to 'public' as $$
  select d.dia, count(distinct a.user_id), coalesce(sum(a.acessos),0), coalesce(sum(a.segundos),0)
  from generate_series(current_date - (p_dias - 1), current_date, '1 day') as d(dia)
  left join public.acessos_diarios a on a.marca = any(public.teeds_marcas_em_foco(p_marca)) and a.dia = d.dia
  group by d.dia order by d.dia;
$$;

create or replace function public.teeds_insights_alunos(p_marca text default 'teeds', p_limite integer default 30)
returns table(user_id uuid, nome text, email text, aulas_vistas bigint, aulas_concluidas bigint,
              segundos bigint, ultima_vez timestamptz)
language sql stable set search_path to 'public' as $$
  select p.user_id, c.nome, c.email, count(*), count(*) filter (where p.concluida), sum(p.segundos), max(p.ultima_vez)
  from public.aulas_progresso p join public.clientes c on c.user_id = p.user_id and c.marca = p.marca
  where p.marca = any(public.teeds_marcas_em_foco(p_marca))
  group by p.user_id, c.nome, c.email order by sum(p.segundos) desc limit p_limite;
$$;

create or replace function public.teeds_insights_aulas(p_marca text default 'teeds', p_dias integer default 3650)
returns table(aula_id text, pessoas bigint, aberturas bigint, segundos bigint,
              concluiram bigint, posicao_media real, ultima_vez timestamptz)
language sql stable set search_path to 'public' as $$
  select aula_id, count(distinct user_id), sum(aberturas), sum(segundos),
         count(*) filter (where concluida), avg(posicao_max)::real, max(ultima_vez)
  from public.aulas_progresso
  where marca = any(public.teeds_marcas_em_foco(p_marca))
    and ultima_vez >= now() - make_interval(days => p_dias)
  group by aula_id;
$$;

create or replace function public.teeds_insights_dispositivos(p_marca text default 'teeds', p_dias integer default 30)
returns table(dispositivo text, pessoas bigint, acessos bigint)
language sql stable set search_path to 'public' as $$
  select coalesce(dispositivo, 'desconhecido'), count(distinct user_id), sum(acessos)
  from public.acessos_diarios
  where marca = any(public.teeds_marcas_em_foco(p_marca)) and dia >= current_date - p_dias
  group by 1 order by 3 desc;
$$;

create or replace function public.teeds_insights_horas(p_marca text default 'teeds', p_dias integer default 30)
returns table(hora smallint, acessos bigint)
language sql stable set search_path to 'public' as $$
  select h.hora::smallint, coalesce(sum(a.acessos),0)
  from generate_series(0, 23) as h(hora)
  left join public.acessos_horas a on a.marca = any(public.teeds_marcas_em_foco(p_marca))
       and a.hora = h.hora and a.dia >= current_date - p_dias
  group by h.hora order by h.hora;
$$;

create or replace function public.teeds_insights_localizacoes(p_marca text default 'teeds')
returns table(fuso text, idioma text, pessoas bigint, ativos_30d bigint)
language sql stable set search_path to 'public' as $$
  select coalesce(c.fuso_horario, ''), coalesce(c.idioma, ''), count(*),
         count(*) filter (where c.visto_em >= now() - interval '30 days')
  from public.clientes c
  where c.marca = any(public.teeds_marcas_em_foco(p_marca)) and c.total_acessos > 0
  group by 1, 2 order by 3 desc;
$$;
