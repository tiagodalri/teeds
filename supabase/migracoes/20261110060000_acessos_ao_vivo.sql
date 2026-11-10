-- Acessos ao vivo (10/11/2026): cada visita à plataforma vira uma linha, e o admin vê
-- quem está online, quantos entraram nos últimos minutos, as visitas recentes e quem
-- usou hoje.
--
-- Visita = uma abertura do app (a `sessao` que o navegador sorteia ao carregar). A
-- presença já grava a cada minuto com a aba visível (teeds_registrar_acesso); aqui ela
-- chama também teeds_registrar_visita, que mantém o início, o último sinal e a duração de cada visita.

create table if not exists public.acessos_visitas (
  marca text not null,
  sessao text not null,
  user_id uuid not null,
  inicio timestamptz not null,
  visto_em timestamptz not null,
  segundos integer not null default 0,
  dispositivo text,
  primeira boolean not null default false,
  primary key (marca, sessao)
);
create index if not exists acessos_visitas_marca_visto on public.acessos_visitas (marca, visto_em desc);
create index if not exists acessos_visitas_user on public.acessos_visitas (user_id, visto_em desc);
alter table public.acessos_visitas enable row level security;
-- sem política: só as funções do banco (security definer) leem e escrevem
revoke all on public.acessos_visitas from anon, authenticated;

