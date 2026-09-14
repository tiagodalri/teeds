-- Insights: a plataforma passa a guardar o histórico do que os clientes fazem.
--
-- Até aqui a ficha do cliente tinha só totais (quantos acessos, quanto tempo,
-- fuso, idioma). Não dava para responder "quantas pessoas entraram ontem",
-- "em que horário a plataforma é mais usada", "quem assistiu a aula 2 e até
-- onde". Estas tabelas guardam isso, agregado por dia — sem gravar cada
-- clique, e sem IP: a localização é aproximada pelo fuso horário que o
-- próprio navegador informa.
--
-- Aplicada em 14/09/2026 pelo MCP do Supabase (migração
-- `teeds_insights_telemetria_de_acessos_e_aulas`); esta é a cópia da receita.

create table if not exists public.acessos_diarios (
  marca text not null check (marca in ('teeds','omni')), user_id uuid not null, dia date not null,
  acessos integer not null default 0, segundos integer not null default 0, dispositivo text, fuso text,
  primary key (marca, user_id, dia));
create index if not exists acessos_diarios_marca_dia_idx on public.acessos_diarios (marca, dia desc);
create table if not exists public.acessos_horas (
  marca text not null check (marca in ('teeds','omni')), dia date not null, hora smallint not null check (hora between 0 and 23),
  acessos integer not null default 0, primary key (marca, dia, hora));
create table if not exists public.aulas_progresso (
  marca text not null check (marca in ('teeds','omni')), user_id uuid not null, aula_id text not null,
  aberturas integer not null default 0, segundos integer not null default 0, posicao_max real not null default 0,
  concluida boolean not null default false, primeira_vez timestamptz not null default now(), ultima_vez timestamptz not null default now(),
  primary key (marca, user_id, aula_id));
create index if not exists aulas_progresso_marca_aula_idx on public.aulas_progresso (marca, aula_id);
alter table public.acessos_diarios enable row level security;
alter table public.acessos_horas   enable row level security;
alter table public.aulas_progresso enable row level security;
create policy "admin da marca le acessos" on public.acessos_diarios for select to authenticated using (public.teeds_sou_admin_da(marca));
create policy "admin da marca le horas" on public.acessos_horas for select to authenticated using (public.teeds_sou_admin_da(marca));
create policy "admin da marca le progresso" on public.aulas_progresso for select to authenticated using (public.teeds_sou_admin_da(marca));
create policy "cada um ve o proprio progresso" on public.aulas_progresso for select to authenticated using (user_id = auth.uid());

-- teeds_registrar_acesso ganha p_dispositivo e passa a gravar por dia e por hora (no fuso do cliente).
drop function if exists public.teeds_registrar_acesso(text, text, integer, text, text);
create or replace function public.teeds_registrar_acesso(p_marca text, p_sessao text, p_segundos integer default 0, p_fuso text default null, p_idioma text default null, p_dispositivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_nova boolean; v_delta integer; v_fuso text; v_agora timestamp; v_dia date;
begin
  if auth.uid() is null or p_marca not in ('teeds','omni') or length(coalesce(p_sessao,'')) < 8 then raise exception 'acesso invalido'; end if;
  select sessao_atual is distinct from p_sessao into v_nova from public.clientes where user_id = auth.uid() and marca = p_marca;
  if v_nova is null then return; end if;
  select case when v_nova then greatest(0, least(coalesce(p_segundos,0), 300)) else greatest(0, least(coalesce(p_segundos,0) - sessao_atual_segundos, 300)) end
    into v_delta from public.clientes where user_id = auth.uid() and marca = p_marca;
  update public.clientes set visto_em = now(), total_acessos = total_acessos + case when v_nova then 1 else 0 end,
    tempo_total_segundos = tempo_total_segundos + v_delta, sessao_atual = p_sessao, sessao_atual_segundos = greatest(0, coalesce(p_segundos,0)),
    fuso_horario = left(coalesce(p_fuso, fuso_horario), 80), idioma = left(coalesce(p_idioma, idioma), 30)
  where user_id = auth.uid() and marca = p_marca;
  v_fuso := coalesce(nullif(p_fuso,''), 'America/Sao_Paulo');
  begin v_agora := now() at time zone v_fuso; exception when others then v_agora := now() at time zone 'America/Sao_Paulo'; end;
  v_dia := v_agora::date;
  insert into public.acessos_diarios (marca, user_id, dia, acessos, segundos, dispositivo, fuso)
  values (p_marca, auth.uid(), v_dia, case when v_nova then 1 else 0 end, v_delta, left(p_dispositivo, 20), left(p_fuso, 80))
  on conflict (marca, user_id, dia) do update set acessos = acessos_diarios.acessos + excluded.acessos, segundos = acessos_diarios.segundos + excluded.segundos,
    dispositivo = coalesce(excluded.dispositivo, acessos_diarios.dispositivo), fuso = coalesce(excluded.fuso, acessos_diarios.fuso);
  if v_nova then
    insert into public.acessos_horas (marca, dia, hora, acessos) values (p_marca, v_dia, extract(hour from v_agora)::smallint, 1)
    on conflict (marca, dia, hora) do update set acessos = acessos_horas.acessos + 1;
  end if;
end $$;
revoke all on function public.teeds_registrar_acesso(text,text,integer,text,text,text) from public, anon;
grant execute on function public.teeds_registrar_acesso(text,text,integer,text,text,text) to authenticated;

create or replace function public.teeds_registrar_aula(p_marca text, p_aula text, p_segundos integer default 0, p_posicao real default 0, p_concluida boolean default false, p_abriu boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_marca not in ('teeds','omni') or length(coalesce(p_aula,'')) = 0 then raise exception 'aula invalida'; end if;
  insert into public.aulas_progresso (marca, user_id, aula_id, aberturas, segundos, posicao_max, concluida)
  values (p_marca, auth.uid(), left(p_aula, 60), case when p_abriu then 1 else 0 end, greatest(0, least(coalesce(p_segundos,0), 120)), greatest(0, least(coalesce(p_posicao,0), 1)), coalesce(p_concluida,false))
  on conflict (marca, user_id, aula_id) do update set aberturas = aulas_progresso.aberturas + excluded.aberturas, segundos = aulas_progresso.segundos + excluded.segundos,
    posicao_max = greatest(aulas_progresso.posicao_max, excluded.posicao_max), concluida = aulas_progresso.concluida or excluded.concluida, ultima_vez = now();
end $$;
revoke all on function public.teeds_registrar_aula(text,text,integer,real,boolean,boolean) from public, anon;
grant execute on function public.teeds_registrar_aula(text,text,integer,real,boolean,boolean) to authenticated;

-- Leituras do painel Insights: só respondem ao admin da marca.
create or replace function public.teeds_insights_resumo(p_marca text default 'teeds', p_dias integer default 30) returns json language sql security invoker stable set search_path = public as $$
  select case when not public.teeds_sou_admin_da(p_marca) then null else json_build_object(
    'clientes', (select count(*) from public.clientes where marca = p_marca),
    'novos', (select count(*) from public.clientes where marca = p_marca and criado_em >= now() - make_interval(days => p_dias)),
    'ativos', (select count(distinct user_id) from public.acessos_diarios where marca = p_marca and dia >= current_date - p_dias),
    'ativos_hoje', (select count(distinct user_id) from public.acessos_diarios where marca = p_marca and dia = current_date),
    'acessos', (select coalesce(sum(acessos),0) from public.acessos_diarios where marca = p_marca and dia >= current_date - p_dias),
    'segundos', (select coalesce(sum(segundos),0) from public.acessos_diarios where marca = p_marca and dia >= current_date - p_dias),
    'aulas_pessoas', (select count(distinct user_id) from public.aulas_progresso where marca = p_marca and ultima_vez >= now() - make_interval(days => p_dias)),
    'aulas_segundos', (select coalesce(sum(segundos),0) from public.aulas_progresso where marca = p_marca and ultima_vez >= now() - make_interval(days => p_dias)),
    'aulas_concluidas', (select count(*) from public.aulas_progresso where marca = p_marca and concluida and ultima_vez >= now() - make_interval(days => p_dias)),
    'com_deriv', (select count(distinct user_id) from public.contas_deriv where marca = p_marca)) end; $$;
create or replace function public.teeds_insights_acessos_dia(p_marca text default 'teeds', p_dias integer default 30) returns table (dia date, pessoas bigint, acessos bigint, segundos bigint) language sql security invoker stable set search_path = public as $$
  select d.dia, count(distinct a.user_id), coalesce(sum(a.acessos),0), coalesce(sum(a.segundos),0)
  from generate_series(current_date - (p_dias - 1), current_date, '1 day') as d(dia)
  left join public.acessos_diarios a on a.marca = p_marca and a.dia = d.dia
  where public.teeds_sou_admin_da(p_marca) group by d.dia order by d.dia; $$;
create or replace function public.teeds_insights_horas(p_marca text default 'teeds', p_dias integer default 30) returns table (hora smallint, acessos bigint) language sql security invoker stable set search_path = public as $$
  select h.hora::smallint, coalesce(sum(a.acessos),0) from generate_series(0, 23) as h(hora)
  left join public.acessos_horas a on a.marca = p_marca and a.hora = h.hora and a.dia >= current_date - p_dias
  where public.teeds_sou_admin_da(p_marca) group by h.hora order by h.hora; $$;
create or replace function public.teeds_insights_aulas(p_marca text default 'teeds', p_dias integer default 3650) returns table (aula_id text, pessoas bigint, aberturas bigint, segundos bigint, concluiram bigint, posicao_media real, ultima_vez timestamptz) language sql security invoker stable set search_path = public as $$
  select aula_id, count(distinct user_id), sum(aberturas), sum(segundos), count(*) filter (where concluida), avg(posicao_max)::real, max(ultima_vez)
  from public.aulas_progresso where marca = p_marca and ultima_vez >= now() - make_interval(days => p_dias) and public.teeds_sou_admin_da(p_marca) group by aula_id; $$;
create or replace function public.teeds_insights_localizacoes(p_marca text default 'teeds') returns table (fuso text, idioma text, pessoas bigint, ativos_30d bigint) language sql security invoker stable set search_path = public as $$
  select coalesce(c.fuso_horario, ''), coalesce(c.idioma, ''), count(*), count(*) filter (where c.visto_em >= now() - interval '30 days')
  from public.clientes c where c.marca = p_marca and c.total_acessos > 0 and public.teeds_sou_admin_da(p_marca) group by 1, 2 order by 3 desc; $$;
create or replace function public.teeds_insights_dispositivos(p_marca text default 'teeds', p_dias integer default 30) returns table (dispositivo text, pessoas bigint, acessos bigint) language sql security invoker stable set search_path = public as $$
  select coalesce(dispositivo, 'desconhecido'), count(distinct user_id), sum(acessos) from public.acessos_diarios
  where marca = p_marca and dia >= current_date - p_dias and public.teeds_sou_admin_da(p_marca) group by 1 order by 3 desc; $$;
create or replace function public.teeds_insights_alunos(p_marca text default 'teeds', p_limite integer default 30) returns table (user_id uuid, nome text, email text, aulas_vistas bigint, aulas_concluidas bigint, segundos bigint, ultima_vez timestamptz) language sql security invoker stable set search_path = public as $$
  select p.user_id, c.nome, c.email, count(*), count(*) filter (where p.concluida), sum(p.segundos), max(p.ultima_vez)
  from public.aulas_progresso p join public.clientes c on c.user_id = p.user_id and c.marca = p.marca
  where p.marca = p_marca and public.teeds_sou_admin_da(p_marca) group by p.user_id, c.nome, c.email order by sum(p.segundos) desc limit p_limite; $$;
do $$ declare f text; begin
  for f in select 'public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'teeds_insights_%' loop
    execute 'revoke all on function ' || f || ' from public, anon'; execute 'grant execute on function ' || f || ' to authenticated';
  end loop; end $$;