-- Chamada pelo app logo depois da presença (a cada minuto com a aba visível). Separada de
-- teeds_registrar_acesso de propósito: se falhar, a presença não sente.
create or replace function public.teeds_registrar_visita(p_marca text, p_sessao text, p_segundos integer default 0, p_dispositivo text default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_seg integer := greatest(0, least(coalesce(p_segundos, 0), 86400)); v_total integer;
begin
  if auth.uid() is null or p_marca not in ('teeds','omni','globalfly') or length(coalesce(p_sessao,'')) < 8 then return; end if;
  select total_acessos into v_total from public.clientes where user_id = auth.uid() and marca = p_marca;
  if not found then return; end if;
  insert into public.acessos_visitas (marca, sessao, user_id, inicio, visto_em, segundos, dispositivo, primeira)
  values (p_marca, left(p_sessao, 80), auth.uid(), now() - make_interval(secs => v_seg), now(), v_seg,
          left(p_dispositivo, 20), coalesce(v_total, 0) <= 1)
  on conflict (marca, sessao) do update
    set visto_em = now(),
        segundos = greatest(acessos_visitas.segundos, excluded.segundos),
        dispositivo = coalesce(excluded.dispositivo, acessos_visitas.dispositivo)
    where acessos_visitas.user_id = excluded.user_id;
end $function$;
revoke all on function public.teeds_registrar_visita(text, text, integer, text) from public, anon;
grant execute on function public.teeds_registrar_visita(text, text, integer, text) to authenticated;

-- O painel. Mesmas regras do "Quem está online": só a administração plena da marca, e o
-- admin do parceiro só recebe os clientes dele (teeds_parceiro_forcado). Administradores
-- não entram na contagem.
create or replace function public.teeds_acessos_ao_vivo(p_marca text, p_parceiro text default null, p_horas integer default 24)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_par text;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_horas integer := greatest(1, least(coalesce(p_horas, 24), 24 * 31));
  v_res jsonb;
begin
  if not public.teeds_admin_pleno_da(p_marca) then raise exception 'Só a administração vê os acessos'; end if;
  v_par := nullif(trim(coalesce(public.teeds_parceiro_forcado(p_marca), p_parceiro, '')), '');

  with base as (
    select c.* from public.clientes c
     where c.marca = p_marca
       and not exists (select 1 from public.administradores a where a.user_id = c.user_id)
       and (v_par is null or (v_par = 'direto' and c.parceiro is null) or c.parceiro = v_par)
  ),
  ult_visita as (
    select distinct on (v.user_id) v.user_id, v.inicio, v.segundos, v.dispositivo
      from public.acessos_visitas v join base b on b.user_id = v.user_id
     where v.marca = p_marca and v.visto_em >= now() - interval '10 minutes'
     order by v.user_id, v.visto_em desc
  ),
  hoje as (
    select d.* from public.acessos_diarios d join base b on b.user_id = d.user_id
     where d.marca = p_marca and d.dia = v_hoje
  )
  select jsonb_build_object(
    'agora', now(),
    'parceiro', v_par,
    'online', (select count(*) from base where visto_em >= now() - interval '3 minutes'),
    'm15', (select count(*) from base where visto_em >= now() - interval '15 minutes'),
    'h1', (select count(*) from base where visto_em >= now() - interval '1 hour'),
    'h24', (select count(*) from base where visto_em >= now() - interval '24 hours'),
    'hoje_pessoas', (select count(*) from hoje),
    'hoje_acessos', (select coalesce(sum(acessos), 0) from hoje),
    'hoje_segundos', (select coalesce(sum(segundos), 0) from hoje),
    'novos_hoje', (select count(*) from base where (criado_em at time zone 'America/Sao_Paulo')::date = v_hoje),
    'visitas_desde', (select min(inicio) from public.acessos_visitas where marca = p_marca),
    'lista_online', (select coalesce(jsonb_agg(x order by x.visto_em desc), '[]'::jsonb) from (
        select b.user_id, b.nome, b.email, b.parceiro, b.plano_id, pm.nome as plano, b.visto_em, b.criado_em,
               b.total_acessos, b.cidade, b.regiao,
               uv.inicio as visita_inicio, uv.segundos as visita_segundos,
               coalesce(uv.dispositivo, h.dispositivo) as dispositivo,
               coalesce(h.segundos, 0) as segundos_hoje, coalesce(h.acessos, 0) as acessos_hoje
          from base b
          left join public.planos_da_marca pm on pm.marca = b.marca and pm.plano_id = b.plano_id
          left join ult_visita uv on uv.user_id = b.user_id
          left join hoje h on h.user_id = b.user_id
         where b.visto_em >= now() - interval '3 minutes'
         order by b.visto_em desc limit 500) x),
    'visitas', (select coalesce(jsonb_agg(x order by x.inicio desc), '[]'::jsonb) from (
        select v.sessao, v.user_id, b.nome, b.email, b.parceiro, b.plano_id, pm.nome as plano, b.criado_em,
               v.inicio, v.visto_em, v.segundos, v.dispositivo, v.primeira
          from public.acessos_visitas v
          join base b on b.user_id = v.user_id
          left join public.planos_da_marca pm on pm.marca = b.marca and pm.plano_id = b.plano_id
         where v.marca = p_marca and v.visto_em >= now() - make_interval(hours => v_horas)
         order by v.inicio desc limit 1500) x),
    'hoje_lista', (select coalesce(jsonb_agg(x order by x.visto_em desc), '[]'::jsonb) from (
        select b.user_id, b.nome, b.email, b.parceiro, b.plano_id, pm.nome as plano, b.criado_em, b.visto_em,
               b.total_acessos, h.acessos, h.segundos, h.dispositivo
          from hoje h join base b on b.user_id = h.user_id
          left join public.planos_da_marca pm on pm.marca = b.marca and pm.plano_id = b.plano_id
         order by b.visto_em desc limit 2000) x),
    -- entradas por hora (hora do cliente): a tabela é da marca inteira, então só sem filtro de parceiro
    'horas', case when v_par is null then (select coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'hora', hora, 'acessos', acessos)), '[]'::jsonb)
        from public.acessos_horas where marca = p_marca and dia >= v_hoje - 1) else null end
  ) into v_res;
  return v_res;
end $function$;

revoke all on function public.teeds_acessos_ao_vivo(text, text, integer) from public, anon;
grant execute on function public.teeds_acessos_ao_vivo(text, text, integer) to authenticated;
